import { useState } from 'react'
import type { ChangeEvent } from 'react'
import type { Item } from '@shared/types'
import { useData } from '../store'
import { Modal } from './Modal'
import { Button, Label, inputClass } from './ui'

type FormState = {
  id: string
  name: string
  sku: string
  category: string
  unit: string
  quantity: string
  reorderThreshold: string
  unitCost: string
  reorderUrl: string
  supplier: string
  notes: string
}

function initial(item?: Item): FormState {
  return {
    id: item?.id ?? '',
    name: item?.name ?? '',
    sku: item?.sku ?? '',
    category: item?.category ?? '',
    unit: item?.unit ?? 'each',
    quantity: String(item?.quantity ?? 0),
    reorderThreshold: String(item?.reorderThreshold ?? 0),
    unitCost: String(item?.unitCost ?? 0),
    reorderUrl: item?.reorderUrl ?? '',
    supplier: item?.supplier ?? '',
    notes: item?.notes ?? ''
  }
}

export function ItemForm({ item, onClose }: { item?: Item; onClose: () => void }): JSX.Element {
  const { addItem, updateItem } = useData()
  const editing = !!item
  const [form, setForm] = useState<FormState>(() => initial(item))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set =
    (key: keyof FormState) =>
    (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>): void =>
      setForm((f) => ({ ...f, [key]: e.target.value }))

  async function submit(): Promise<void> {
    if (!form.name.trim()) {
      setError('Name is required.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      if (editing && item) {
        await updateItem(item.id, {
          name: form.name,
          sku: form.sku,
          category: form.category,
          unit: form.unit,
          reorderThreshold: Number(form.reorderThreshold) || 0,
          unitCost: Number(form.unitCost) || 0,
          reorderUrl: form.reorderUrl || undefined,
          supplier: form.supplier || undefined,
          notes: form.notes || undefined
        })
      } else {
        await addItem({
          id: form.id || undefined,
          name: form.name,
          sku: form.sku,
          category: form.category,
          unit: form.unit,
          quantity: Number(form.quantity) || 0,
          reorderThreshold: Number(form.reorderThreshold) || 0,
          unitCost: Number(form.unitCost) || 0,
          reorderUrl: form.reorderUrl || undefined,
          supplier: form.supplier || undefined,
          notes: form.notes || undefined
        })
      }
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={editing ? `Edit — ${item?.name}` : 'Add item'} onClose={onClose} wide>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Label>Name *</Label>
            <input className={inputClass} value={form.name} onChange={set('name')} autoFocus />
          </div>
          <div>
            <Label>SKU / variant</Label>
            <input
              className={inputClass}
              value={form.sku}
              onChange={set('sku')}
              placeholder="size / color"
            />
          </div>
          <div>
            <Label>Category</Label>
            <input className={inputClass} value={form.category} onChange={set('category')} />
          </div>
          <div>
            <Label>Unit</Label>
            <input
              className={inputClass}
              value={form.unit}
              onChange={set('unit')}
              placeholder="each / box / pack"
            />
          </div>
          <div>
            <Label>Quantity {editing && '(managed via consume / restock / adjust)'}</Label>
            <input
              className={inputClass}
              type="number"
              value={form.quantity}
              onChange={set('quantity')}
              disabled={editing}
            />
          </div>
          <div>
            <Label>Reorder threshold</Label>
            <input
              className={inputClass}
              type="number"
              min="0"
              value={form.reorderThreshold}
              onChange={set('reorderThreshold')}
            />
          </div>
          <div>
            <Label>Unit cost</Label>
            <input
              className={inputClass}
              type="number"
              min="0"
              step="0.01"
              value={form.unitCost}
              onChange={set('unitCost')}
            />
          </div>
          <div className="col-span-2">
            <Label>Reorder URL</Label>
            <input
              className={inputClass}
              value={form.reorderUrl}
              onChange={set('reorderUrl')}
              placeholder="https://supplier.example/product"
            />
          </div>
          <div className="col-span-2">
            <Label>Supplier</Label>
            <input className={inputClass} value={form.supplier} onChange={set('supplier')} />
          </div>
          <div className="col-span-2">
            <Label>Notes</Label>
            <textarea
              className={inputClass}
              rows={2}
              value={form.notes}
              onChange={set('notes')}
            />
          </div>
          {!editing && (
            <div className="col-span-2">
              <Label>Custom id (optional)</Label>
              <input
                className={inputClass}
                value={form.id}
                onChange={set('id')}
                placeholder="auto-generated from name if left blank"
              />
            </div>
          )}
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {editing ? 'Save changes' : 'Add item'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
