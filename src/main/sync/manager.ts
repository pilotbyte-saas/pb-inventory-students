import type {
  ConflictItem,
  ConflictResolution,
  Item,
  SyncState,
  SyncStatus,
  Transaction
} from '@shared/types'
import * as config from '../config'
import * as cache from '../cache'
import * as queue from '../queue'
import { now, round2 } from '../util'
import { DynamoDbAdapter } from './dynamodb'
import type { SyncAdapter } from './SyncAdapter'

const LOCAL_MSG = 'Local only — changes are saved on this device. Switch to AWS DynamoDB to sync.'
const UNCONFIGURED_MSG = 'Add your AWS keys in Settings to sync to the cloud.'
const INTERVAL_MS = 60_000

function friendlyError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err)
  const lc = raw.toLowerCase()
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
    return 'The DynamoDB table was not found and could not be created. Create it or grant CreateTable permission.'
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
    return 'Network problem reaching AWS. Check your internet connection and press Sync now.'
  }
  return raw
}

let adapter: SyncAdapter | null = null
let adapterSig = ''

let state: SyncState = 'local'
let lastSyncedAt: string | null = null
let message: string | undefined = LOCAL_MSG

let syncing = false
let intervalTimer: NodeJS.Timeout | null = null
let debounceTimer: NodeJS.Timeout | null = null
let notifier: ((status: SyncStatus) => void) | null = null

// Conflicts awaiting the user's decision, and ids resolved this cycle (so the
// re-sync after resolution doesn't immediately re-flag them).
let currentConflicts: ConflictItem[] = []
const recentlyResolved = new Set<string>()

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

// Newest-updatedAt-per-id merge; union keeps records present on only one side.
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

// -------------------------------------------------------------- conflict detection

function normKey(i: { name: string; sku: string }): string {
  return `${i.name.trim().toLowerCase()}|${i.sku.trim().toLowerCase()}`
}

function contentDiffers(a: Item, b: Item): boolean {
  return (
    a.name !== b.name ||
    a.sku !== b.sku ||
    a.category !== b.category ||
    a.unit !== b.unit ||
    a.reorderThreshold !== b.reorderThreshold ||
    a.unitCost !== b.unitCost ||
    (a.reorderUrl ?? '') !== (b.reorderUrl ?? '') ||
    (a.supplier ?? '') !== (b.supplier ?? '') ||
    (a.notes ?? '') !== (b.notes ?? '')
  )
}

function changedSinceLastSync(updatedAt: string): boolean {
  if (!lastSyncedAt) return false // first sync: don't flag divergence, only duplicates
  return updatedAt > lastSyncedAt
}

function detectConflicts(remoteItems: Item[], localItems: Item[]): ConflictItem[] {
  const remoteById = new Map(remoteItems.map((r) => [r.id, r]))
  const remoteByKey = new Map<string, Item>()
  for (const r of remoteItems) if (!r.deleted) remoteByKey.set(normKey(r), r)

  const conflicts: ConflictItem[] = []
  for (const l of localItems) {
    if (l.deleted || recentlyResolved.has(l.id)) continue
    const r = remoteById.get(l.id)
    if (r) {
      if (
        !r.deleted &&
        contentDiffers(l, r) &&
        changedSinceLastSync(l.updatedAt) &&
        changedSinceLastSync(r.updatedAt)
      ) {
        conflicts.push({
          type: 'divergent',
          local: l,
          remote: r,
          reason: 'Edited on this device and in the cloud since the last sync.'
        })
      }
    } else {
      const match = remoteByKey.get(normKey(l))
      if (match && match.id !== l.id) {
        conflicts.push({
          type: 'duplicate',
          local: l,
          remote: match,
          reason: 'Same name/SKU as an item already in the cloud.'
        })
      }
    }
  }
  return conflicts
}

export function getConflicts(): ConflictItem[] {
  return currentConflicts
}

export function resolveConflicts(resolutions: ConflictResolution[]): void {
  for (const res of resolutions) {
    const items = cache.readItems()
    const localIdx = items.findIndex((i) => i.id === res.localId)
    if (localIdx === -1) continue
    const local = items[localIdx]
    const conflict = currentConflicts.find(
      (c) => c.local.id === res.localId && c.remote.id === res.remoteId
    )

    if (res.action === 'merge') {
      // Fold local into remote: re-point ledger entries, drop the local item,
      // recompute the remote item's quantity from the combined ledger.
      const txns = cache.readTransactions()
      for (const t of txns) if (t.itemId === res.localId) t.itemId = res.remoteId
      cache.writeTransactions(txns)
      queue.repointTransactions(res.localId, res.remoteId)

      const next = items.filter((i) => i.id !== res.localId)
      let remote = next.find((i) => i.id === res.remoteId)
      if (!remote && conflict) {
        remote = { ...conflict.remote }
        next.push(remote)
      }
      if (remote) {
        const sum = cache
          .readTransactions()
          .reduce((s, t) => s + (t.itemId === res.remoteId ? t.quantity : 0), 0)
        remote.quantity = round2(sum)
        remote.updatedAt = now()
      }
      cache.writeItems(next)
    } else if (res.action === 'keepRemote') {
      // Discard the local edit; adopt the cloud version.
      if (conflict) {
        items[localIdx] = { ...conflict.remote }
        cache.writeItems(items)
      }
    } else {
      // keepNew / keepLocal: local wins. Bump updatedAt so it pushes.
      items[localIdx] = { ...local, updatedAt: now() }
      cache.writeItems(items)
    }

    recentlyResolved.add(res.localId)
    recentlyResolved.add(res.remoteId)
  }

  queue.markDirty('items')
  currentConflicts = []
  requestSync(0)
}

// -------------------------------------------------------------- sync

export async function sync(): Promise<void> {
  if (syncing) return

  if (config.getBackend() === 'local') {
    setState('local', LOCAL_MSG)
    return
  }
  const a = buildAdapter()
  if (!a) {
    setState('offline', UNCONFIGURED_MSG)
    return
  }

  syncing = true
  setState('syncing', 'Syncing…')
  try {
    const pulled = await a.pull()

    // Before pushing local changes, look for clashes and pause for the user.
    const conflicts = detectConflicts(pulled.items, cache.readItems())
    if (conflicts.length > 0) {
      currentConflicts = conflicts
      const n = conflicts.length
      setState('conflict', `${n} item conflict${n === 1 ? '' : 's'} need review before syncing.`)
      return
    }

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

    cache.writeItems(mergeByUpdatedAt(pulled.items, cache.readItems()))
    cache.writeBatches(mergeByUpdatedAt(pulled.batches, cache.readBatches()))
    cache.writeTemplates(mergeByUpdatedAt(pulled.templates, cache.readTemplates()))
    cache.writeTransactions(
      dedupeAndSort([...pulled.transactions, ...pending, ...queue.getPendingTransactions()])
    )

    lastSyncedAt = new Date().toISOString()
    recentlyResolved.clear()
    currentConflicts = []
    setState('synced', undefined)
  } catch (err) {
    console.error('[sync] failed:', err instanceof Error ? err.message : String(err))
    setState('error', friendlyError(err))
  } finally {
    syncing = false
  }
}

export function requestSync(delayMs = 1500): void {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    debounceTimer = null
    void sync()
  }, delayMs)
}

export async function testConnection(): Promise<{ ok: boolean; error?: string }> {
  if (config.getBackend() === 'local') {
    return { ok: false, error: 'Currently in Local-only mode. Switch to AWS DynamoDB to connect.' }
  }
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

export function reconfigure(): void {
  adapter = null
  adapterSig = ''
  requestSync(0)
}

export function start(): void {
  void sync()
  if (intervalTimer) clearInterval(intervalTimer)
  intervalTimer = setInterval(() => void sync(), INTERVAL_MS)
}
