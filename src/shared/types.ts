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
  batchId?: string // set when this entry was recorded as part of a batch consume
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

// A line in a batch or template: an item and a positive quantity.
export interface BatchLine {
  itemId: string
  quantity: number
}

export type BatchStatus = 'active' | 'voided'

// A batch is one consume event (e.g. a training session). Its metadata lives
// here and syncs as a snapshot; the actual quantities are normal consume
// transactions tagged with this batch's id (the ledger stays the source of
// truth for stock).
export interface Batch {
  id: string
  timestamp: string // when it happened (event date, user-settable, ISO)
  category: string // e.g. "Private training"
  tags: string[]
  note?: string
  status: BatchStatus
  createdAt: string
  updatedAt: string
}

export interface NewBatchInput {
  timestamp?: string // defaults to now
  category: string
  tags?: string[]
  note?: string
  lines: BatchLine[] // positive quantities to consume
}

// A reusable set of items commonly consumed together.
export interface Template {
  id: string
  name: string
  lines: BatchLine[]
  deleted?: boolean // soft-delete tombstone so removals propagate across devices
  createdAt: string
  updatedAt: string
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

export type SyncBackend = 'sheets' | 'dynamodb'

export interface AwsConfig {
  accessKeyId: string
  secretAccessKey: string
  region: string
  tableName: string
}

// Everything the Settings screen needs to render either backend's status.
// No secrets are included — only whether they are present.
export interface BackendInfo {
  backend: SyncBackend
  encryptionAvailable: boolean
  sheets: {
    hasKey: boolean
    clientEmail: string | null
    spreadsheetId: string | null
  }
  aws: {
    hasSecret: boolean
    accessKeyId: string | null
    region: string | null
    tableName: string | null
  }
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

  // Batches & templates
  getBatches(): Promise<Batch[]>
  getTemplates(): Promise<Template[]>
  consumeBatch(input: NewBatchInput): Promise<void>
  voidBatch(batchId: string): Promise<void>
  updateBatchMeta(
    batchId: string,
    patch: { timestamp?: string; category?: string; tags?: string[]; note?: string }
  ): Promise<void>
  reverseTransaction(txnId: string): Promise<void>
  saveTemplate(name: string, lines: BatchLine[]): Promise<void>
  updateTemplate(id: string, patch: { name?: string; lines?: BatchLine[] }): Promise<void>
  deleteTemplate(id: string): Promise<void>

  // Export: write base64-encoded content to a file the user picks.
  saveFile(
    defaultName: string,
    base64: string
  ): Promise<{ ok: boolean; path?: string; canceled?: boolean; error?: string }>
  getSyncStatus(): Promise<SyncStatus>
  syncNow(): Promise<void>
  testConnection(): Promise<{ ok: boolean; error?: string }>
  hasCredentials(): Promise<boolean>
  getBackendInfo(): Promise<BackendInfo>
  setBackend(backend: SyncBackend): Promise<void>
  setCredentials(jsonKey: string): Promise<void>
  setSpreadsheetId(id: string): Promise<void>
  setAwsConfig(config: AwsConfig): Promise<void>
  pickKeyFile(): Promise<{ ok: boolean; clientEmail?: string | null; error?: string }>
  openExternal(url: string): Promise<void>
  // Subscribe to push updates of sync status. Returns an unsubscribe function.
  onSyncStatus(cb: (status: SyncStatus) => void): () => void
}
