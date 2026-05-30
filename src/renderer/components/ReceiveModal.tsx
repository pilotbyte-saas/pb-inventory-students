import { useState } from 'react'
import type { Item } from '@shared/types'
import { useData } from '../store'
import { Modal } from './Modal'
import { Button, Label, inputClass } from './ui'
import { money, qty as fmtQty } from '../format'

export function ReceiveModal({ item, onClose }: { item: Item; onClose: () => void }): JSX.Element {
  const { receive } = useData()
  const [amount, setAmount] = useState('1')
  const [cost, setCost] = useState(String(item.unitCost ?? 0))
  const [receipt, setReceipt] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const q = Number(amount)
  const c = Number(cost)
  const valid = Number.isFinite(q) && q > 0 && Number.isFinite(c) && c >= 0

  async function submit(): Promise<void> {
    if (!valid) return
    setBusy(true)
    try {
      await receive(item.id, q, c, receipt, note)
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={`Restock — ${item.name}`} onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-slate-500">
          On hand: {fmtQty(item.quantity)} {item.unit}
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Quantity received</Label>
            <input
              className={inputClass}
              type="number"
              min="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              autoFocus
            />
          </div>
          <div>
            <Label>Unit cost</Label>
            <input
              className={inputClass}
              type="number"
              min="0"
              step="0.01"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
            />
          </div>
        </div>
        <div className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">
          Total cost: <span className="font-medium text-slate-800">{money(q * c)}</span>
        </div>
        <div>
          <Label>Receipt reference (optional)</Label>
          <input
            className={inputClass}
            value={receipt}
            onChange={(e) => setReceipt(e.target.value)}
            placeholder="Drive link or receipt #"
          />
        </div>
        <div>
          <Label>Note (optional)</Label>
          <input className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!valid || busy}>
            Restock
          </Button>
        </div>
      </div>
    </Modal>
  )
}
