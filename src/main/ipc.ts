import { app, ipcMain, dialog, shell, BrowserWindow } from 'electron'
import { writeFileSync } from 'node:fs'
import type {
  AwsConfig,
  BatchLine,
  ConflictResolution,
  Item,
  NewBatchInput,
  NewItemInput,
  SyncBackend,
  TransactionFilter
} from '@shared/types'
import * as inventory from './inventory'
import * as batches from './batches'
import * as config from './config'
import * as manager from './sync/manager'
import * as updater from './updater'

// Registers every ipcMain.handle channel. The preload bridge maps window.api
// methods onto these channel names.
export function registerIpc(): void {
  ipcMain.handle('items:get', () => inventory.getItems())
  ipcMain.handle('transactions:get', (_e, filter?: TransactionFilter) =>
    inventory.getTransactions(filter)
  )

  ipcMain.handle('item:add', (_e, item: NewItemInput) => inventory.addItem(item))
  ipcMain.handle('item:update', (_e, id: string, patch: Partial<Item>) =>
    inventory.updateItem(id, patch)
  )
  ipcMain.handle('item:delete', (_e, id: string) => inventory.deleteItem(id))

  ipcMain.handle('inv:consume', (_e, itemId: string, qty: number, note?: string) =>
    inventory.consume(itemId, qty, note)
  )
  ipcMain.handle(
    'inv:receive',
    (_e, itemId: string, qty: number, unitCost: number, receiptRef?: string, note?: string) =>
      inventory.receive(itemId, qty, unitCost, receiptRef, note)
  )
  ipcMain.handle('inv:adjust', (_e, itemId: string, delta: number, note?: string) =>
    inventory.adjust(itemId, delta, note)
  )
  ipcMain.handle('inv:recompute', () => inventory.recomputeFromLedger())

  ipcMain.handle('batch:list', () => batches.getBatches())
  ipcMain.handle('template:list', () => batches.getTemplates())
  ipcMain.handle('batch:consume', (_e, input: NewBatchInput) => batches.consumeBatch(input))
  ipcMain.handle('batch:void', (_e, id: string) => batches.voidBatch(id))
  ipcMain.handle(
    'batch:updateMeta',
    (
      _e,
      id: string,
      patch: { timestamp?: string; category?: string; tags?: string[]; note?: string }
    ) => batches.updateBatchMeta(id, patch)
  )
  ipcMain.handle('txn:reverse', (_e, id: string) => batches.reverseTransaction(id))
  ipcMain.handle('template:save', (_e, name: string, lines: BatchLine[]) =>
    batches.saveTemplate(name, lines)
  )
  ipcMain.handle(
    'template:update',
    (_e, id: string, patch: { name?: string; lines?: BatchLine[] }) =>
      batches.updateTemplate(id, patch)
  )
  ipcMain.handle('template:delete', (_e, id: string) => batches.deleteTemplate(id))
  ipcMain.handle('file:save', async (_e, defaultName: string, base64: string) => {
    const win = BrowserWindow.getFocusedWindow() ?? undefined
    const res = await dialog.showSaveDialog(win!, { defaultPath: defaultName })
    if (res.canceled || !res.filePath) return { ok: false, canceled: true }
    try {
      writeFileSync(res.filePath, Buffer.from(base64, 'base64'))
      return { ok: true, path: res.filePath }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('sync:status', () => manager.getStatus())
  ipcMain.handle('sync:now', () => manager.sync())
  ipcMain.handle('sync:test', () => manager.testConnection())
  ipcMain.handle('sync:conflicts', () => manager.getConflicts())
  ipcMain.handle('sync:resolve', (_e, resolutions: ConflictResolution[]) =>
    manager.resolveConflicts(resolutions)
  )

  ipcMain.handle('cred:has', () => config.hasCredentials())
  ipcMain.handle('cred:info', () => config.getBackendInfo())
  ipcMain.handle('cred:setBackend', (_e, backend: SyncBackend) => {
    config.setBackend(backend)
    manager.reconfigure()
  })
  ipcMain.handle('cred:setAws', (_e, cfg: AwsConfig) => {
    config.setAwsConfig(cfg)
    manager.reconfigure()
  })

  ipcMain.handle('shell:openExternal', (_e, url: string) => shell.openExternal(url))

  ipcMain.handle('app:version', () => app.getVersion())
  ipcMain.handle('update:check', () => updater.checkForUpdates())
}
