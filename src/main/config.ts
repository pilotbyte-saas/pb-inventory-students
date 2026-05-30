import { app, safeStorage } from 'electron'
import { join } from 'node:path'
import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs'
import type { AwsConfig, BackendInfo, SyncBackend } from '@shared/types'

// Persists which sync backend is active plus each backend's credentials.
// Secrets (the service-account key, the AWS secret access key) are encrypted
// with the OS keychain via safeStorage and never leave the userData directory.

interface StoredSecret {
  enc: boolean // true if encrypted with safeStorage
  data: string // base64
}

interface StoredConfig {
  backend?: SyncBackend
  // Google Sheets
  key?: StoredSecret
  spreadsheetId?: string
  // AWS DynamoDB
  aws?: {
    accessKeyId?: string
    region?: string
    tableName?: string
    secret?: StoredSecret
  }
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

function encryptSecret(plain: string): StoredSecret {
  if (safeStorage.isEncryptionAvailable()) {
    return { enc: true, data: safeStorage.encryptString(plain).toString('base64') }
  }
  // Fallback where the OS keychain is unavailable (still works, not encrypted).
  return { enc: false, data: Buffer.from(plain, 'utf8').toString('base64') }
}

function decryptSecret(s: StoredSecret): string {
  const buf = Buffer.from(s.data, 'base64')
  return s.enc ? safeStorage.decryptString(buf) : buf.toString('utf8')
}

export function encryptionAvailable(): boolean {
  return safeStorage.isEncryptionAvailable()
}

export function getBackend(): SyncBackend {
  return load().backend ?? 'sheets'
}

export function setBackend(backend: SyncBackend): void {
  const c = load()
  c.backend = backend
  save(c)
}

// ---------------------------------------------------------------- Google Sheets

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
  const c = load()
  c.key = encryptSecret(jsonKey)
  save(c)
}

export function getKeyJson(): string | null {
  const c = load()
  return c.key ? decryptSecret(c.key) : null
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

export function hasSheets(): boolean {
  const c = load()
  return !!c.key && !!c.spreadsheetId
}

// ---------------------------------------------------------------- AWS DynamoDB

export function setAwsConfig(cfg: AwsConfig): void {
  const c = load()
  const prev = c.aws ?? {}
  c.aws = {
    accessKeyId: cfg.accessKeyId.trim(),
    region: cfg.region.trim(),
    tableName: cfg.tableName.trim(),
    // Keep the existing secret if the user left the field blank (e.g. just
    // changing the region or table name).
    secret: cfg.secretAccessKey ? encryptSecret(cfg.secretAccessKey) : prev.secret
  }
  save(c)
}

export function getFullAwsConfig(): AwsConfig | null {
  const a = load().aws
  if (!a?.accessKeyId || !a.region || !a.tableName || !a.secret) return null
  return {
    accessKeyId: a.accessKeyId,
    region: a.region,
    tableName: a.tableName,
    secretAccessKey: decryptSecret(a.secret)
  }
}

export function hasAws(): boolean {
  const a = load().aws
  return !!(a?.accessKeyId && a.region && a.tableName && a.secret)
}

// ---------------------------------------------------------------- backend-aware

export function hasCredentials(): boolean {
  return getBackend() === 'dynamodb' ? hasAws() : hasSheets()
}

export function getBackendInfo(): BackendInfo {
  const c = load()
  return {
    backend: c.backend ?? 'sheets',
    encryptionAvailable: safeStorage.isEncryptionAvailable(),
    sheets: {
      hasKey: !!c.key,
      clientEmail: getClientEmail(),
      spreadsheetId: c.spreadsheetId ?? null
    },
    aws: {
      hasSecret: !!c.aws?.secret,
      accessKeyId: c.aws?.accessKeyId ?? null,
      region: c.aws?.region ?? null,
      tableName: c.aws?.tableName ?? null
    }
  }
}
