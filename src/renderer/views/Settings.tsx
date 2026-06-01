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

  // AWS DynamoDB fields
  const [accessKeyId, setAccessKeyId] = useState('')
  const [secret, setSecret] = useState('')
  const [region, setRegion] = useState('us-east-1')
  const [tableName, setTableName] = useState('classroom-inventory')

  async function load(): Promise<void> {
    const i = await api.getBackendInfo()
    setInfo(i)
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

  const backend: SyncBackend = info?.backend ?? 'local'

  async function switchBackend(b: SyncBackend): Promise<void> {
    setBusy(true)
    setMsg(null)
    try {
      await api.setBackend(b)
      await load()
      setMsg(
        b === 'local'
          ? 'Switched to Local only. Changes stay on this device until you switch back to AWS DynamoDB.'
          : 'Switched to AWS DynamoDB — syncing your local changes up now.'
      )
    } finally {
      setBusy(false)
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

  async function testConnection(): Promise<void> {
    setBusy(true)
    setMsg('Testing connection…')
    try {
      await api.setAwsConfig({ accessKeyId, secretAccessKey: secret, region, tableName })
      setSecret('')
      const r = await api.testConnection()
      await load()
      setMsg(r.ok ? '✓ Connected. The DynamoDB table is ready.' : (r.error ?? 'Connection failed.'))
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
        <h2 className="font-semibold text-slate-700">Sync mode</h2>
        <div className="flex gap-2 rounded-lg border border-slate-200 bg-slate-50 p-1">
          {tab('dynamodb', 'AWS DynamoDB')}
          {tab('local', 'Local only')}
        </div>
        <p className="text-xs text-slate-400">
          Local only keeps everything on this device. Switch to AWS DynamoDB to sync to the cloud —
          your local changes are pushed up, and any clashes are flagged so you can merge them or keep
          them as new.
        </p>
      </Card>

      {backend === 'dynamodb' ? (
        <Card className="space-y-3 p-5">
          <div>
            <h2 className="font-semibold text-slate-700">AWS DynamoDB</h2>
            <p className="text-sm text-slate-500">
              Enter an IAM access key. The secret is encrypted with the OS keychain. The table is
              created automatically (pay-per-request) if it doesn&apos;t exist.
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
      ) : (
        <Card className="space-y-2 p-5">
          <h2 className="font-semibold text-slate-700">Local only</h2>
          <p className="text-sm text-slate-600">
            Nothing is syncing to the cloud — every change is saved on this device. When you&apos;re
            back online, switch to <span className="font-medium">AWS DynamoDB</span> above to push
            your changes up. Any items that clash with the cloud will be flagged so you can merge
            them or keep them as new.
          </p>
          {sync.pending > 0 && (
            <p className="text-sm text-amber-600">
              {sync.pending} change{sync.pending === 1 ? '' : 's'} waiting to sync.
            </p>
          )}
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
          Recompute each item&apos;s on-hand quantity from the sum of its ledger entries. Use this if
          a quantity ever looks off.
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
