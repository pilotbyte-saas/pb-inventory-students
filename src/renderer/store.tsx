import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { Item, NewItemInput, SyncStatus, Transaction } from '@shared/types'
import { api } from './api'

// Holds the cached data and exposes action wrappers that call the main process
// and then refresh. The UI reads from here; it never talks to IPC directly
// except for one-off Settings calls.
interface DataContextValue {
  items: Item[]
  transactions: Transaction[]
  sync: SyncStatus
  ready: boolean
  refresh: () => Promise<void>
  addItem: (input: NewItemInput) => Promise<void>
  updateItem: (id: string, patch: Partial<Item>) => Promise<void>
  consume: (itemId: string, qty: number, note?: string) => Promise<void>
  receive: (
    itemId: string,
    qty: number,
    unitCost: number,
    receiptRef?: string,
    note?: string
  ) => Promise<void>
  adjust: (itemId: string, delta: number, note?: string) => Promise<void>
  recompute: () => Promise<void>
  syncNow: () => Promise<void>
}

const DataContext = createContext<DataContextValue | null>(null)

export function DataProvider({ children }: { children: ReactNode }): JSX.Element {
  const [items, setItems] = useState<Item[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [sync, setSync] = useState<SyncStatus>({ state: 'offline', lastSyncedAt: null, pending: 0 })
  const [ready, setReady] = useState(false)

  const refresh = useCallback(async () => {
    const [i, t, s] = await Promise.all([
      api.getItems(),
      api.getTransactions(),
      api.getSyncStatus()
    ])
    setItems(i)
    setTransactions(t)
    setSync(s)
    setReady(true)
  }, [])

  useEffect(() => {
    void refresh()
    const off = api.onSyncStatus((s) => {
      setSync(s)
      // A completed sync may have pulled changes — reload the working copy.
      if (s.state === 'synced') void refresh()
    })
    const onOnline = (): void => void api.syncNow()
    window.addEventListener('online', onOnline)
    return () => {
      off()
      window.removeEventListener('online', onOnline)
    }
  }, [refresh])

  const addItem = useCallback(
    async (input: NewItemInput) => {
      await api.addItem(input)
      await refresh()
    },
    [refresh]
  )
  const updateItem = useCallback(
    async (id: string, patch: Partial<Item>) => {
      await api.updateItem(id, patch)
      await refresh()
    },
    [refresh]
  )
  const consume = useCallback(
    async (itemId: string, q: number, note?: string) => {
      await api.consume(itemId, q, note)
      await refresh()
    },
    [refresh]
  )
  const receive = useCallback(
    async (itemId: string, q: number, unitCost: number, receiptRef?: string, note?: string) => {
      await api.receive(itemId, q, unitCost, receiptRef, note)
      await refresh()
    },
    [refresh]
  )
  const adjust = useCallback(
    async (itemId: string, delta: number, note?: string) => {
      await api.adjust(itemId, delta, note)
      await refresh()
    },
    [refresh]
  )
  const recompute = useCallback(async () => {
    await api.recompute()
    await refresh()
  }, [refresh])
  const syncNow = useCallback(async () => {
    await api.syncNow()
    await refresh()
  }, [refresh])

  const value = useMemo<DataContextValue>(
    () => ({
      items,
      transactions,
      sync,
      ready,
      refresh,
      addItem,
      updateItem,
      consume,
      receive,
      adjust,
      recompute,
      syncNow
    }),
    [
      items,
      transactions,
      sync,
      ready,
      refresh,
      addItem,
      updateItem,
      consume,
      receive,
      adjust,
      recompute,
      syncNow
    ]
  )

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function useData(): DataContextValue {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData must be used within a DataProvider')
  return ctx
}
