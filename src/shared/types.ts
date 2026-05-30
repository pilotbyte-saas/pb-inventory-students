// Data model and IPC contract shared between the main and renderer processes.
// These are type-only declarations (erased at build time), so the file can be
// imported from both the Node side and the browser side safely.

export type TransactionType = 'initial' | 'receive' | 'consume' | 'adjust'

export interface Item {
  id: string // stable id, e.g. "tshirt-blk-l"
  name: string
  sku: string // size/color variant lives here
  category: string
  unit: string // "each" | "box" | "pack"
  quantity: number // current on-hand
  reorderThreshold: number
  unitCost: number
  reorderUrl?: string
  supplier?: string
  notes?: string
  createdAt: string // ISO
  updatedAt: string // ISO
}

export interface Transaction {
  id: string
  itemId: string
  type: TransactionType
  quantity: number // signed: + for receive, - for consume
  unitCost?: number
  totalCost?: number
  receiptRef?: string
  note?: string
  timestamp: string // ISO
}

// Fields a user supplies when creating an item. The main process fills in the
// id (if omitted), timestamps, and normalizes the rest.
export interface NewItemInput {
  id?: string
  name: string
  sku?: string
  category?: string
  unit?: string
  quantity?: number
  reorderThreshold?: number
  unitCost?: number
  reorderUrl?: string
  supplier?: string
  notes?: string
}

export type SyncState = 'synced' | 'syncing' | 'offline' | 'error'

export interface SyncStatus {
  state: SyncState
  lastSyncedAt: string | null
  pending: number
  message?: string
}

export interface TransactionFilter {
  itemId?: string
  type?: TransactionType
  from?: string // 'YYYY-MM-DD'
  to?: string // 'YYYY-MM-DD'
}

export interface CredentialInfo {
  hasKey: boolean
  hasSpreadsheet: boolean
  clientEmail: string | null
  spreadsheetId: string | null
  encryptionAvailable: boolean
}

// The surface exposed on `window.api` by the preload bridge.
export interface IpcApi {
  getItems(): Promise<Item[]>
  getTransactions(filter?: TransactionFilter): Promise<Transaction[]>
  addItem(item: NewItemInput): Promise<void>
  updateItem(id: string, patch: Partial<Item>): Promise<void>
  consume(itemId: string, qty: number, note?: string): Promise<void>
  receive(
    itemId: string,
    qty: number,
    unitCost: number,
    receiptRef?: string,
    note?: string
  ): Promise<void>
  adjust(itemId: string, delta: number, note?: string): Promise<void>
  recompute(): Promise<void>
  getSyncStatus(): Promise<SyncStatus>
  syncNow(): Promise<void>
  testConnection(): Promise<{ ok: boolean; error?: string }>
  hasCredentials(): Promise<boolean>
  setCredentials(jsonKey: string): Promise<void>
  setSpreadsheetId(id: string): Promise<void>
  getCredentialInfo(): Promise<CredentialInfo>
  pickKeyFile(): Promise<{ ok: boolean; clientEmail?: string | null; error?: string }>
  openExternal(url: string): Promise<void>
  // Subscribe to push updates of sync status. Returns an unsubscribe function.
  onSyncStatus(cb: (status: SyncStatus) => void): () => void
}
