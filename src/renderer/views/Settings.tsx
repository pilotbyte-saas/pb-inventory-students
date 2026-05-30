import { useEffect, useState } from 'react'
import type { CredentialInfo } from '@shared/types'
import { useData } from '../store'
import { api } from '../api'
import { Button, Card, Label, inputClass } from '../components/ui'
import { relTime } from '../format'

export default function Settings(): JSX.Element {
  const { sync, syncNow, recompute } = useData()
  const [info, setInfo] = useState<CredentialInfo | null>(null)
  const [spreadsheetId, setSpreadsheetId] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  async function load(): Promise<void> {
    const i = await api.getCredentialInfo()
    setInfo(i)
    setSpreadsheetId(i.spreadsheetId ?? '')
  }

  useEffect(() => {
    void load()
  }, [])

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

  async function testConnection(): Promise<void> {
    setBusy(true)
    setMsg('Testing connection…')
    try {
      await api.setSpreadsheetId(spreadsheetId) // use whatever is currently typed
      const r = await api.testConnection()
      await load()
      setMsg(
        r.ok
          ? '✓ Connected. The Items and Transactions tabs are ready.'
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

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold text-slate-800">Settings</h1>

      {msg && <div className="rounded-md bg-brand-50 px-4 py-2 text-sm text-brand-700">{msg}</div>}

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
            {info?.hasKey ? (
              <span className="text-emerald-600">✓ Key loaded</span>
            ) : (
              <span className="text-slate-400">No key loaded</span>
            )}
          </span>
        </div>
        {info?.clientEmail && (
          <div className="rounded-md bg-slate-50 p-3 text-sm">
            <div className="mb-1 text-slate-500">
              Share your Google Sheet with this service account (as Editor):
            </div>
            <code className="break-all text-slate-800">{info.clientEmail}</code>
          </div>
        )}
        {info && !info.encryptionAvailable && (
          <p className="text-sm text-amber-600">
            OS encryption isn&apos;t available here, so the key is stored base64-encoded (not
            encrypted). It will be encrypted on a machine where the keychain is available.
          </p>
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
          “Test connection” saves the ID above, then does a real round-trip to Google — creating the
          Items and Transactions tabs if they don’t exist yet.
        </p>
      </Card>

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
    </div>
  )
}
