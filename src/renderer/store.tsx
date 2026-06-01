import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type {
  Batch,
  BatchLine,
  ConflictItem,
  ConflictResolution,
  Item,
  NewBatchInput,
  NewItemInput,
  SyncStatus,
  Template,
  Transaction
} from '@shared/types'
import { api } from './api'

type BatchMetaPatch = { timestamp?: string; category?: string; tags?: string[]; note?: string }
type TemplatePatch = { name?: string; lines?: BatchLine[] }

interface DataContextValue {
  items: Item[]
  transactions: Transaction[]
  batches: Batch[]
  templates: Template[]
  conflicts: ConflictItem[]
  sync: SyncStatus
  ready: boolean
  refresh: () => Promise<void>
  addItem: (input: NewItemInput) => Promise<void>
  updateItem: (id: string, patch: Partial<Item>) => Promise<void>
  deleteItem: (id: string) => Promise<void>
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
  consumeBatch: (input: NewBatchInput) => Promise<void>
  voidBatch: (id: string) => Promise<void>
  updateBatchMeta: (id: string, patch: BatchMetaPatch) => Promise<void>
  reverseTransaction: (id: string) => Promise<void>
  saveTemplate: (name: string, lines: BatchLine[]) => Promise<void>
  updateTemplate: (id: string, patch: TemplatePatch) => Promise<void>
  deleteTemplate: (id: string) => Promise<void>
  resolveConflicts: (resolutions: ConflictResolution[]) => Promise<void>
}

const DataContext = createContext<DataContextValue | null>(null)

export function DataProvider({ children }: { children: ReactNode }): JSX.Element {
  const [items, setItems] = useState<Item[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [batches, setBatches] = useState<Batch[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [conflicts, setConflicts] = useState<ConflictItem[]>([])
  const [sync, setSync] = useState<SyncStatus>({ state: 'local', lastSyncedAt: null, pending: 0 })
  const [ready, setReady] = useState(false)

  const refresh = useCallback(async () => {
    const [i, t, b, tpl, s] = await Promise.all([
      api.getItems(),
      api.getTransactions(),
      api.getBatches(),
      api.getTemplates(),
      api.getSyncStatus()
    ])
    setItems(i)
    setTransactions(t)
    setBatches(b)
    setTemplates(tpl)
    setSync(s)
    setConflicts(s.state === 'conflict' ? await api.getConflicts() : [])
    setReady(true)
  }, [])

  useEffect(() => {
    void refresh()
    const off = api.onSyncStatus((s) => {
      setSync(s)
      if (s.state === 'conflict') void api.getConflicts().then(setConflicts)
      else setConflicts([])
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
  const deleteItem = useCallback(
    async (id: string) => {
      await api.deleteItem(id)
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
  const consumeBatch = useCallback(
    async (input: NewBatchInput) => {
      await api.consumeBatch(input)
      await refresh()
    },
    [refresh]
  )
  const voidBatch = useCallback(
    async (id: string) => {
      await api.voidBatch(id)
      await refresh()
    },
    [refresh]
  )
  const updateBatchMeta = useCallback(
    async (id: string, patch: BatchMetaPatch) => {
      await api.updateBatchMeta(id, patch)
      await refresh()
    },
    [refresh]
  )
  const reverseTransaction = useCallback(
    async (id: string) => {
      await api.reverseTransaction(id)
      await refresh()
    },
    [refresh]
  )
  const saveTemplate = useCallback(
    async (name: string, lines: BatchLine[]) => {
      await api.saveTemplate(name, lines)
      await refresh()
    },
    [refresh]
  )
  const updateTemplate = useCallback(
    async (id: string, patch: TemplatePatch) => {
      await api.updateTemplate(id, patch)
      await refresh()
    },
    [refresh]
  )
  const deleteTemplate = useCallback(
    async (id: string) => {
      await api.deleteTemplate(id)
      await refresh()
    },
    [refresh]
  )
  const resolveConflicts = useCallback(
    async (resolutions: ConflictResolution[]) => {
      await api.resolveConflicts(resolutions)
      await refresh()
    },
    [refresh]
  )

  const value = useMemo<DataContextValue>(
    () => ({
      items,
      transactions,
      batches,
      templates,
      conflicts,
      sync,
      ready,
      refresh,
      addItem,
      updateItem,
      deleteItem,
      consume,
      receive,
      adjust,
      recompute,
      syncNow,
      consumeBatch,
      voidBatch,
      updateBatchMeta,
      reverseTransaction,
      saveTemplate,
      updateTemplate,
      deleteTemplate,
      resolveConflicts
    }),
    [
      items,
      transactions,
      batches,
      templates,
      conflicts,
      sync,
      ready,
      refresh,
      addItem,
      updateItem,
      deleteItem,
      consume,
      receive,
      adjust,
      recompute,
      syncNow,
      consumeBatch,
      voidBatch,
      updateBatchMeta,
      reverseTransaction,
      saveTemplate,
      updateTemplate,
      deleteTemplate,
      resolveConflicts
    ]
  )

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function useData(): DataContextValue {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData must be used within a DataProvider')
  return ctx
}
