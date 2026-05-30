import { Fragment, useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { Batch } from '@shared/types'
import { useData } from '../store'
import { api } from '../api'
import { Button, Card, Label, inputClass, selectClass } from '../components/ui'
import { Modal } from '../components/Modal'
import { dateShort, qty as fmtQty } from '../format'
import { DEFAULT_CATEGORIES } from '../constants'
import { rowsToCsv, tableToPdfBase64, toBase64Utf8 } from '../export'

function EditBatchModal({ batch, onClose }: { batch: Batch; onClose: () => void }): JSX.Element {
  const { updateBatchMeta } = useData()
  const [date, setDate] = useState(batch.timestamp.slice(0, 10))
  const [category, setCategory] = useState(batch.category)
  const [tags, setTags] = useState(batch.tags.join(', '))
  const [note, setNote] = useState(batch.note ?? '')
  const [busy, setBusy] = useState(false)

  async function save(): Promise<void> {
    setBusy(true)
    try {
      await updateBatchMeta(batch.id, {
        timestamp: new Date(`${date}T12:00:00`).toISOString(),
        category,
        tags: tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        note
      })
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="Edit batch details" onClose={onClose}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Date</Label>
            <input
              type="date"
              className={inputClass}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div>
            <Label>Category</Label>
            <input
              className={inputClass}
              list="edit-cats"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            />
            <datalist id="edit-cats">
              {DEFAULT_CATEGORIES.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
        </div>
        <div>
          <Label>Tags (comma-separated)</Label>
          <input className={inputClass} value={tags} onChange={(e) => setTags(e.target.value)} />
        </div>
        <div>
          <Label>Description / note</Label>
          <textarea
            className={inputClass}
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
        <p className="text-xs text-slate-400">
          Editing details doesn’t change quantities. To fix what was consumed, undo the batch and
          re-enter it.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy}>
            Save
          </Button>
        </div>
      </div>
    </Modal>
  )
}

export default function Usage(): JSX.Element {
  const { items, transactions, batches, voidBatch } = useData()
  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items])

  // Consumed units per item, per batch (consume entries only).
  const linesByBatch = useMemo(() => {
    const m = new Map<string, Map<string, number>>()
    for (const t of transactions) {
      if (!t.batchId || t.quantity >= 0) continue
      if (!m.has(t.batchId)) m.set(t.batchId, new Map())
      const im = m.get(t.batchId)!
      im.set(t.itemId, (im.get(t.itemId) ?? 0) + -t.quantity)
    }
    return m
  }, [transactions])

  const linesOf = (id: string): { itemId: string; qty: number }[] =>
    [...(linesByBatch.get(id) ?? new Map<string, number>()).entries()].map(([itemId, q]) => ({
      itemId,
      qty: q
    }))
  const unitsOf = (id: string): number => linesOf(id).reduce((s, l) => s + l.qty, 0)
  const nameOf = (id: string): string => itemById.get(id)?.name ?? id

  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [category, setCategory] = useState('')
  const [itemId, setItemId] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [editing, setEditing] = useState<Batch | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const categories = useMemo(
    () => Array.from(new Set(batches.map((b) => b.category).filter(Boolean))).sort(),
    [batches]
  )

  const filtered = useMemo(
    () =>
      [...batches]
        .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1))
        .filter((b) => {
          const d = b.timestamp.slice(0, 10)
          if (from && d < from) return false
          if (to && d > to) return false
          if (category && b.category !== category) return false
          if (itemId && !linesByBatch.get(b.id)?.has(itemId)) return false
          return true
        }),
    [batches, from, to, category, itemId, linesByBatch]
  )

  const activeFiltered = filtered.filter((b) => b.status === 'active')

  const byCategory = useMemo(() => {
    const m = new Map<string, number>()
    for (const b of activeFiltered) {
      const cat = b.category || 'Other'
      m.set(cat, (m.get(cat) ?? 0) + unitsOf(b.id))
    }
    return [...m.entries()].map(([cat, units]) => ({ cat, units }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFiltered, linesByBatch])

  const totalUnits = activeFiltered.reduce((s, b) => s + unitsOf(b.id), 0)

  function exportRows(): { head: string[]; body: (string | number)[][] } {
    const head = ['Date', 'Category', 'Tags', 'Item', 'Quantity', 'Status', 'Note']
    const body: (string | number)[][] = []
    for (const b of filtered) {
      for (const l of linesOf(b.id)) {
        body.push([
          dateShort(b.timestamp),
          b.category,
          b.tags.join(' '),
          nameOf(l.itemId),
          l.qty,
          b.status,
          b.note ?? ''
        ])
      }
    }
    return { head, body }
  }

  async function exportCsv(): Promise<void> {
    const { head, body } = exportRows()
    if (body.length === 0) {
      setMsg('Nothing to export for the current filters.')
      return
    }
    const r = await api.saveFile('usage.csv', toBase64Utf8(rowsToCsv([head, ...body])))
    if (r.ok) setMsg(`Saved CSV to ${r.path}`)
    else if (!r.canceled && r.error) setMsg(r.error)
  }

  async function exportPdf(): Promise<void> {
    const { head, body } = exportRows()
    if (body.length === 0) {
      setMsg('Nothing to export for the current filters.')
      return
    }
    const r = await api.saveFile('usage.pdf', tableToPdfBase64('Consumption report', head, body))
    if (r.ok) setMsg(`Saved PDF to ${r.path}`)
    else if (!r.canceled && r.error) setMsg(r.error)
  }

  async function undo(b: Batch): Promise<void> {
    if (!window.confirm('Undo this batch and put the stock back?')) return
    await voidBatch(b.id)
    setMsg('Batch undone — stock restored.')
  }

  function clearFilters(): void {
    setFrom('')
    setTo('')
    setCategory('')
    setItemId('')
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold text-slate-800">Usage</h1>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={exportCsv}>
            Export CSV
          </Button>
          <Button variant="secondary" onClick={exportPdf}>
            Export PDF
          </Button>
        </div>
      </div>

      {msg && <div className="rounded-md bg-brand-50 px-4 py-2 text-sm text-brand-700">{msg}</div>}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card className="p-4">
          <div className="text-sm text-slate-500">Batches</div>
          <div className="mt-1 text-2xl font-semibold text-slate-800">{activeFiltered.length}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-slate-500">Units consumed</div>
          <div className="mt-1 text-2xl font-semibold text-slate-800">{fmtQty(totalUnits)}</div>
        </Card>
        <Card className="p-4 md:col-span-2">
          <div className="mb-1 text-sm text-slate-500">Consumed units by category</div>
          {byCategory.length === 0 ? (
            <p className="py-4 text-sm text-slate-400">No data for these filters.</p>
          ) : (
            <div style={{ height: 120 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byCategory}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="cat" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="units" fill="#2563eb" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">From</label>
          <input
            type="date"
            className={inputClass}
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">To</label>
          <input
            type="date"
            className={inputClass}
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Category</label>
          <select
            className={selectClass}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">All</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Item</label>
          <select className={selectClass} value={itemId} onChange={(e) => setItemId(e.target.value)}>
            <option value="">All</option>
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
        </div>
        <Button variant="secondary" onClick={clearFilters}>
          Clear
        </Button>
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Items</th>
              <th className="px-4 py-3 text-right">Units</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                  No batches yet. Record one from the Consume tab.
                </td>
              </tr>
            )}
            {filtered.map((b) => {
              const bl = linesOf(b.id)
              const isOpen = expanded === b.id
              const voided = b.status === 'voided'
              return (
                <Fragment key={b.id}>
                  <tr className={voided ? 'bg-slate-50 text-slate-400' : 'hover:bg-slate-50'}>
                    <td className="px-4 py-3 whitespace-nowrap">{dateShort(b.timestamp)}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-700">{b.category || 'Other'}</div>
                      {b.tags.length > 0 && (
                        <div className="text-xs text-slate-400">{b.tags.join(', ')}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        className="text-left text-slate-600 hover:text-brand-600"
                        onClick={() => setExpanded(isOpen ? null : b.id)}
                      >
                        {bl.length} item{bl.length === 1 ? '' : 's'} {isOpen ? '▴' : '▾'}
                      </button>
                      {b.note && <div className="text-xs text-slate-400">{b.note}</div>}
                    </td>
                    <td className="px-4 py-3 text-right">{fmtQty(unitsOf(b.id))}</td>
                    <td className="px-4 py-3">
                      {voided ? (
                        <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs">Voided</span>
                      ) : (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">
                          Active
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" onClick={() => setEditing(b)}>
                          Edit
                        </Button>
                        {!voided && (
                          <Button variant="ghost" onClick={() => void undo(b)}>
                            Undo
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="bg-slate-50">
                      <td colSpan={6} className="px-6 py-2">
                        <ul className="text-sm text-slate-600">
                          {bl.map((l) => (
                            <li key={l.itemId} className="flex justify-between py-0.5">
                              <span>{nameOf(l.itemId)}</span>
                              <span className="text-slate-500">×{fmtQty(l.qty)}</span>
                            </li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </Card>

      {editing && <EditBatchModal batch={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}
