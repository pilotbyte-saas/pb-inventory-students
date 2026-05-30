import { google, type sheets_v4 } from 'googleapis'
import type { Item, Transaction, TransactionType } from '@shared/types'
import type { SyncAdapter } from './SyncAdapter'

// Column layout matches section 6 of the build outline.
const ITEMS_RANGE = 'Items!A2:M'
const TXNS_READ_RANGE = 'Transactions!A2:I'
const TXNS_APPEND_RANGE = 'Transactions!A1'
const ITEMS_HEADER_RANGE = 'Items!A1:M1'
const TXNS_HEADER_RANGE = 'Transactions!A1:I1'

const ITEMS_HEADER = [
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
]
const TXNS_HEADER = [
  'id',
  'itemId',
  'type',
  'quantity',
  'unitCost',
  'totalCost',
  'receiptRef',
  'note',
  'timestamp'
]

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
    timestamp: str(row[8])
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
    txn.timestamp
  ]
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

  // Make sure both tabs and their header rows exist before any read/write, so a
  // brand-new (even empty) spreadsheet just works. Putting headers in row 1 also
  // keeps transaction appends in row 2+, matching the A2:I read range. Runs once
  // per adapter instance and retries if it fails.
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
    if (!titles.has('Items')) requests.push({ addSheet: { properties: { title: 'Items' } } })
    if (!titles.has('Transactions')) {
      requests.push({ addSheet: { properties: { title: 'Transactions' } } })
    }
    if (requests.length) {
      await this.sheets.spreadsheets.batchUpdate({
        spreadsheetId: this.spreadsheetId,
        requestBody: { requests }
      })
    }
    await this.ensureHeader(ITEMS_HEADER_RANGE, ITEMS_HEADER)
    await this.ensureHeader(TXNS_HEADER_RANGE, TXNS_HEADER)
  }

  private async ensureHeader(range: string, header: string[]): Promise<void> {
    const res = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range
    })
    const row = res.data.values?.[0] ?? []
    const hasHeader = row.length > 0 && String(row[0] ?? '').trim().length > 0
    if (!hasHeader) {
      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range,
        valueInputOption: 'RAW',
        requestBody: { values: [header] }
      })
    }
  }

  async pull(): Promise<{ items: Item[]; transactions: Transaction[] }> {
    await this.ensureSetup()
    const res = await this.sheets.spreadsheets.values.batchGet({
      spreadsheetId: this.spreadsheetId,
      ranges: [ITEMS_RANGE, TXNS_READ_RANGE],
      valueRenderOption: 'UNFORMATTED_VALUE'
    })
    const ranges = res.data.valueRanges ?? []
    const itemRows = (ranges[0]?.values ?? []) as unknown[][]
    const txnRows = (ranges[1]?.values ?? []) as unknown[][]
    return {
      items: itemRows.filter((r) => str(r[0]).length > 0).map(rowToItem),
      transactions: txnRows.filter((r) => str(r[0]).length > 0).map(rowToTxn)
    }
  }

  async pushItems(items: Item[]): Promise<void> {
    await this.ensureSetup()
    // Clear then write the whole Items data range (the current-state snapshot).
    await this.sheets.spreadsheets.values.clear({
      spreadsheetId: this.spreadsheetId,
      range: ITEMS_RANGE
    })
    if (items.length === 0) return
    await this.sheets.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      range: ITEMS_RANGE,
      valueInputOption: 'RAW',
      requestBody: { values: items.map(itemToRow) }
    })
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
