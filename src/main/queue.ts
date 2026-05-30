import { app } from 'electron'
import { join } from 'node:path'
import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs'
import type { Transaction } from '@shared/types'

// Tracks what still needs to reach the Sheet:
//  - transactions: an append queue (each is a distinct new row)
//  - itemsDirty: a single flag, since pushing items rewrites the whole snapshot
// itemsVersion lets a sync tell whether new local edits arrived while it was
// in flight, so it never clears the dirty flag over un-synced changes.

interface QueueData {
  transactions: Transaction[]
  itemsDirty: boolean
  itemsVersion: number
}

let cached: QueueData | null = null

function queuePath(): string {
  return join(app.getPath('userData'), 'queue.json')
}

function empty(): QueueData {
  return { transactions: [], itemsDirty: false, itemsVersion: 0 }
}

function load(): QueueData {
  if (cached) return cached
  try {
    cached = existsSync(queuePath())
      ? { ...empty(), ...(JSON.parse(readFileSync(queuePath(), 'utf8')) as Partial<QueueData>) }
      : empty()
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

export function markItemsDirty(): void {
  const d = load()
  d.itemsDirty = true
  d.itemsVersion += 1
  save(d)
}

export function getItemsVersion(): number {
  return load().itemsVersion
}

export function isItemsDirty(): boolean {
  return load().itemsDirty
}

// Only clear if no new item edits arrived since the sync captured `version`.
export function clearItemsDirtyIfUnchanged(version: number): void {
  const d = load()
  if (d.itemsVersion === version && d.itemsDirty) {
    d.itemsDirty = false
    save(d)
  }
}

export function pendingCount(): number {
  const d = load()
  return d.transactions.length + (d.itemsDirty ? 1 : 0)
}
