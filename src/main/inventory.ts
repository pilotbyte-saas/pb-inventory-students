import { nanoid } from 'nanoid'
import type { Item, NewItemInput, Transaction, TransactionFilter } from '@shared/types'
import { now, round2, slug } from './util'
import * as cache from './cache'
import * as queue from './queue'
import * as manager from './sync/manager'

// Business logic: consume, receive, adjust. Each updates the cache and the
// queue, then triggers a (debounced) sync.

function sortByTime(txns: Transaction[]): Transaction[] {
  return txns.sort((a, b) => (a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0))
}

export function appendTransaction(txn: Transaction): void {
  const txns = cache.readTransactions()
  txns.push(txn)
  cache.writeTransactions(sortByTime(txns))
  queue.enqueueTransaction(txn)
}

function findItemOrThrow(items: Item[], id: string): Item {
  const item = items.find((i) => i.id === id)
  if (!item) throw new Error(`Item not found: ${id}`)
  return item
}

export function getItems(): Item[] {
  return cache.readItems()
}

export function getTransactions(filter?: TransactionFilter): Transaction[] {
  let txns = cache.readTransactions()
  if (filter) {
    if (filter.itemId) txns = txns.filter((t) => t.itemId === filter.itemId)
    if (filter.type) txns = txns.filter((t) => t.type === filter.type)
    if (filter.from) txns = txns.filter((t) => t.timestamp.slice(0, 10) >= filter.from!)
    if (filter.to) txns = txns.filter((t) => t.timestamp.slice(0, 10) <= filter.to!)
  }
  return txns
}

export function addItem(input: NewItemInput): void {
  const items = cache.readItems()
  const id = (input.id && input.id.trim()) || `${slug(input.name) || 'item'}-${nanoid(6)}`
  if (items.some((i) => i.id === id)) {
    throw new Error(`An item with id "${id}" already exists.`)
  }
  const ts = now()
  const quantity = Math.max(0, Number(input.quantity ?? 0))
  const unitCost = Math.max(0, Number(input.unitCost ?? 0))
  const item: Item = {
    id,
    name: input.name.trim(),
    sku: (input.sku ?? '').trim(),
    category: (input.category ?? '').trim(),
    unit: (input.unit ?? 'each').trim() || 'each',
    quantity,
    reorderThreshold: Math.max(0, Number(input.reorderThreshold ?? 0)),
    unitCost,
    reorderUrl: input.reorderUrl?.trim() || undefined,
    supplier: input.supplier?.trim() || undefined,
    notes: input.notes?.trim() || undefined,
    createdAt: ts,
    updatedAt: ts
  }
  items.push(item)
  cache.writeItems(items)
  queue.markDirty('items')
  if (quantity > 0) {
    appendTransaction({
      id: nanoid(),
      itemId: id,
      type: 'initial',
      quantity,
      unitCost,
      totalCost: round2(quantity * unitCost),
      note: 'Initial stock',
      timestamp: ts
    })
  }
  manager.requestSync()
}

export function updateItem(id: string, patch: Partial<Item>): void {
  const items = cache.readItems()
  const idx = items.findIndex((i) => i.id === id)
  if (idx === -1) throw new Error(`Item not found: ${id}`)
  const current = items[idx]
  // Quantity is managed through consume/receive/adjust, never a metadata edit.
  items[idx] = {
    ...current,
    ...patch,
    id: current.id,
    quantity: current.quantity,
    createdAt: current.createdAt,
    updatedAt: now()
  }
  cache.writeItems(items)
  queue.markDirty('items')
  manager.requestSync()
}

export function consume(itemId: string, qty: number, note?: string): void {
  const items = cache.readItems()
  const item = findItemOrThrow(items, itemId)
  const requested = Math.abs(Number(qty) || 0)
  const applied = Math.min(requested, Math.max(0, item.quantity))
  if (applied <= 0) return
  item.quantity = round2(item.quantity - applied)
  item.updatedAt = now()
  cache.writeItems(items)
  queue.markDirty('items')
  appendTransaction({
    id: nanoid(),
    itemId,
    type: 'consume',
    quantity: -applied,
    note: note?.trim() || undefined,
    timestamp: now()
  })
  manager.requestSync()
}

export function receive(
  itemId: string,
  qty: number,
  unitCost: number,
  receiptRef?: string,
  note?: string
): void {
  const items = cache.readItems()
  const item = findItemOrThrow(items, itemId)
  const amount = Math.abs(Number(qty) || 0)
  if (amount <= 0) return
  const cost = Math.max(0, Number(unitCost) || 0)
  item.quantity = round2(item.quantity + amount)
  if (cost > 0) item.unitCost = cost // latest purchase price is the default valuation
  item.updatedAt = now()
  cache.writeItems(items)
  queue.markDirty('items')
  appendTransaction({
    id: nanoid(),
    itemId,
    type: 'receive',
    quantity: amount,
    unitCost: cost,
    totalCost: round2(amount * cost),
    receiptRef: receiptRef?.trim() || undefined,
    note: note?.trim() || undefined,
    timestamp: now()
  })
  manager.requestSync()
}

export function adjust(itemId: string, delta: number, note?: string): void {
  const items = cache.readItems()
  const item = findItemOrThrow(items, itemId)
  const change = Number(delta) || 0
  if (change === 0) return
  item.quantity = round2(item.quantity + change)
  item.updatedAt = now()
  cache.writeItems(items)
  queue.markDirty('items')
  appendTransaction({
    id: nanoid(),
    itemId,
    type: 'adjust',
    quantity: change,
    note: note?.trim() || undefined,
    timestamp: now()
  })
  manager.requestSync()
}

// Settings reconciliation: recompute each item's quantity from its ledger.
export function recomputeFromLedger(): void {
  const items = cache.readItems()
  const txns = cache.readTransactions()
  const totals = new Map<string, number>()
  for (const t of txns) {
    totals.set(t.itemId, round2((totals.get(t.itemId) ?? 0) + t.quantity))
  }
  const ts = now()
  for (const item of items) {
    const sum = totals.get(item.id) ?? 0
    if (item.quantity !== sum) {
      item.quantity = sum
      item.updatedAt = ts
    }
  }
  cache.writeItems(items)
  queue.markDirty('items')
  manager.requestSync()
}
