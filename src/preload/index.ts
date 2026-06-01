import { contextBridge, ipcRenderer } from 'electron'
import type { IpcApi, SyncStatus, UpdateStatus } from '@shared/types'

// The single bridge between the sandboxed renderer and the main process.
const api: IpcApi = {
  getItems: () => ipcRenderer.invoke('items:get'),
  getTransactions: (filter) => ipcRenderer.invoke('transactions:get', filter),
  addItem: (item) => ipcRenderer.invoke('item:add', item),
  updateItem: (id, patch) => ipcRenderer.invoke('item:update', id, patch),
  deleteItem: (id) => ipcRenderer.invoke('item:delete', id),
  consume: (itemId, qty, note) => ipcRenderer.invoke('inv:consume', itemId, qty, note),
  receive: (itemId, qty, unitCost, receiptRef, note) =>
    ipcRenderer.invoke('inv:receive', itemId, qty, unitCost, receiptRef, note),
  adjust: (itemId, delta, note) => ipcRenderer.invoke('inv:adjust', itemId, delta, note),
  recompute: () => ipcRenderer.invoke('inv:recompute'),
  getBatches: () => ipcRenderer.invoke('batch:list'),
  getTemplates: () => ipcRenderer.invoke('template:list'),
  consumeBatch: (input) => ipcRenderer.invoke('batch:consume', input),
  voidBatch: (id) => ipcRenderer.invoke('batch:void', id),
  updateBatchMeta: (id, patch) => ipcRenderer.invoke('batch:updateMeta', id, patch),
  reverseTransaction: (id) => ipcRenderer.invoke('txn:reverse', id),
  saveTemplate: (name, lines) => ipcRenderer.invoke('template:save', name, lines),
  updateTemplate: (id, patch) => ipcRenderer.invoke('template:update', id, patch),
  deleteTemplate: (id) => ipcRenderer.invoke('template:delete', id),
  saveFile: (defaultName, base64) => ipcRenderer.invoke('file:save', defaultName, base64),
  getSyncStatus: () => ipcRenderer.invoke('sync:status'),
  syncNow: () => ipcRenderer.invoke('sync:now'),
  testConnection: () => ipcRenderer.invoke('sync:test'),
  hasCredentials: () => ipcRenderer.invoke('cred:has'),
  getBackendInfo: () => ipcRenderer.invoke('cred:info'),
  setBackend: (backend) => ipcRenderer.invoke('cred:setBackend', backend),
  setAwsConfig: (config) => ipcRenderer.invoke('cred:setAws', config),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  getConflicts: () => ipcRenderer.invoke('sync:conflicts'),
  resolveConflicts: (resolutions) => ipcRenderer.invoke('sync:resolve', resolutions),
  getAppVersion: () => ipcRenderer.invoke('app:version'),
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  onUpdateStatus: (cb) => {
    const listener = (_event: unknown, status: UpdateStatus): void => cb(status)
    ipcRenderer.on('update:status', listener)
    return () => ipcRenderer.removeListener('update:status', listener)
  },
  onSyncStatus: (cb) => {
    const listener = (_event: unknown, status: SyncStatus): void => cb(status)
    ipcRenderer.on('sync:status', listener)
    return () => ipcRenderer.removeListener('sync:status', listener)
  }
}

contextBridge.exposeInMainWorld('api', api)
