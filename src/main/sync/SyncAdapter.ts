import type { Item, Transaction } from '@shared/types'

// A small interface so the sync backend stays swappable — a Drive or GitHub
// adapter could drop in later without touching the rest of the app.
export interface SyncAdapter {
  pull(): Promise<{ items: Item[]; transactions: Transaction[] }>
  pushItems(items: Item[]): Promise<void> // rewrites the Items snapshot
  appendTransactions(txns: Transaction[]): Promise<void> // append-only
}
