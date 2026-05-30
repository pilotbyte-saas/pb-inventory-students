import { nanoid } from 'nanoid'
import type { Batch, BatchLine, NewBatchInput, Template } from '@shared/types'
import { now, round2 } from './util'
import * as cache from './cache'
import * as queue from './queue'
import * as manager from './sync/manager'
import { appendTransaction } from './inventory'

// Batches and templates. A batch records WHY/WHEN a set of items was consumed;
// the actual stock changes are normal consume transactions tagged with batchId,
// so the ledger stays the single source of truth for quantities.

function cleanLines(lines: BatchLine[] | undefined): BatchLine[] {
  return (lines ?? [])
    .filter((l) => l.itemId && Number(l.quantity) > 0)
    .map((l) => ({ itemId: l.itemId, quantity: Math.abs(Number(l.quantity) || 0) }))
}

export function getBatches(): Batch[] {
  return cache.readBatches()
}

export function getTemplates(): Template[] {
  return cache.readTemplates().filter((t) => !t.deleted)
}

export function consumeBatch(input: NewBatchInput): void {
  const lines = cleanLines(input.lines)
  if (lines.length === 0) throw new Error('Add at least one item to the batch.')

  const items = cache.readItems()
  const eventAt = input.timestamp || now()
  const recordedAt = now()
  const batchId = `batch-${nanoid(8)}`

  for (const line of lines) {
    const item = items.find((i) => i.id === line.itemId)
    if (!item) continue
    const applied = Math.min(line.quantity, Math.max(0, item.quantity))
    if (applied <= 0) continue
    item.quantity = round2(item.quantity - applied)
    item.updatedAt = recordedAt
    appendTransaction({
      id: nanoid(),
      itemId: item.id,
      type: 'consume',
      quantity: -applied,
      note: input.note?.trim() || undefined,
      timestamp: eventAt,
      batchId
    })
  }
  cache.writeItems(items)
  queue.markDirty('items')

  const batch: Batch = {
    id: batchId,
    timestamp: eventAt,
    category: input.category.trim() || 'Other',
    tags: (input.tags ?? []).map((t) => t.trim()).filter(Boolean),
    note: input.note?.trim() || undefined,
    status: 'active',
    createdAt: recordedAt,
    updatedAt: recordedAt
  }
  const batches = cache.readBatches()
  batches.push(batch)
  cache.writeBatches(batches)
  queue.markDirty('batches')

  manager.requestSync()
}

export function voidBatch(batchId: string): void {
  const batches = cache.readBatches()
  const batch = batches.find((b) => b.id === batchId)
  if (!batch) throw new Error('Batch not found.')
  if (batch.status === 'voided') return

  const items = cache.readItems()
  const recordedAt = now()
  // Reverse every consume entry that belongs to this batch (restore the stock).
  const consumes = cache.readTransactions().filter((t) => t.batchId === batchId && t.quantity < 0)
  for (const t of consumes) {
    const restore = Math.abs(t.quantity)
    const item = items.find((i) => i.id === t.itemId)
    if (item) {
      item.quantity = round2(item.quantity + restore)
      item.updatedAt = recordedAt
    }
    appendTransaction({
      id: nanoid(),
      itemId: t.itemId,
      type: 'adjust',
      quantity: restore,
      note: 'Undo batch',
      timestamp: recordedAt,
      batchId
    })
  }
  cache.writeItems(items)
  queue.markDirty('items')

  batch.status = 'voided'
  batch.updatedAt = recordedAt
  cache.writeBatches(batches)
  queue.markDirty('batches')

  manager.requestSync()
}

export function updateBatchMeta(
  batchId: string,
  patch: { timestamp?: string; category?: string; tags?: string[]; note?: string }
): void {
  const batches = cache.readBatches()
  const idx = batches.findIndex((b) => b.id === batchId)
  if (idx === -1) throw new Error('Batch not found.')
  const cur = batches[idx]
  batches[idx] = {
    ...cur,
    timestamp: patch.timestamp ?? cur.timestamp,
    category:
      patch.category !== undefined ? patch.category.trim() || 'Other' : cur.category,
    tags: patch.tags !== undefined ? patch.tags.map((t) => t.trim()).filter(Boolean) : cur.tags,
    note: patch.note !== undefined ? patch.note.trim() || undefined : cur.note,
    updatedAt: now()
  }
  cache.writeBatches(batches)
  queue.markDirty('batches')
  manager.requestSync()
}

// Undo a single (non-batch) transaction by appending a compensating entry.
export function reverseTransaction(txnId: string): void {
  const txn = cache.readTransactions().find((t) => t.id === txnId)
  if (!txn) throw new Error('Transaction not found.')
  const items = cache.readItems()
  const item = items.find((i) => i.id === txn.itemId)
  if (item) {
    item.quantity = round2(item.quantity - txn.quantity) // remove its effect
    item.updatedAt = now()
    cache.writeItems(items)
    queue.markDirty('items')
  }
  appendTransaction({
    id: nanoid(),
    itemId: txn.itemId,
    type: 'adjust',
    quantity: -txn.quantity,
    note: `Reversal of ${txn.type}`,
    timestamp: now(),
    batchId: txn.batchId
  })
  manager.requestSync()
}

export function saveTemplate(name: string, lines: BatchLine[]): void {
  const clean = cleanLines(lines)
  if (!name.trim()) throw new Error('Template name is required.')
  if (clean.length === 0) throw new Error('A template needs at least one item.')
  const templates = cache.readTemplates()
  const ts = now()
  templates.push({
    id: `tmpl-${nanoid(8)}`,
    name: name.trim(),
    lines: clean,
    createdAt: ts,
    updatedAt: ts
  })
  cache.writeTemplates(templates)
  queue.markDirty('templates')
  manager.requestSync()
}

export function updateTemplate(
  id: string,
  patch: { name?: string; lines?: BatchLine[] }
): void {
  const templates = cache.readTemplates()
  const idx = templates.findIndex((t) => t.id === id)
  if (idx === -1) throw new Error('Template not found.')
  const cur = templates[idx]
  templates[idx] = {
    ...cur,
    name: patch.name !== undefined ? patch.name.trim() || cur.name : cur.name,
    lines: patch.lines !== undefined ? cleanLines(patch.lines) : cur.lines,
    updatedAt: now()
  }
  cache.writeTemplates(templates)
  queue.markDirty('templates')
  manager.requestSync()
}

export function deleteTemplate(id: string): void {
  const templates = cache.readTemplates()
  const idx = templates.findIndex((t) => t.id === id)
  if (idx === -1) return
  // Soft-delete (tombstone) so the removal propagates to other devices.
  templates[idx] = { ...templates[idx], deleted: true, updatedAt: now() }
  cache.writeTemplates(templates)
  queue.markDirty('templates')
  manager.requestSync()
}
