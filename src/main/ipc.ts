import { ipcMain, dialog, shell, BrowserWindow } from 'electron'
import { readFileSync } from 'node:fs'
import type { CredentialInfo, Item, NewItemInput, TransactionFilter } from '@shared/types'
import * as inventory from './inventory'
import * as config from './config'
import * as manager from './sync/manager'

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

  ipcMain.handle('sync:status', () => manager.getStatus())
  ipcMain.handle('sync:now', () => manager.sync())
  ipcMain.handle('sync:test', () => manager.testConnection())

  ipcMain.handle('cred:has', () => config.hasCredentials())
  ipcMain.handle('cred:set', (_e, jsonKey: string) => {
    config.setCredentials(jsonKey)
    manager.reconfigure()
  })
  ipcMain.handle('cred:setSpreadsheet', (_e, id: string) => {
    config.setSpreadsheetId(id)
    manager.reconfigure()
  })
  ipcMain.handle('cred:info', (): CredentialInfo => {
    return {
      hasKey: config.hasKeyStored(),
      hasSpreadsheet: !!config.getSpreadsheetId(),
      clientEmail: config.getClientEmail(),
      spreadsheetId: config.getSpreadsheetId(),
      encryptionAvailable: config.encryptionAvailable()
    }
  })
  ipcMain.handle('cred:pickKey', async () => {
    const win = BrowserWindow.getFocusedWindow() ?? undefined
    const res = await dialog.showOpenDialog(win!, {
      title: 'Select service account JSON key',
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['openFile']
    })
    if (res.canceled || !res.filePaths[0]) return { ok: false }
    try {
      const txt = readFileSync(res.filePaths[0], 'utf8')
      config.setCredentials(txt) // validates JSON shape, then encrypts + stores
      manager.reconfigure()
      return { ok: true, clientEmail: config.getClientEmail() }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('shell:openExternal', (_e, url: string) => shell.openExternal(url))
}
