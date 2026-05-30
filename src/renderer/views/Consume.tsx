import { useMemo, useState } from 'react'
import type { BatchLine } from '@shared/types'
import { useData } from '../store'
import { Button, Card, Label, inputClass, selectClass } from '../components/ui'
import { qty as fmtQty } from '../format'
import { DEFAULT_CATEGORIES } from '../constants'

function todayStr(): string {
  const d = new Date()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

function Stepper({
  value,
  onDec,
  onInc,
  onSet
}: {
  value: number
  onDec: () => void
  onInc: () => void
  onSet: (n: number) => void
}): JSX.Element {
  const btn = 'h-7 w-7 rounded border border-slate-300 text-slate-600 hover:bg-slate-100'
  return (
    <div className="inline-flex items-center gap-1">
      <button onClick={onDec} className={btn} aria-label="decrease">
        −
      </button>
      <input
        className="w-14 rounded border border-slate-300 px-2 py-1 text-center text-sm"
        type="number"
        min="0"
        value={value}
        onChange={(e) => onSet(Number(e.target.value))}
      />
      <button onClick={onInc} className={btn} aria-label="increase">
        ＋
      </button>
    </div>
  )
}

export default function Consume(): JSX.Element {
  const { items, templates, consumeBatch, saveTemplate, deleteTemplate } = useData()
  const [search, setSearch] = useState('')
  const [lines, setLines] = useState<BatchLine[]>([])
  const [date, setDate] = useState(todayStr())
  const [category, setCategory] = useState(DEFAULT_CATEGORIES[0])
  const [tags, setTags] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [showTemplates, setShowTemplates] = useState(false)

  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items])
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items
      .filter((i) => !q || i.name.toLowerCase().includes(q) || i.sku.toLowerCase().includes(q))
      .slice(0, 200)
  }, [items, search])

  const qtyOf = (id: string): number => lines.find((l) => l.itemId === id)?.quantity ?? 0

  function setQty(id: string, n: number): void {
    const q = Math.max(0, Math.round(Number.isFinite(n) ? n : 0))
    setLines((prev) => {
      const exists = prev.some((l) => l.itemId === id)
      if (!exists) return q > 0 ? [...prev, { itemId: id, quantity: q }] : prev
      return prev.flatMap((l) =>
        l.itemId === id ? (q > 0 ? [{ ...l, quantity: q }] : []) : [l]
      )
    })
  }
  const add = (id: string): void => setQty(id, qtyOf(id) + 1)
  const dec = (id: string): void => setQty(id, qtyOf(id) - 1)
  const removeLine = (id: string): void => setLines((p) => p.filter((l) => l.itemId !== id))

  const totalUnits = lines.reduce((s, l) => s + l.quantity, 0)

  function loadTemplate(id: string): void {
    const t = templates.find((x) => x.id === id)
    if (!t) return
    setLines((prev) => {
      const map = new Map(prev.map((l) => [l.itemId, l.quantity]))
      for (const l of t.lines) map.set(l.itemId, (map.get(l.itemId) ?? 0) + l.quantity)
      return [...map.entries()].map(([itemId, quantity]) => ({ itemId, quantity }))
    })
    setMsg(`Loaded template “${t.name}”.`)
  }

  async function submit(): Promise<void> {
    if (lines.length === 0) {
      setMsg('Add at least one item.')
      return
    }
    setBusy(true)
    setMsg(null)
    try {
      await consumeBatch({
        timestamp: new Date(`${date}T12:00:00`).toISOString(),
        category,
        tags: tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        note,
        lines
      })
      setLines([])
      setTags('')
      setNote('')
      setMsg('Batch consumed and queued for sync.')
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function saveAsTemplate(): Promise<void> {
    if (lines.length === 0) {
      setMsg('Build a cart first, then save it as a template.')
      return
    }
    const name = window.prompt('Template name (e.g. "LiDAR training kit")')?.trim()
    if (!name) return
    await saveTemplate(name, lines)
    setMsg(`Template “${name}” saved.`)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold text-slate-800">Consume</h1>
        <div className="flex items-center gap-2">
          <select
            className={selectClass}
            value=""
            onChange={(e) => {
              if (e.target.value) loadTemplate(e.target.value)
            }}
          >
            <option value="">Load template…</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <Button variant="secondary" onClick={saveAsTemplate}>
            Save as template
          </Button>
          <Button variant="ghost" onClick={() => setShowTemplates((s) => !s)}>
            Manage
          </Button>
        </div>
      </div>

      {msg && <div className="rounded-md bg-brand-50 px-4 py-2 text-sm text-brand-700">{msg}</div>}

      {showTemplates && (
        <Card className="p-4">
          <h2 className="mb-2 text-sm font-semibold text-slate-700">Templates</h2>
          {templates.length === 0 ? (
            <p className="text-sm text-slate-400">
              No templates yet. Build a cart and click “Save as template”.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {templates.map((t) => (
                <li key={t.id} className="flex items-center justify-between py-2 text-sm">
                  <span>
                    {t.name} <span className="text-slate-400">· {t.lines.length} items</span>
                  </span>
                  <div className="flex gap-1">
                    <Button variant="ghost" onClick={() => loadTemplate(t.id)}>
                      Load
                    </Button>
                    <Button variant="ghost" onClick={() => void deleteTemplate(t.id)}>
                      Delete
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="flex flex-col p-4">
          <input
            className={inputClass}
            placeholder="Search items to add…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="mt-3 max-h-[28rem] divide-y divide-slate-100 overflow-auto">
            {filtered.length === 0 && (
              <p className="py-6 text-center text-sm text-slate-400">No items found.</p>
            )}
            {filtered.map((i) => {
              const inCart = qtyOf(i.id)
              return (
                <div key={i.id} className="flex items-center justify-between gap-2 py-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-slate-800">{i.name}</div>
                    <div className="text-xs text-slate-400">
                      {i.sku ? i.sku + ' · ' : ''}on hand {fmtQty(i.quantity)} {i.unit}
                    </div>
                  </div>
                  {inCart > 0 ? (
                    <Stepper
                      value={inCart}
                      onDec={() => dec(i.id)}
                      onInc={() => add(i.id)}
                      onSet={(n) => setQty(i.id, n)}
                    />
                  ) : (
                    <Button variant="secondary" onClick={() => add(i.id)}>
                      Add
                    </Button>
                  )}
                </div>
              )
            })}
          </div>
        </Card>

        <div className="space-y-4">
          <Card className="p-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-700">Cart</h2>
              <span className="text-xs text-slate-400">
                {lines.length} items · {fmtQty(totalUnits)} units
              </span>
            </div>
            {lines.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-400">
                Click items on the left to build a batch.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {lines.map((l) => {
                  const item = itemById.get(l.itemId)
                  const over = item ? l.quantity > item.quantity : false
                  return (
                    <li key={l.itemId} className="flex items-center justify-between gap-2 py-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm text-slate-800">
                          {item?.name ?? l.itemId}
                        </div>
                        {over && (
                          <div className="text-xs text-amber-600">
                            only {fmtQty(item?.quantity ?? 0)} on hand — will consume what’s
                            available
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Stepper
                          value={l.quantity}
                          onDec={() => dec(l.itemId)}
                          onInc={() => add(l.itemId)}
                          onSet={(n) => setQty(l.itemId, n)}
                        />
                        <button
                          onClick={() => removeLine(l.itemId)}
                          className="text-slate-400 hover:text-red-600"
                          aria-label="remove"
                        >
                          ✕
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>

          <Card className="space-y-3 p-4">
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
                  list="batch-cats"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                />
                <datalist id="batch-cats">
                  {DEFAULT_CATEGORIES.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>
            </div>
            <div>
              <Label>Tags (comma-separated)</Label>
              <input
                className={inputClass}
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="e.g. client-name, outdoor"
              />
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
            <Button onClick={submit} disabled={busy || lines.length === 0} className="w-full">
              Consume {lines.length > 0 ? `${lines.length} item${lines.length === 1 ? '' : 's'}` : 'batch'}
            </Button>
          </Card>
        </div>
      </div>
    </div>
  )
}
