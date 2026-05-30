import {
  CreateTableCommand,
  DescribeTableCommand,
  DynamoDBClient,
  ResourceNotFoundException,
  waitUntilTableExists
} from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb'
import type { AwsConfig, Item, Transaction, TransactionType } from '@shared/types'
import type { SyncAdapter } from './SyncAdapter'

// Single-table design. All items live under one partition and all transactions
// under another — fine at classroom volume (a few dozen items, a few devices).
//   Items:        pk = "ITEM", sk = itemId
//   Transactions: pk = "TXN",  sk = "<timestamp>#<id>"  (sorts by time)
const ITEM_PK = 'ITEM'
const TXN_PK = 'TXN'

type Row = Record<string, unknown>

function isConditionalFail(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { name?: string }).name === 'ConditionalCheckFailedException'
  )
}

function str(v: unknown): string {
  return v === undefined || v === null ? '' : String(v)
}
function num(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
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

function rowToItem(r: Row): Item {
  return {
    id: str(r.id),
    name: str(r.name),
    sku: str(r.sku),
    category: str(r.category),
    unit: str(r.unit) || 'each',
    quantity: num(r.quantity),
    reorderThreshold: num(r.reorderThreshold),
    unitCost: num(r.unitCost),
    reorderUrl: optStr(r.reorderUrl),
    supplier: optStr(r.supplier),
    notes: optStr(r.notes),
    createdAt: str(r.createdAt),
    updatedAt: str(r.updatedAt)
  }
}

function rowToTxn(r: Row): Transaction {
  return {
    id: str(r.id),
    itemId: str(r.itemId),
    type: (str(r.type) || 'adjust') as TransactionType,
    quantity: num(r.quantity),
    unitCost: optNum(r.unitCost),
    totalCost: optNum(r.totalCost),
    receiptRef: optStr(r.receiptRef),
    note: optStr(r.note),
    timestamp: str(r.timestamp)
  }
}

export class DynamoDbAdapter implements SyncAdapter {
  private doc: DynamoDBDocumentClient
  private raw: DynamoDBClient
  private table: string
  private setupPromise: Promise<void> | null = null

  constructor(cfg: AwsConfig) {
    this.raw = new DynamoDBClient({
      region: cfg.region,
      credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey }
    })
    // removeUndefinedValues so optional fields (reorderUrl, note, …) don't throw.
    this.doc = DynamoDBDocumentClient.from(this.raw, {
      marshallOptions: { removeUndefinedValues: true }
    })
    this.table = cfg.tableName
  }

  // Create the table on first use if it isn't there. Runs once per adapter.
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
    try {
      await this.raw.send(new DescribeTableCommand({ TableName: this.table }))
      return // already exists
    } catch (err) {
      if (!(err instanceof ResourceNotFoundException)) throw err
    }
    await this.raw.send(
      new CreateTableCommand({
        TableName: this.table,
        BillingMode: 'PAY_PER_REQUEST', // serverless, pay-per-request
        AttributeDefinitions: [
          { AttributeName: 'pk', AttributeType: 'S' },
          { AttributeName: 'sk', AttributeType: 'S' }
        ],
        KeySchema: [
          { AttributeName: 'pk', KeyType: 'HASH' },
          { AttributeName: 'sk', KeyType: 'RANGE' }
        ]
      })
    )
    await waitUntilTableExists({ client: this.raw, maxWaitTime: 90 }, { TableName: this.table })
  }

  private async queryAll(pk: string): Promise<Row[]> {
    const rows: Row[] = []
    let startKey: Record<string, unknown> | undefined
    do {
      const res = await this.doc.send(
        new QueryCommand({
          TableName: this.table,
          KeyConditionExpression: 'pk = :pk',
          ExpressionAttributeValues: { ':pk': pk },
          ExclusiveStartKey: startKey
        })
      )
      for (const row of res.Items ?? []) rows.push(row as Row)
      startKey = res.LastEvaluatedKey
    } while (startKey)
    return rows
  }

  async pull(): Promise<{ items: Item[]; transactions: Transaction[] }> {
    await this.ensureSetup()
    const [itemRows, txnRows] = await Promise.all([this.queryAll(ITEM_PK), this.queryAll(TXN_PK)])
    return {
      items: itemRows.filter((r) => str(r.id).length > 0).map(rowToItem),
      transactions: txnRows.filter((r) => str(r.id).length > 0).map(rowToTxn)
    }
  }

  async pushItems(items: Item[]): Promise<void> {
    await this.ensureSetup()
    for (const item of items) {
      try {
        // Optimistic concurrency: only overwrite if our copy is at least as new.
        // Two devices editing different items never clobber each other.
        await this.doc.send(
          new PutCommand({
            TableName: this.table,
            Item: { pk: ITEM_PK, sk: item.id, ...item },
            ConditionExpression: 'attribute_not_exists(updatedAt) OR updatedAt <= :u',
            ExpressionAttributeValues: { ':u': item.updatedAt }
          })
        )
      } catch (err) {
        if (isConditionalFail(err)) continue // remote is newer — keep it, we'll pull it
        throw err
      }
    }
  }

  async appendTransactions(txns: Transaction[]): Promise<void> {
    if (txns.length === 0) return
    await this.ensureSetup()
    for (const t of txns) {
      try {
        await this.doc.send(
          new PutCommand({
            TableName: this.table,
            Item: { pk: TXN_PK, sk: `${t.timestamp}#${t.id}`, ...t },
            ConditionExpression: 'attribute_not_exists(sk)' // idempotent append
          })
        )
      } catch (err) {
        if (isConditionalFail(err)) continue // already recorded by us or another device
        throw err
      }
    }
  }
}
