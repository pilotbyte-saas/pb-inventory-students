import type { SyncState } from '@shared/types'
import { useData } from '../store'
import { relTime } from '../format'

const DOT: Record<SyncState, string> = {
  synced: 'bg-emerald-400',
  syncing: 'bg-sky-400 animate-pulse',
  offline: 'bg-slate-400',
  error: 'bg-red-400',
  local: 'bg-indigo-400',
  conflict: 'bg-amber-400 animate-pulse'
}

const LABEL: Record<SyncState, string> = {
  synced: 'Synced',
  syncing: 'Syncing…',
  offline: 'Offline',
  error: 'Sync error',
  local: 'Local only',
  conflict: 'Action needed'
}

export function SyncStatusPanel(): JSX.Element {
  const { sync, syncNow } = useData()
  return (
    <div className="space-y-2 text-xs text-slate-300">
      <div className="flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${DOT[sync.state]}`} />
        <span className="font-medium text-slate-100">{LABEL[sync.state]}</span>
      </div>
      {sync.state === 'synced' && (
        <div className="text-slate-400">Last sync {relTime(sync.lastSyncedAt)}</div>
      )}
      {sync.pending > 0 && (
        <div className="text-amber-300">
          {sync.pending} pending change{sync.pending === 1 ? '' : 's'}
        </div>
      )}
      {sync.message && sync.state !== 'synced' && (
        <div className="leading-snug text-slate-400">{sync.message}</div>
      )}
      <button
        onClick={() => void syncNow()}
        disabled={sync.state === 'syncing'}
        className="mt-1 w-full rounded-md bg-slate-700 py-1.5 text-slate-100 hover:bg-slate-600 disabled:opacity-50"
      >
        Sync now
      </button>
    </div>
  )
}
