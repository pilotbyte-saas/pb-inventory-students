import type { SyncState, SyncStatus, Transaction } from '@shared/types'
import * as config from '../config'
import * as cache from '../cache'
import * as queue from '../queue'
import { GoogleSheetsAdapter } from './sheets'
import { DynamoDbAdapter } from './dynamodb'
import type { SyncAdapter } from './SyncAdapter'

const UNCONFIGURED_MSG = 'Not configured — add your key and spreadsheet ID in Settings.'
const INTERVAL_MS = 60_000

// Map the common Google API / auth failures to a plain-English next step.
function friendlyError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err)
  const lc = raw.toLowerCase()
  if (lc.includes('unable to parse range')) {
    return 'Could not read the Items/Transactions tabs. Check that the spreadsheet ID is correct.'
  }
  if (lc.includes('permission') || lc.includes('forbidden') || lc.includes('403')) {
    return 'Permission denied. Open the Sheet → Share, and add the service account email (shown in Settings) as an Editor.'
  }
  if (
    lc.includes('has not been used') ||
    lc.includes('accessnotconfigured') ||
    lc.includes('service_disabled') ||
    lc.includes('it is disabled')
  ) {
    return 'The Google Sheets API is not enabled for this project. Enable “Google Sheets API” in the Google Cloud Console, then try again.'
  }
  if (
    lc.includes('requested entity was not found') ||
    lc.includes('not found') ||
    lc.includes('404')
  ) {
    return 'Spreadsheet not found. Double-check the spreadsheet ID — it is the part of the Sheet URL between /d/ and /edit.'
  }
  if (
    lc.includes('invalid_grant') ||
    lc.includes('invalid jwt') ||
    lc.includes('decoder') ||
    lc.includes('1e08010c') ||
    lc.includes('err_ossl') ||
    lc.includes('private key')
  ) {
    return 'The service account key looks malformed (or the system clock is wrong). Re-download the JSON key from Google Cloud and load it again in Settings.'
  }
  // AWS DynamoDB
  if (
    lc.includes('unrecognizedclient') ||
    lc.includes('invalidsignature') ||
    lc.includes('security token') ||
    lc.includes('signaturedoesnotmatch')
  ) {
    return 'AWS rejected the credentials. Double-check the Access Key ID and Secret Access Key in Settings.'
  }
  if (
    lc.includes('accessdenied') ||
    lc.includes('not authorized') ||
    lc.includes('is not authorized to perform')
  ) {
    return 'AWS denied the request. The IAM user needs DynamoDB permissions (DescribeTable, CreateTable, Query, PutItem) on the table.'
  }
  if (lc.includes('resourcenotfound')) {
    return 'The DynamoDB table was not found and could not be created. Create it manually or grant CreateTable permission.'
  }
  if (
    lc.includes('could not load credentials') ||
    lc.includes('credential is missing') ||
    lc.includes('resolve credentials')
  ) {
    return 'AWS credentials are missing. Enter your Access Key ID and Secret Access Key in Settings.'
  }
  if (
    lc.includes('enotfound') ||
    lc.includes('eai_again') ||
    lc.includes('etimedout') ||
    lc.includes('econnreset') ||
    lc.includes('network') ||
    lc.includes('socket')
  ) {
    return 'Network problem reaching the server. Check your internet connection and press Sync now.'
  }
  return raw
}

let adapter: SyncAdapter | null = null
let adapterSig = '' // detects credential/spreadsheet changes to rebuild the client

let state: SyncState = 'offline'
let lastSyncedAt: string | null = null
let message: string | undefined = UNCONFIGURED_MSG

let syncing = false
let intervalTimer: NodeJS.Timeout | null = null
let debounceTimer: NodeJS.Timeout | null = null
let notifier: ((status: SyncStatus) => void) | null = null

export function getStatus(): SyncStatus {
  return { state, lastSyncedAt, pending: queue.pendingCount(), message }
}

export function setNotifier(fn: (status: SyncStatus) => void): void {
  notifier = fn
}

function emit(): void {
  if (notifier) notifier(getStatus())
}

function setState(next: SyncState, msg?: string): void {
  state = next
  message = msg
  emit()
}

function buildAdapter(): SyncAdapter | null {
  const backend = config.getBackend()

  if (backend === 'dynamodb') {
    const aws = config.getFullAwsConfig()
    if (!aws) {
      adapter = null
      adapterSig = ''
      return null
    }
    const sig = `dynamodb:${aws.region}:${aws.tableName}:${aws.accessKeyId}`
    if (!adapter || adapterSig !== sig) {
      adapter = new DynamoDbAdapter(aws)
      adapterSig = sig
    }
    return adapter
  }

  // Default: Google Sheets
  const keyJson = config.getKeyJson()
  const spreadsheetId = config.getSpreadsheetId()
  if (!keyJson || !spreadsheetId) {
    adapter = null
    adapterSig = ''
    return null
  }
  const sig = `sheets:${spreadsheetId}:${keyJson.length}`
  if (!adapter || adapterSig !== sig) {
    adapter = new GoogleSheetsAdapter(keyJson, spreadsheetId)
    adapterSig = sig
  }
  return adapter
}

// Merge by newest updatedAt per id; the union keeps records present on only one
// side. This is what lets multiple devices converge — whoever edited a record
// most recently wins for it, independent of edits to other records.
function mergeByUpdatedAt<T extends { id: string; updatedAt: string }>(
  remote: T[],
  local: T[]
): T[] {
  const map = new Map<string, T>()
  for (const r of remote) map.set(r.id, r)
  for (const l of local) {
    const existing = map.get(l.id)
    if (!existing || l.updatedAt >= existing.updatedAt) map.set(l.id, l)
  }
  return [...map.values()]
}

function dedupeAndSort(txns: Transaction[]): Transaction[] {
  const seen = new Set<string>()
  const out: Transaction[] = []
  for (const t of txns) {
    if (t.id && seen.has(t.id)) continue
    if (t.id) seen.add(t.id)
    out.push(t)
  }
  return out.sort((a, b) => (a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0))
}

export async function sync(): Promise<void> {
  if (syncing) return
  const a = buildAdapter()
  if (!a) {
    setState('offline', UNCONFIGURED_MSG)
    return
  }
  syncing = true
  setState('syncing', 'Syncing…')
  try {
    const pulled = await a.pull()
    const pending = queue.getPendingTransactions()

    const itemsDirty = queue.isDirty('items')
    const itemsVersion = queue.getVersion('items')
    const batchesDirty = queue.isDirty('batches')
    const batchesVersion = queue.getVersion('batches')
    const templatesDirty = queue.isDirty('templates')
    const templatesVersion = queue.getVersion('templates')

    const items = mergeByUpdatedAt(pulled.items, cache.readItems())
    const batches = mergeByUpdatedAt(pulled.batches, cache.readBatches())
    const templates = mergeByUpdatedAt(pulled.templates, cache.readTemplates())

    // Transactions are append-only; the snapshot collections push per-collection.
    if (pending.length) {
      await a.appendTransactions(pending)
      queue.removeTransactions(pending.map((p) => p.id))
    }
    if (itemsDirty) {
      await a.pushItems(items)
      queue.clearDirtyIfUnchanged('items', itemsVersion)
    }
    if (batchesDirty) {
      await a.pushBatches(batches)
      queue.clearDirtyIfUnchanged('batches', batchesVersion)
    }
    if (templatesDirty) {
      await a.pushTemplates(templates)
      queue.clearDirtyIfUnchanged('templates', templatesVersion)
    }

    // Re-merge from the freshest local state so edits made mid-sync survive.
    cache.writeItems(mergeByUpdatedAt(pulled.items, cache.readItems()))
    cache.writeBatches(mergeByUpdatedAt(pulled.batches, cache.readBatches()))
    cache.writeTemplates(mergeByUpdatedAt(pulled.templates, cache.readTemplates()))
    cache.writeTransactions(
      dedupeAndSort([...pulled.transactions, ...pending, ...queue.getPendingTransactions()])
    )

    lastSyncedAt = new Date().toISOString()
    setState('synced', undefined)
  } catch (err) {
    console.error('[sync] failed:', err instanceof Error ? err.message : String(err))
    setState('error', friendlyError(err))
  } finally {
    syncing = false
  }
}

// Used by the Settings "Test connection" button: build the client and do a real
// round-trip so the user sees the exact problem (and the tabs get created).
export async function testConnection(): Promise<{ ok: boolean; error?: string }> {
  const a = buildAdapter()
  if (!a) return { ok: false, error: UNCONFIGURED_MSG }
  try {
    await a.pull()
    return { ok: true }
  } catch (err) {
    console.error('[sync] test failed:', err instanceof Error ? err.message : String(err))
    return { ok: false, error: friendlyError(err) }
  }
}

// Debounced: rapid consume/restock clicks coalesce into one sync.
export function requestSync(delayMs = 1500): void {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    debounceTimer = null
    void sync()
  }, delayMs)
}

export function reconfigure(): void {
  adapter = null
  adapterSig = ''
  requestSync(0)
}

export function start(): void {
  void sync() // pull-on-start, then flush anything pending
  if (intervalTimer) clearInterval(intervalTimer)
  intervalTimer = setInterval(() => void sync(), INTERVAL_MS)
}
