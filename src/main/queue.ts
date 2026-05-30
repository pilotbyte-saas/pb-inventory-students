import { app } from 'electron'
import { join } from 'node:path'
import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs'
import type { Transaction } from '@shared/types'

// Tracks what still needs to reach the backend:
//  - transactions: an append queue (each is a distinct new row)
//  - dirty: per-collection flags for the snapshot collections (items, batches,
//    templates). Each carries a version so a sync can tell whether new local
//    edits arrived while it was in flight, and never clears the flag over them.

interface DirtyState {
  dirty: boolean
  version: number
}

interface QueueData {
  transactions: Transaction[]
  dirty: Record<string, DirtyState>
}

let cached: QueueData | null = null

function queuePath(): string {
  return join(app.getPath('userData'), 'queue.json')
}

function empty(): QueueData {
  return { transactions: [], dirty: {} }
}

function load(): QueueData {
  if (cached) return cached
  try {
    if (existsSync(queuePath())) {
      const raw = JSON.parse(readFileSync(queuePath(), 'utf8')) as Partial<QueueData> & {
        itemsDirty?: boolean
        itemsVersion?: number
      }
      const data: QueueData = { transactions: raw.transactions ?? [], dirty: raw.dirty ?? {} }
      // Migrate the old single items-dirty shape.
      if (raw.dirty === undefined && raw.itemsDirty) {
        data.dirty.items = { dirty: true, version: raw.itemsVersion ?? 1 }
      }
      cached = data
    } else {
      cached = empty()
    }
  } catch {
    cached = empty()
  }
  return cached
}

function save(data: QueueData): void {
  const tmp = queuePath() + '.tmp'
  writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8')
  renameSync(tmp, queuePath())
  cached = data
}

function stateFor(data: QueueData, collection: string): DirtyState {
  if (!data.dirty[collection]) data.dirty[collection] = { dirty: false, version: 0 }
  return data.dirty[collection]
}

export function enqueueTransaction(txn: Transaction): void {
  const d = load()
  d.transactions.push(txn)
  save(d)
}

export function getPendingTransactions(): Transaction[] {
  return load().transactions.slice()
}

export function removeTransactions(ids: string[]): void {
  const remove = new Set(ids)
  const d = load()
  d.transactions = d.transactions.filter((t) => !remove.has(t.id))
  save(d)
}

export function markDirty(collection: string): void {
  const d = load()
  const s = stateFor(d, collection)
  s.dirty = true
  s.version += 1
  save(d)
}

export function getVersion(collection: string): number {
  return stateFor(load(), collection).version
}

export function isDirty(collection: string): boolean {
  return stateFor(load(), collection).dirty
}

// Only clear if no new edits to this collection arrived since `version`.
export function clearDirtyIfUnchanged(collection: string, version: number): void {
  const d = load()
  const s = stateFor(d, collection)
  if (s.dirty && s.version === version) {
    s.dirty = false
    save(d)
  }
}

export function pendingCount(): number {
  const d = load()
  const dirtyCount = Object.values(d.dirty).filter((s) => s.dirty).length
  return d.transactions.length + dirtyCount
}
