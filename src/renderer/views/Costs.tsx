import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useData } from '../store'
import { Button, Card, Label, inputClass, selectClass } from '../components/ui'
import { money } from '../format'

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

function Empty(): JSX.Element {
  return <p className="text-sm text-slate-400">No purchases logged yet.</p>
}

export default function Costs(): JSX.Element {
  const { items, transactions, receive } = useData()

  const purchases = useMemo(
    () =>
      transactions.filter(
        (t) => (t.type === 'receive' || t.type === 'initial') && (t.totalCost ?? 0) > 0
      ),
    [transactions]
  )
  const valuation = items.reduce((s, i) => s + i.quantity * i.unitCost, 0)
  const spendTotal = purchases.reduce((s, t) => s + (t.totalCost ?? 0), 0)

  const byDate = useMemo(() => {
    const m = new Map<string, number>()
    for (const t of purchases) {
      const d = t.timestamp.slice(0, 10)
      m.set(d, (m.get(d) ?? 0) + (t.totalCost ?? 0))
    }
    return [...m.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([date, total]) => ({ date, total: round2(total) }))
  }, [purchases])

  const byCategory = useMemo(() => {
    const cat = new Map(items.map((i) => [i.id, i.category || 'Uncategorized']))
    const m = new Map<string, number>()
    for (const t of purchases) {
      const c = cat.get(t.itemId) ?? 'Uncategorized'
      m.set(c, (m.get(c) ?? 0) + (t.totalCost ?? 0))
    }
    return [...m.entries()].map(([category, total]) => ({ category, total: round2(total) }))
  }, [purchases, items])

  const [pItem, setPItem] = useState('')
  const [pQty, setPQty] = useState('1')
  const [pCost, setPCost] = useState('0')
  const [pRef, setPRef] = useState('')
  const [busy, setBusy] = useState(false)
  const q = Number(pQty)
  const c = Number(pCost)
  const validPurchase = !!pItem && Number.isFinite(q) && q > 0 && Number.isFinite(c) && c >= 0

  async function logPurchase(): Promise<void> {
    if (!validPurchase) return
    setBusy(true)
    try {
      await receive(pItem, q, c, pRef)
      setPQty('1')
      setPCost('0')
      setPRef('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-800">Costs</h1>

      <div className="grid grid-cols-2 gap-4">
        <Card className="p-5">
          <div className="text-sm text-slate-500">Current valuation</div>
          <div className="mt-1 text-3xl font-semibold text-slate-800">{money(valuation)}</div>
        </Card>
        <Card className="p-5">
          <div className="text-sm text-slate-500">Total spend logged</div>
          <div className="mt-1 text-3xl font-semibold text-slate-800">{money(spendTotal)}</div>
        </Card>
      </div>

      <Card className="p-5">
        <h2 className="mb-3 font-semibold text-slate-700">Spend over time</h2>
        {byDate.length === 0 ? (
          <Empty />
        ) : (
          <div style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byDate}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(value) => money(Number(value))} />
                <Bar dataKey="total" fill="#2563eb" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <Card className="p-5">
        <h2 className="mb-3 font-semibold text-slate-700">Spend by category</h2>
        {byCategory.length === 0 ? (
          <Empty />
        ) : (
          <div style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byCategory} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" tick={{ fontSize: 12 }} />
                <YAxis type="category" dataKey="category" width={120} tick={{ fontSize: 12 }} />
                <Tooltip formatter={(value) => money(Number(value))} />
                <Bar dataKey="total" fill="#1d4ed8" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <Card className="p-5">
        <h2 className="mb-3 font-semibold text-slate-700">Log a purchase</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="col-span-2">
            <Label>Item</Label>
            <select className={selectClass} value={pItem} onChange={(e) => setPItem(e.target.value)}>
              <option value="">Select an item…</option>
              {items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Quantity</Label>
            <input
              className={inputClass}
              type="number"
              min="1"
              value={pQty}
              onChange={(e) => setPQty(e.target.value)}
            />
          </div>
          <div>
            <Label>Unit cost</Label>
            <input
              className={inputClass}
              type="number"
              min="0"
              step="0.01"
              value={pCost}
              onChange={(e) => setPCost(e.target.value)}
            />
          </div>
          <div className="col-span-2 md:col-span-3">
            <Label>Receipt reference (optional)</Label>
            <input
              className={inputClass}
              value={pRef}
              onChange={(e) => setPRef(e.target.value)}
              placeholder="Drive link or receipt #"
            />
          </div>
          <div className="flex items-end">
            <Button onClick={logPurchase} disabled={!validPurchase || busy} className="w-full">
              Log purchase ({money(q * c)})
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}
