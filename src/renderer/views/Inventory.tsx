import { useMemo, useState } from 'react'
import type { Item } from '@shared/types'
import { useData } from '../store'
import { Button, Card, StatusBadge, inputClass, selectClass } from '../components/ui'
import { itemStatus, money, qty } from '../format'
import { ConsumeModal } from '../components/ConsumeModal'
import { ReceiveModal } from '../components/ReceiveModal'
import { ItemForm } from '../components/ItemForm'

export default function Inventory(): JSX.Element {
  const { items } = useData()
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [consumeItem, setConsumeItem] = useState<Item | null>(null)
  const [receiveItem, setReceiveItem] = useState<Item | null>(null)
  const [editItem, setEditItem] = useState<Item | null>(null)
  const [adding, setAdding] = useState(false)

  const categories = useMemo(
    () => Array.from(new Set(items.map((i) => i.category).filter(Boolean))).sort(),
    [items]
  )

  const filtered = items.filter((i) => {
    const q = search.trim().toLowerCase()
    const matchesText =
      !q ||
      i.name.toLowerCase().includes(q) ||
      i.sku.toLowerCase().includes(q) ||
      i.id.toLowerCase().includes(q)
    return matchesText && (!category || i.category === category)
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-800">Inventory</h1>
        <Button onClick={() => setAdding(true)}>+ Add item</Button>
      </div>

      <div className="flex flex-wrap gap-3">
        <input
          className={`${inputClass} max-w-xs`}
          placeholder="Search name, SKU, or id…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className={`${selectClass} max-w-xs`}
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">Item</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3 text-right">On hand</th>
              <th className="px-4 py-3 text-right">Unit cost</th>
              <th className="px-4 py-3 text-right">Value</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                  No items yet. Click “Add item” to start.
                </td>
              </tr>
            )}
            {filtered.map((i) => (
              <tr key={i.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-800">{i.name}</div>
                  {i.sku && <div className="text-xs text-slate-400">{i.sku}</div>}
                </td>
                <td className="px-4 py-3 text-slate-600">{i.category || '—'}</td>
                <td className="px-4 py-3 text-right text-slate-700">
                  {qty(i.quantity)} <span className="text-slate-400">{i.unit}</span>
                </td>
                <td className="px-4 py-3 text-right text-slate-700">{money(i.unitCost)}</td>
                <td className="px-4 py-3 text-right text-slate-700">
                  {money(i.quantity * i.unitCost)}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={itemStatus(i)} />
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" onClick={() => setConsumeItem(i)}>
                      Consume
                    </Button>
                    <Button variant="ghost" onClick={() => setReceiveItem(i)}>
                      Restock
                    </Button>
                    <Button variant="ghost" onClick={() => setEditItem(i)}>
                      Edit
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {consumeItem && <ConsumeModal item={consumeItem} onClose={() => setConsumeItem(null)} />}
      {receiveItem && <ReceiveModal item={receiveItem} onClose={() => setReceiveItem(null)} />}
      {editItem && <ItemForm item={editItem} onClose={() => setEditItem(null)} />}
      {adding && <ItemForm onClose={() => setAdding(false)} />}
    </div>
  )
}
