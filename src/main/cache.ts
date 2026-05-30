import { app } from 'electron'
import { join } from 'node:path'
import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs'
import type { Item, Transaction } from '@shared/types'

// The working copy: plain JSON files in userData. The UI reads/writes these so
// it never waits on the network. The sync adapter reconciles them with Sheets.

function filePath(name: string): string {
  return join(app.getPath('userData'), name)
}

function readJson<T>(name: string, fallback: T): T {
  try {
    const p = filePath(name)
    if (!existsSync(p)) return fallback
    return JSON.parse(readFileSync(p, 'utf8')) as T
  } catch {
    return fallback
  }
}

function writeJson(name: string, data: unknown): void {
  const p = filePath(name)
  const tmp = p + '.tmp'
  writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8')
  renameSync(tmp, p) // atomic-ish replace, avoids half-written files
}

export function readItems(): Item[] {
  return readJson<Item[]>('items.json', [])
}

export function writeItems(items: Item[]): void {
  writeJson('items.json', items)
}

export function readTransactions(): Transaction[] {
  return readJson<Transaction[]>('transactions.json', [])
}

export function writeTransactions(transactions: Transaction[]): void {
  writeJson('transactions.json', transactions)
}
