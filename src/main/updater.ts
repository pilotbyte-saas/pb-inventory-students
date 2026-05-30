import { app, dialog, type BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { UpdateStatus } from '@shared/types'

// Auto-update via electron-updater. Reads its feed from the publish config baked
// into app-update.yml at build time (the public releases repo). Only runs in the
// packaged app — in dev there is no update metadata.

let notify: ((s: UpdateStatus) => void) | null = null

export function setUpdateNotifier(fn: (s: UpdateStatus) => void): void {
  notify = fn
}

function emit(s: UpdateStatus): void {
  if (notify) notify(s)
}

export function initAutoUpdate(getWindow: () => BrowserWindow | null): void {
  if (!app.isPackaged) return

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => emit({ state: 'checking' }))
  autoUpdater.on('update-available', (i) => emit({ state: 'available', version: i.version }))
  autoUpdater.on('update-not-available', () => emit({ state: 'none' }))
  autoUpdater.on('download-progress', (p) =>
    emit({ state: 'downloading', percent: Math.round(p.percent) })
  )
  autoUpdater.on('error', (err) =>
    emit({ state: 'error', message: err == null ? 'unknown error' : err.message })
  )
  autoUpdater.on('update-downloaded', async (i) => {
    emit({ state: 'downloaded', version: i.version })
    const win = getWindow()
    const opts = {
      type: 'info' as const,
      buttons: ['Restart now', 'Later'],
      defaultId: 0,
      cancelId: 1,
      title: 'Update ready',
      message: `Version ${i.version} has been downloaded`,
      detail: 'Restart to install it now. Otherwise it installs automatically next time you quit.'
    }
    const res = win ? await dialog.showMessageBox(win, opts) : await dialog.showMessageBox(opts)
    if (res.response === 0) setImmediate(() => autoUpdater.quitAndInstall())
  })

  void autoUpdater.checkForUpdates()
  setInterval(() => void autoUpdater.checkForUpdates(), 6 * 60 * 60 * 1000)
}

export function checkForUpdates(): void {
  if (!app.isPackaged) {
    emit({ state: 'none', message: 'Update checks run only in the installed app.' })
    return
  }
  void autoUpdater.checkForUpdates()
}
