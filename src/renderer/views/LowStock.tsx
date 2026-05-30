import { useData } from '../store'
import { api } from '../api'
import { Button, Card } from '../components/ui'
import { qty } from '../format'

export default function LowStock(): JSX.Element {
  const { items } = useData()
  const low = items
    .filter((i) => i.quantity <= i.reorderThreshold)
    .sort((a, b) => a.quantity - a.reorderThreshold - (b.quantity - b.reorderThreshold))

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-slate-800">Low stock</h1>
      {low.length === 0 ? (
        <Card className="p-8 text-center text-slate-400">
          Everything is above its reorder threshold.
        </Card>
      ) : (
        <div className="grid gap-3">
          {low.map((i) => (
            <Card key={i.id} className="flex items-center justify-between p-4">
              <div>
                <div className="font-medium text-slate-800">
                  {i.name}
                  {i.sku && <span className="ml-1 text-sm text-slate-400">({i.sku})</span>}
                </div>
                <div className="text-sm text-slate-500">
                  On hand{' '}
                  <span
                    className={
                      i.quantity <= 0 ? 'font-semibold text-red-600' : 'font-semibold text-amber-600'
                    }
                  >
                    {qty(i.quantity)}
                  </span>{' '}
                  {i.unit} · threshold {qty(i.reorderThreshold)}
                  {i.supplier ? ` · ${i.supplier}` : ''}
                </div>
              </div>
              {i.reorderUrl ? (
                <Button onClick={() => void api.openExternal(i.reorderUrl as string)}>
                  Reorder ↗
                </Button>
              ) : (
                <Button variant="secondary" disabled>
                  No reorder link
                </Button>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
