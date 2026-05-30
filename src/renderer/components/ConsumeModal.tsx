import { useState } from 'react'
import type { Item } from '@shared/types'
import { useData } from '../store'
import { Modal } from './Modal'
import { Button, Label, inputClass } from './ui'
import { qty as fmtQty } from '../format'

export function ConsumeModal({ item, onClose }: { item: Item; onClose: () => void }): JSX.Element {
  const { consume } = useData()
  const [amount, setAmount] = useState('1')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const n = Number(amount)
  const valid = Number.isFinite(n) && n > 0

  async function submit(): Promise<void> {
    if (!valid) return
    setBusy(true)
    try {
      await consume(item.id, n, note)
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={`Consume — ${item.name}`} onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-slate-500">
          On hand: {fmtQty(item.quantity)} {item.unit}
        </p>
        <div>
          <Label>Quantity to consume</Label>
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
          <Label>Note (optional)</Label>
          <input
            className={inputClass}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. handed out at orientation"
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!valid || busy}>
            Consume
          </Button>
        </div>
      </div>
    </Modal>
  )
}
