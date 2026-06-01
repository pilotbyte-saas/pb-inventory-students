import type { TransactionType } from '@shared/types'
import type { View } from '../App'
import { useData } from '../store'
import { Card } from '../components/ui'
import { dateTime, itemStatus, money, qty } from '../format'

const TYPE_LABEL: Record<TransactionType, string> = {
  initial: 'Initial',
  receive: 'Restock',
  consume: 'Consume',
  adjust: 'Adjust',
  delete: 'Deleted'
}

export default function Dashboard({ onNavigate }: { onNavigate: (v: View) => void }): JSX.Element {
  const { items, transactions } = useData()
  const totalValue = items.reduce((s, i) => s + i.quantity * i.unitCost, 0)
  const lowItems = items.filter((i) => itemStatus(i) !== 'ok')
  const nameOf = (id: string): string => items.find((i) => i.id === id)?.name ?? id
  const recent = [...transactions].reverse().slice(0, 10)

  const cards: { label: string; value: string; to: View }[] = [
    { label: 'Items tracked', value: String(items.length), to: 'inventory' },
    { label: 'Inventory value', value: money(totalValue), to: 'costs' },
    { label: 'Low / out of stock', value: String(lowItems.length), to: 'low' }
  ]

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-800">Dashboard</h1>

      <div className="grid grid-cols-3 gap-4">
        {cards.map((c) => (
          <Card key={c.label} className="p-0">
            <button
              onClick={() => onNavigate(c.to)}
              className="w-full rounded-lg p-5 text-left hover:bg-slate-50"
            >
              <div className="text-sm text-slate-500">{c.label}</div>
              <div className="mt-1 text-3xl font-semibold text-slate-800">{c.value}</div>
            </button>
          </Card>
        ))}
      </div>

      <Card className="p-5">
        <h2 className="mb-3 font-semibold text-slate-700">Recent activity</h2>
        {recent.length === 0 ? (
          <p className="text-sm text-slate-400">
            No activity yet. Add an item or log a purchase to get started.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {recent.map((t) => (
              <li key={t.id} className="flex items-center justify-between py-2 text-sm">
                <div>
                  <span className="font-medium text-slate-700">{nameOf(t.itemId)}</span>
                  <span className="ml-2 text-slate-400">{TYPE_LABEL[t.type]}</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className={t.quantity < 0 ? 'text-red-600' : 'text-emerald-600'}>
                    {t.quantity > 0 ? '+' : ''}
                    {qty(t.quantity)}
                  </span>
                  <span className="text-slate-400">{dateTime(t.timestamp)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
