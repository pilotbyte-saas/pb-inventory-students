import { google, type sheets_v4 } from 'googleapis'
import type { Batch, BatchStatus, Item, Template, Transaction, TransactionType } from '@shared/types'
import type { SyncAdapter } from './SyncAdapter'

// Column layouts (header row 1, data from row 2).
const ITEMS_RANGE = 'Items!A2:M'
const TXNS_READ_RANGE = 'Transactions!A2:J'
const TXNS_APPEND_RANGE = 'Transactions!A1'
const BATCHES_RANGE = 'Batches!A2:H'
const TEMPLATES_RANGE = 'Templates!A2:F'

const HEADERS: Record<string, string[]> = {
  Items: [
    'id',
    'name',
    'sku',
    'category',
    'unit',
    'quantity',
    'reorderThreshold',
    'unitCost',
    'reorderUrl',
    'supplier',
    'notes',
    'createdAt',
    'updatedAt'
  ],
  Transactions: [
    'id',
    'itemId',
    'type',
    'quantity',
    'unitCost',
    'totalCost',
    'receiptRef',
    'note',
    'timestamp',
    'batchId'
  ],
  Batches: ['id', 'timestamp', 'category', 'tags', 'note', 'status', 'createdAt', 'updatedAt'],
  Templates: ['id', 'name', 'lines', 'deleted', 'createdAt', 'updatedAt']
}

const HEADER_RANGE: Record<string, string> = {
  Items: 'Items!A1:M1',
  Transactions: 'Transactions!A1:J1',
  Batches: 'Batches!A1:H1',
  Templates: 'Templates!A1:F1'
}

function num(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}
function str(v: unknown): string {
  return v === undefined || v === null ? '' : String(v)
}
function optStr(v: unknown): string | undefined {
  const s = str(v).trim()
  return s.length ? s : undefined
}
function optNum(v: unknown): number | undefined {
  if (v === undefined || v === null || v === '') return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

function rowToItem(row: unknown[]): Item {
  return {
    id: str(row[0]),
    name: str(row[1]),
    sku: str(row[2]),
    category: str(row[3]),
    unit: str(row[4]),
    quantity: num(row[5]),
    reorderThreshold: num(row[6]),
    unitCost: num(row[7]),
    reorderUrl: optStr(row[8]),
    supplier: optStr(row[9]),
    notes: optStr(row[10]),
    createdAt: str(row[11]),
    updatedAt: str(row[12])
  }
}

function itemToRow(item: Item): (string | number)[] {
  return [
    item.id,
    item.name,
    item.sku,
    item.category,
    item.unit,
    item.quantity,
    item.reorderThreshold,
    item.unitCost,
    item.reorderUrl ?? '',
    item.supplier ?? '',
    item.notes ?? '',
    item.createdAt,
    item.updatedAt
  ]
}

function rowToTxn(row: unknown[]): Transaction {
  return {
    id: str(row[0]),
    itemId: str(row[1]),
    type: (str(row[2]) || 'adjust') as TransactionType,
    quantity: num(row[3]),
    unitCost: optNum(row[4]),
    totalCost: optNum(row[5]),
    receiptRef: optStr(row[6]),
    note: optStr(row[7]),
    timestamp: str(row[8]),
    batchId: optStr(row[9])
  }
}

function txnToRow(txn: Transaction): (string | number)[] {
  return [
    txn.id,
    txn.itemId,
    txn.type,
    txn.quantity,
    txn.unitCost ?? '',
    txn.totalCost ?? '',
    txn.receiptRef ?? '',
    txn.note ?? '',
    txn.timestamp,
    txn.batchId ?? ''
  ]
}

function rowToBatch(row: unknown[]): Batch {
  return {
    id: str(row[0]),
    timestamp: str(row[1]),
    category: str(row[2]),
    tags: str(row[3])
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean),
    note: optStr(row[4]),
    status: (str(row[5]) || 'active') as BatchStatus,
    createdAt: str(row[6]),
    updatedAt: str(row[7])
  }
}

function batchToRow(b: Batch): (string | number)[] {
  return [b.id, b.timestamp, b.category, b.tags.join(', '), b.note ?? '', b.status, b.createdAt, b.updatedAt]
}

function rowToTemplate(row: unknown[]): Template {
  let lines: Template['lines'] = []
  try {
    const parsed = JSON.parse(str(row[2]) || '[]')
    if (Array.isArray(parsed)) lines = parsed
  } catch {
    lines = []
  }
  return {
    id: str(row[0]),
    name: str(row[1]),
    lines,
    deleted: str(row[3]).toLowerCase() === 'true',
    createdAt: str(row[4]),
    updatedAt: str(row[5])
  }
}

function templateToRow(t: Template): (string | number)[] {
  return [t.id, t.name, JSON.stringify(t.lines ?? []), t.deleted ? 'true' : '', t.createdAt, t.updatedAt]
}

export class GoogleSheetsAdapter implements SyncAdapter {
  private sheets: sheets_v4.Sheets
  private spreadsheetId: string
  private setupPromise: Promise<void> | null = null

  constructor(keyJson: string, spreadsheetId: string) {
    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(keyJson),
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    })
    this.sheets = google.sheets({ version: 'v4', auth })
    this.spreadsheetId = spreadsheetId
  }

  // Ensure every tab and its header row exists before any read/write.
  private ensureSetup(): Promise<void> {
    if (!this.setupPromise) {
      this.setupPromise = this.doSetup().catch((err) => {
        this.setupPromise = null
        throw err
      })
    }
    return this.setupPromise
  }

  private async doSetup(): Promise<void> {
    const meta = await this.sheets.spreadsheets.get({
      spreadsheetId: this.spreadsheetId,
      fields: 'sheets.properties.title'
    })
    const titles = new Set((meta.data.sheets ?? []).map((s) => s.properties?.title ?? ''))
    const requests: sheets_v4.Schema$Request[] = []
    for (const tab of ['Items', 'Transactions', 'Batches', 'Templates']) {
      if (!titles.has(tab)) requests.push({ addSheet: { properties: { title: tab } } })
    }
    if (requests.length) {
      await this.sheets.spreadsheets.batchUpdate({
        spreadsheetId: this.spreadsheetId,
        requestBody: { requests }
      })
    }
    for (const tab of ['Items', 'Transactions', 'Batches', 'Templates']) {
      await this.ensureHeader(HEADER_RANGE[tab], HEADERS[tab])
    }
  }

  private async ensureHeader(range: string, header: string[]): Promise<void> {
    const res = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range
    })
    const row = res.data.values?.[0] ?? []
    if (!(row.length > 0 && String(row[0] ?? '').trim().length > 0)) {
      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range,
        valueInputOption: 'RAW',
        requestBody: { values: [header] }
      })
    }
  }

  private async rewrite(range: string, rows: (string | number)[][]): Promise<void> {
    await this.sheets.spreadsheets.values.clear({ spreadsheetId: this.spreadsheetId, range })
    if (rows.length === 0) return
    await this.sheets.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      range,
      valueInputOption: 'RAW',
      requestBody: { values: rows }
    })
  }

  async pull(): Promise<{
    items: Item[]
    transactions: Transaction[]
    batches: Batch[]
    templates: Template[]
  }> {
    await this.ensureSetup()
    const res = await this.sheets.spreadsheets.values.batchGet({
      spreadsheetId: this.spreadsheetId,
      ranges: [ITEMS_RANGE, TXNS_READ_RANGE, BATCHES_RANGE, TEMPLATES_RANGE],
      valueRenderOption: 'UNFORMATTED_VALUE'
    })
    const ranges = res.data.valueRanges ?? []
    const rows = (i: number): unknown[][] => (ranges[i]?.values ?? []) as unknown[][]
    return {
      items: rows(0)
        .filter((r) => str(r[0]).length > 0)
        .map(rowToItem),
      transactions: rows(1)
        .filter((r) => str(r[0]).length > 0)
        .map(rowToTxn),
      batches: rows(2)
        .filter((r) => str(r[0]).length > 0)
        .map(rowToBatch),
      templates: rows(3)
        .filter((r) => str(r[0]).length > 0)
        .map(rowToTemplate)
    }
  }

  async pushItems(items: Item[]): Promise<void> {
    await this.ensureSetup()
    await this.rewrite(ITEMS_RANGE, items.map(itemToRow))
  }

  async pushBatches(batches: Batch[]): Promise<void> {
    await this.ensureSetup()
    await this.rewrite(BATCHES_RANGE, batches.map(batchToRow))
  }

  async pushTemplates(templates: Template[]): Promise<void> {
    await this.ensureSetup()
    await this.rewrite(TEMPLATES_RANGE, templates.map(templateToRow))
  }

  async appendTransactions(txns: Transaction[]): Promise<void> {
    if (txns.length === 0) return
    await this.ensureSetup()
    await this.sheets.spreadsheets.values.append({
      spreadsheetId: this.spreadsheetId,
      range: TXNS_APPEND_RANGE,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: txns.map(txnToRow) }
    })
  }
}
