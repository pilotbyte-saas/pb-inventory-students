import { useState } from 'react'
import type { ConflictAction, ConflictItem, ConflictResolution } from '@shared/types'
import { useData } from '../store'
import { Modal } from './Modal'
import { Button } from './ui'
import { money, qty } from '../format'

function defaultAction(c: ConflictItem): ConflictAction {
  return c.type === 'duplicate' ? 'merge' : 'keepLocal'
}

// Blocking prompt shown when a local→cloud sync finds clashes. The user picks
// Merge / Keep-as-new (duplicates) or Keep-mine / Keep-cloud (divergent edits),
// then the sync continues.
export function ConflictModal(): JSX.Element | null {
  const { conflicts, resolveConflicts } = useData()
  const [choices, setChoices] = useState<Record<string, ConflictAction>>({})
  const [busy, setBusy] = useState(false)

  if (conflicts.length === 0) return null

  const keyOf = (c: ConflictItem): string => `${c.local.id}|${c.remote.id}`
  const chosen = (c: ConflictItem): ConflictAction => choices[keyOf(c)] ?? defaultAction(c)
  const choose = (c: ConflictItem, a: ConflictAction): void =>
    setChoices((prev) => ({ ...prev, [keyOf(c)]: a }))

  function opt(c: ConflictItem, action: ConflictAction, label: string, desc: string): JSX.Element {
    const active = chosen(c) === action
    return (
      <button
        onClick={() => choose(c, action)}
        className={`flex-1 rounded-md border px-3 py-2 text-left text-xs ${
          active
            ? 'border-brand-500 bg-brand-50 text-brand-700'
            : 'border-slate-200 hover:bg-slate-50'
        }`}
      >
        <div className="font-medium">{label}</div>
        <div className="text-[11px] text-slate-500">{desc}</div>
      </button>
    )
  }

  async function apply(): Promise<void> {
    setBusy(true)
    try {
      const resolutions: ConflictResolution[] = conflicts.map((c) => ({
        localId: c.local.id,
        remoteId: c.remote.id,
        action: chosen(c)
      }))
      await resolveConflicts(resolutions)
      setChoices({})
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={`Resolve ${conflicts.length} sync conflict${conflicts.length === 1 ? '' : 's'}`}
      onClose={() => {}}
      closable={false}
      wide
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          These local items clash with what&apos;s already in the cloud. Choose how to handle each,
          then sync.
        </p>
        <div className="max-h-[60vh] space-y-3 overflow-auto pr-1">
          {conflicts.map((c) => (
            <div key={keyOf(c)} className="rounded-md border border-slate-200 p-3">
              <div className="text-sm font-medium text-slate-800">
                {c.local.name}
                {c.local.sku ? ` (${c.local.sku})` : ''}
              </div>
              <div className="mb-2 text-xs text-slate-500">{c.reason}</div>
              <div className="mb-3 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded bg-slate-50 p-2">
                  <div className="font-medium text-slate-600">This device</div>
                  <div className="text-slate-500">
                    {qty(c.local.quantity)} {c.local.unit} · {money(c.local.unitCost)}
                  </div>
                </div>
                <div className="rounded bg-slate-50 p-2">
                  <div className="font-medium text-slate-600">Cloud</div>
                  <div className="text-slate-500">
                    {qty(c.remote.quantity)} {c.remote.unit} · {money(c.remote.unitCost)}
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                {c.type === 'duplicate' ? (
                  <>
                    {opt(c, 'merge', 'Merge', 'Fold into the cloud item (keeps one record)')}
                    {opt(c, 'keepNew', 'Keep as new', 'Add this as a separate item')}
                  </>
                ) : (
                  <>
                    {opt(c, 'keepLocal', 'Keep mine', 'Overwrite the cloud copy')}
                    {opt(c, 'keepRemote', 'Keep cloud', 'Discard my local change')}
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-end">
          <Button onClick={apply} disabled={busy}>
            {busy ? 'Syncing…' : 'Apply & sync'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
