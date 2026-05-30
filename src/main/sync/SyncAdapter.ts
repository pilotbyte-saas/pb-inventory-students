import type { Batch, Item, Template, Transaction } from '@shared/types'

// A small interface so the sync backend stays swappable. Items, batches, and
// templates are current-state snapshots; transactions are append-only.
export interface SyncAdapter {
  pull(): Promise<{
    items: Item[]
    transactions: Transaction[]
    batches: Batch[]
    templates: Template[]
  }>
  pushItems(items: Item[]): Promise<void>
  pushBatches(batches: Batch[]): Promise<void>
  pushTemplates(templates: Template[]): Promise<void>
  appendTransactions(txns: Transaction[]): Promise<void>
}
