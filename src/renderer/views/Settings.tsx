import { useEffect, useState } from 'react'
import type { BackendInfo, SyncBackend, UpdateStatus } from '@shared/types'
import { useData } from '../store'
import { api } from '../api'
import { Button, Card, Label, inputClass } from '../components/ui'
import { relTime } from '../format'

export default function Settings(): JSX.Element {
  const { sync, syncNow, recompute } = useData()
  const [info, setInfo] = useState<BackendInfo | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [version, setVersion] = useState('')
  const [update, setUpdate] = useState<UpdateStatus | null>(null)

  // Google Sheets fields
  const [spreadsheetId, setSpreadsheetId] = useState('')
  // AWS DynamoDB fields
  const [accessKeyId, setAccessKeyId] = useState('')
  const [secret, setSecret] = useState('')
  const [region, setRegion] = useState('us-east-1')
  const [tableName, setTableName] = useState('classroom-inventory')

  async function load(): Promise<void> {
    const i = await api.getBackendInfo()
    setInfo(i)
    setSpreadsheetId(i.sheets.spreadsheetId ?? '')
    setAccessKeyId(i.aws.accessKeyId ?? '')
    setRegion(i.aws.region ?? 'us-east-1')
    setTableName(i.aws.tableName ?? 'classroom-inventory')
    setSecret('') // never prefill the secret
  }

  useEffect(() => {
    void load()
  }, [])

  useEffect(() => {
    void api.getAppVersion().then(setVersion)
    return api.onUpdateStatus(setUpdate)
  }, [])

  const backend: SyncBackend = info?.backend ?? 'sheets'

  async function switchBackend(b: SyncBackend): Promise<void> {
    setBusy(true)
    setMsg(null)
    try {
      await api.setBackend(b)
      await load()
    } finally {
      setBusy(false)
    }
  }

  async function pickKey(): Promise<void> {
    setMsg(null)
    const r = await api.pickKeyFile()
    if (r.ok) {
      setMsg('Service account key loaded and encrypted.')
      await load()
    } else if (r.error) {
      setMsg(r.error)
    }
  }

  async function saveAws(): Promise<void> {
    setBusy(true)
    try {
      await api.setAwsConfig({ accessKeyId, secretAccessKey: secret, region, tableName })
      setSecret('')
      await load()
      setMsg('AWS settings saved.')
    } finally {
      setBusy(false)
    }
  }

  async function saveSheet(): Promise<void> {
    setBusy(true)
    try {
      await api.setSpreadsheetId(spreadsheetId)
      await load()
      setMsg('Spreadsheet ID saved.')
    } finally {
      setBusy(false)
    }
  }

  // Save the active backend's settings, then do a real round-trip.
  async function testConnection(): Promise<void> {
    setBusy(true)
    setMsg('Testing connection…')
    try {
      if (backend === 'dynamodb') {
        await api.setAwsConfig({ accessKeyId, secretAccessKey: secret, region, tableName })
        setSecret('')
      } else {
        await api.setSpreadsheetId(spreadsheetId)
      }
      const r = await api.testConnection()
      await load()
      setMsg(
        r.ok
          ? backend === 'dynamodb'
            ? '✓ Connected. The DynamoDB table is ready.'
            : '✓ Connected. The Items and Transactions tabs are ready.'
          : (r.error ?? 'Connection failed.')
      )
    } finally {
      setBusy(false)
    }
  }

  async function reconcile(): Promise<void> {
    if (!window.confirm('Recompute every item quantity from its transaction history?')) return
    await recompute()
    setMsg('Quantities recomputed from the ledger.')
  }

  function tab(b: SyncBackend, label: string): JSX.Element {
    const active = backend === b
    return (
      <button
        onClick={() => void switchBackend(b)}
        disabled={busy}
        className={`flex-1 rounded-md px-4 py-2 text-sm font-medium ${
          active ? 'bg-brand-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-100'
        }`}
      >
        {label}
      </button>
    )
  }

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold text-slate-800">Settings</h1>

      {msg && <div className="rounded-md bg-brand-50 px-4 py-2 text-sm text-brand-700">{msg}</div>}

      <Card className="space-y-3 p-5">
        <h2 className="font-semibold text-slate-700">Sync backend</h2>
        <div className="flex gap-2 rounded-lg border border-slate-200 bg-slate-50 p-1">
          {tab('sheets', 'Google Sheets')}
          {tab('dynamodb', 'AWS DynamoDB')}
        </div>
        <p className="text-xs text-slate-400">
          Switch any time — your local data is untouched and re-syncs to the selected backend.
        </p>
      </Card>

      {backend === 'sheets' ? (
        <>
          <Card className="space-y-4 p-5">
            <div>
              <h2 className="font-semibold text-slate-700">Google service account key</h2>
              <p className="text-sm text-slate-500">
                Loaded once, encrypted with the OS keychain, and stored outside this project folder.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Button onClick={pickKey}>Load key file…</Button>
              <span className="text-sm">
                {info?.sheets.hasKey ? (
                  <span className="text-emerald-600">✓ Key loaded</span>
                ) : (
                  <span className="text-slate-400">No key loaded</span>
                )}
              </span>
            </div>
            {info?.sheets.clientEmail && (
              <div className="rounded-md bg-slate-50 p-3 text-sm">
                <div className="mb-1 text-slate-500">
                  Share your Google Sheet with this service account (as Editor):
                </div>
                <code className="break-all text-slate-800">{info.sheets.clientEmail}</code>
              </div>
            )}
          </Card>

          <Card className="space-y-3 p-5">
            <h2 className="font-semibold text-slate-700">Spreadsheet</h2>
            <div>
              <Label>Spreadsheet ID</Label>
              <input
                className={inputClass}
                value={spreadsheetId}
                onChange={(e) => setSpreadsheetId(e.target.value)}
                placeholder="from the Sheet URL, between /d/ and /edit"
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={saveSheet} disabled={busy}>
                Save spreadsheet ID
              </Button>
              <Button variant="secondary" onClick={testConnection} disabled={busy}>
                Test connection
              </Button>
            </div>
            <p className="text-xs text-slate-400">
              “Test connection” saves the ID above, then does a real round-trip to Google — creating
              the Items and Transactions tabs if they don’t exist yet.
            </p>
          </Card>
        </>
      ) : (
        <Card className="space-y-3 p-5">
          <div>
            <h2 className="font-semibold text-slate-700">AWS DynamoDB</h2>
            <p className="text-sm text-slate-500">
              Enter an IAM access key. The secret is encrypted with the OS keychain. The table is
              created automatically (pay-per-request) if it doesn’t exist.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Access Key ID</Label>
              <input
                className={inputClass}
                value={accessKeyId}
                onChange={(e) => setAccessKeyId(e.target.value)}
                placeholder="AKIA…"
                autoComplete="off"
              />
            </div>
            <div>
              <Label>Secret Access Key</Label>
              <input
                className={inputClass}
                type="password"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                placeholder={info?.aws.hasSecret ? '•••••••• (stored)' : 'enter secret'}
                autoComplete="off"
              />
            </div>
            <div>
              <Label>Region</Label>
              <input
                className={inputClass}
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                placeholder="us-east-1"
              />
            </div>
            <div>
              <Label>Table name</Label>
              <input
                className={inputClass}
                value={tableName}
                onChange={(e) => setTableName(e.target.value)}
                placeholder="classroom-inventory"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={saveAws} disabled={busy}>
              Save AWS settings
            </Button>
            <Button variant="secondary" onClick={testConnection} disabled={busy}>
              Test connection
            </Button>
          </div>
          <p className="text-xs text-slate-400">
            The IAM user needs DynamoDB permissions (DescribeTable, CreateTable, Query, PutItem) on
            the table. See the README for a ready-to-paste policy.
          </p>
        </Card>
      )}

      <Card className="space-y-3 p-5">
        <h2 className="font-semibold text-slate-700">Sync</h2>
        <p className="text-sm text-slate-600">
          State: <span className="font-medium">{sync.state}</span>
          {sync.state === 'synced' && <> · last sync {relTime(sync.lastSyncedAt)}</>}
          {sync.pending > 0 && <> · {sync.pending} pending</>}
        </p>
        {sync.message && <p className="text-sm text-slate-500">{sync.message}</p>}
        <Button variant="secondary" onClick={() => void syncNow()}>
          Sync now
        </Button>
      </Card>

      <Card className="space-y-3 p-5">
        <h2 className="font-semibold text-slate-700">Reconciliation</h2>
        <p className="text-sm text-slate-600">
          Recompute each item&apos;s on-hand quantity from the sum of its ledger entries. Use this
          if a quantity ever looks off.
        </p>
        <Button variant="secondary" onClick={reconcile}>
          Recompute quantities from ledger
        </Button>
      </Card>

      <Card className="space-y-3 p-5">
        <h2 className="font-semibold text-slate-700">About &amp; updates</h2>
        <p className="text-sm text-slate-600">
          Version <span className="font-medium">{version || '…'}</span>
        </p>
        <Button variant="secondary" onClick={() => void api.checkForUpdates()}>
          Check for updates
        </Button>
        {update && update.state !== 'idle' && (
          <p className="text-sm text-slate-500">{updateLabel(update)}</p>
        )}
      </Card>
    </div>
  )
}

function updateLabel(u: UpdateStatus): string {
  switch (u.state) {
    case 'checking':
      return 'Checking for updates…'
    case 'available':
      return `Update ${u.version ?? ''} found — downloading…`
    case 'downloading':
      return `Downloading update… ${u.percent ?? 0}%`
    case 'downloaded':
      return `Update ${u.version ?? ''} ready — restart to install.`
    case 'none':
      return u.message ?? 'You’re on the latest version.'
    case 'error':
      return `Update error: ${u.message ?? 'unknown'}`
    default:
      return ''
  }
}
