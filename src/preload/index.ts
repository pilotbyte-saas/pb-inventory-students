import { contextBridge, ipcRenderer } from 'electron'
import type { IpcApi, SyncStatus } from '@shared/types'

// The single bridge between the sandboxed renderer and the main process.
const api: IpcApi = {
  getItems: () => ipcRenderer.invoke('items:get'),
  getTransactions: (filter) => ipcRenderer.invoke('transactions:get', filter),
  addItem: (item) => ipcRenderer.invoke('item:add', item),
  updateItem: (id, patch) => ipcRenderer.invoke('item:update', id, patch),
  consume: (itemId, qty, note) => ipcRenderer.invoke('inv:consume', itemId, qty, note),
  receive: (itemId, qty, unitCost, receiptRef, note) =>
    ipcRenderer.invoke('inv:receive', itemId, qty, unitCost, receiptRef, note),
  adjust: (itemId, delta, note) => ipcRenderer.invoke('inv:adjust', itemId, delta, note),
  recompute: () => ipcRenderer.invoke('inv:recompute'),
  getSyncStatus: () => ipcRenderer.invoke('sync:status'),
  syncNow: () => ipcRenderer.invoke('sync:now'),
  testConnection: () => ipcRenderer.invoke('sync:test'),
  hasCredentials: () => ipcRenderer.invoke('cred:has'),
  getBackendInfo: () => ipcRenderer.invoke('cred:info'),
  setBackend: (backend) => ipcRenderer.invoke('cred:setBackend', backend),
  setCredentials: (jsonKey) => ipcRenderer.invoke('cred:set', jsonKey),
  setSpreadsheetId: (id) => ipcRenderer.invoke('cred:setSpreadsheet', id),
  setAwsConfig: (config) => ipcRenderer.invoke('cred:setAws', config),
  pickKeyFile: () => ipcRenderer.invoke('cred:pickKey'),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  onSyncStatus: (cb) => {
    const listener = (_event: unknown, status: SyncStatus): void => cb(status)
    ipcRenderer.on('sync:status', listener)
    return () => ipcRenderer.removeListener('sync:status', listener)
  }
}

contextBridge.exposeInMainWorld('api', api)
