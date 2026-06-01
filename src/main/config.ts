import { app, safeStorage } from 'electron'
import { join } from 'node:path'
import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs'
import type { AwsConfig, BackendInfo, SyncBackend } from '@shared/types'

// Persists which sync backend is active plus the AWS credentials. The secret
// access key is encrypted with the OS keychain via safeStorage and never leaves
// the userData directory.

interface StoredSecret {
  enc: boolean // true if encrypted with safeStorage
  data: string // base64
}

interface StoredConfig {
  backend?: SyncBackend
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
  return { enc: false, data: Buffer.from(plain, 'utf8').toString('base64') }
}

function decryptSecret(s: StoredSecret): string {
  const buf = Buffer.from(s.data, 'base64')
  return s.enc ? safeStorage.decryptString(buf) : buf.toString('utf8')
}

export function encryptionAvailable(): boolean {
  return safeStorage.isEncryptionAvailable()
}

// Default to local-only so a fresh install works offline with no setup.
export function getBackend(): SyncBackend {
  return load().backend ?? 'local'
}

export function setBackend(backend: SyncBackend): void {
  const c = load()
  c.backend = backend
  save(c)
}

export function setAwsConfig(cfg: AwsConfig): void {
  const c = load()
  const prev = c.aws ?? {}
  c.aws = {
    accessKeyId: cfg.accessKeyId.trim(),
    region: cfg.region.trim(),
    tableName: cfg.tableName.trim(),
    // Keep the existing secret if the field was left blank (e.g. changing region).
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

// "Configured" means: local needs nothing; dynamodb needs AWS creds.
export function hasCredentials(): boolean {
  return getBackend() === 'dynamodb' ? hasAws() : true
}

export function getBackendInfo(): BackendInfo {
  const c = load()
  return {
    backend: c.backend ?? 'local',
    encryptionAvailable: safeStorage.isEncryptionAvailable(),
    aws: {
      hasSecret: !!c.aws?.secret,
      accessKeyId: c.aws?.accessKeyId ?? null,
      region: c.aws?.region ?? null,
      tableName: c.aws?.tableName ?? null
    }
  }
}
