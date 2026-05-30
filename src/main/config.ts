import { app, safeStorage } from 'electron'
import { join } from 'node:path'
import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs'

// Persists the service account key (encrypted with the OS keychain via
// safeStorage) and the spreadsheet id. The key never lives in the project tree.

interface StoredKey {
  enc: boolean // true if encrypted with safeStorage
  data: string // base64
}

interface StoredConfig {
  key?: StoredKey
  spreadsheetId?: string
}

let cached: StoredConfig | null = null

function configPath(): string {
  return join(app.getPath('userData'), 'config.json')
}

function load(): StoredConfig {
  if (cached) return cached
  try {
    cached = existsSync(configPath())
      ? (JSON.parse(readFileSync(configPath(), 'utf8')) as StoredConfig)
      : {}
  } catch {
    cached = {}
  }
  return cached
}

function save(config: StoredConfig): void {
  const tmp = configPath() + '.tmp'
  writeFileSync(tmp, JSON.stringify(config, null, 2), 'utf8')
  renameSync(tmp, configPath())
  cached = config
}

export function hasKeyStored(): boolean {
  return !!load().key
}

export function hasCredentials(): boolean {
  const c = load()
  return !!c.key && !!c.spreadsheetId
}

export function setCredentials(jsonKey: string): void {
  let parsed: { client_email?: unknown; private_key?: unknown }
  try {
    parsed = JSON.parse(jsonKey)
  } catch {
    throw new Error('The selected file is not valid JSON.')
  }
  if (typeof parsed.client_email !== 'string' || typeof parsed.private_key !== 'string') {
    throw new Error(
      'That file does not look like a service account key (missing client_email/private_key).'
    )
  }
  let data: string
  let enc: boolean
  if (safeStorage.isEncryptionAvailable()) {
    data = safeStorage.encryptString(jsonKey).toString('base64')
    enc = true
  } else {
    // Fallback so the app still works where the OS keychain is unavailable.
    data = Buffer.from(jsonKey, 'utf8').toString('base64')
    enc = false
  }
  const c = load()
  c.key = { enc, data }
  save(c)
}

export function getKeyJson(): string | null {
  const c = load()
  if (!c.key) return null
  const buf = Buffer.from(c.key.data, 'base64')
  return c.key.enc ? safeStorage.decryptString(buf) : buf.toString('utf8')
}

export function getClientEmail(): string | null {
  try {
    const key = getKeyJson()
    if (!key) return null
    const parsed = JSON.parse(key) as { client_email?: unknown }
    return typeof parsed.client_email === 'string' ? parsed.client_email : null
  } catch {
    return null
  }
}

export function setSpreadsheetId(id: string): void {
  const c = load()
  c.spreadsheetId = id.trim()
  save(c)
}

export function getSpreadsheetId(): string | null {
  return load().spreadsheetId ?? null
}

export function encryptionAvailable(): boolean {
  return safeStorage.isEncryptionAvailable()
}
