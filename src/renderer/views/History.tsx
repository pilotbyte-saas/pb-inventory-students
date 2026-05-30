import { useMemo, useState } from 'react'
import type { TransactionType } from '@shared/types'
import { useData } from '../store'
import { Button, Card, inputClass, selectClass } from '../components/ui'
import { dateTime, money, qty } from '../format'

const TYPES: TransactionType[] = ['initial', 'receive', 'consume', 'adjust']
const TYPE_LABEL: Record<TransactionType, string> = {
  initial: 'Initial',
  receive: 'Restock',
  consume: 'Consume',
  adjust: 'Adjust'
}

export default function History(): JSX.Element {
  const { items, transactions } = useData()
  const [itemId, setItemId] = useState('')
  const [type, setType] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const nameOf = (id: string): string => items.find((i) => i.id === id)?.name ?? id

  const rows = useMemo(
    () =>
      [...transactions]
        .reverse()
        .filter(
          (t) =>
            (!itemId || t.itemId === itemId) &&
            (!type || t.type === type) &&
            (!from || t.timestamp.slice(0, 10) >= from) &&
            (!to || t.timestamp.slice(0, 10) <= to)
        ),
    [transactions, itemId, type, from, to]
  )

  const clear = (): void => {
    setItemId('')
    setType('')
    setFrom('')
    setTo('')
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-slate-800">History</h1>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Item</label>
          <select
            className={selectClass}
            value={itemId}
            onChange={(e) => setItemId(e.target.value)}
          >
            <option value="">All items</option>
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Type</label>
          <select className={selectClass} value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">All types</option>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </div>
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
        <Button variant="secondary" onClick={clear}>
          Clear
        </Button>
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">When</th>
              <th className="px-4 py-3">Item</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3 text-right">Qty</th>
              <th className="px-4 py-3 text-right">Unit cost</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3">Note</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                  No matching transactions.
                </td>
              </tr>
            )}
            {rows.map((t) => (
              <tr key={t.id} className="hover:bg-slate-50">
                <td className="px-4 py-2 text-slate-500">{dateTime(t.timestamp)}</td>
                <td className="px-4 py-2 text-slate-700">{nameOf(t.itemId)}</td>
                <td className="px-4 py-2 text-slate-600">{TYPE_LABEL[t.type]}</td>
                <td
                  className={`px-4 py-2 text-right ${t.quantity < 0 ? 'text-red-600' : 'text-emerald-600'}`}
                >
                  {t.quantity > 0 ? '+' : ''}
                  {qty(t.quantity)}
                </td>
                <td className="px-4 py-2 text-right text-slate-600">
                  {t.unitCost != null ? money(t.unitCost) : '—'}
                </td>
                <td className="px-4 py-2 text-right text-slate-600">
                  {t.totalCost != null ? money(t.totalCost) : '—'}
                </td>
                <td className="px-4 py-2 text-slate-500">
                  {t.note ?? ''}
                  {t.receiptRef ? ` · ${t.receiptRef}` : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  )
}
