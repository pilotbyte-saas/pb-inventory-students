import type { Item } from '@shared/types'

// Round every number that reaches the screen — float math leaks artifacts.
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

export function money(n: number | undefined | null): string {
  return round2(n ?? 0).toLocaleString(undefined, { style: 'currency', currency: 'USD' })
}

export function qty(n: number | undefined | null): string {
  return String(round2(n ?? 0))
}

export function dateTime(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  return isNaN(d.getTime()) ? iso : d.toLocaleString()
}

export function dateShort(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString()
}

export function relTime(iso: string | null): string {
  if (!iso) return 'never'
  const t = new Date(iso).getTime()
  if (isNaN(t)) return 'never'
  const secs = Math.round((Date.now() - t) / 1000)
  if (secs < 60) return 'just now'
  const mins = Math.round(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return dateShort(iso)
}

export type ItemStatus = 'ok' | 'low' | 'out'

export function itemStatus(item: Pick<Item, 'quantity' | 'reorderThreshold'>): ItemStatus {
  if (item.quantity <= 0) return 'out'
  if (item.quantity <= item.reorderThreshold) return 'low'
  return 'ok'
}
