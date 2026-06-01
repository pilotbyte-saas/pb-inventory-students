import { useEffect, useState } from 'react'
import { useData } from './store'
import { api } from './api'
import { SyncStatusPanel } from './components/SyncStatus'
import { ConflictModal } from './components/ConflictModal'
import Dashboard from './views/Dashboard'
import Inventory from './views/Inventory'
import Consume from './views/Consume'
import LowStock from './views/LowStock'
import History from './views/History'
import Usage from './views/Usage'
import Costs from './views/Costs'
import Settings from './views/Settings'
import { itemStatus } from './format'

export type View =
  | 'dashboard'
  | 'inventory'
  | 'consume'
  | 'low'
  | 'history'
  | 'usage'
  | 'costs'
  | 'settings'

const NAV: { key: View; label: string; icon: string }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: '▦' },
  { key: 'inventory', label: 'Inventory', icon: '▤' },
  { key: 'consume', label: 'Consume', icon: '🛒' },
  { key: 'low', label: 'Low stock', icon: '⚠' },
  { key: 'history', label: 'History', icon: '☰' },
  { key: 'usage', label: 'Usage', icon: '📊' },
  { key: 'costs', label: 'Costs', icon: '$' },
  { key: 'settings', label: 'Settings', icon: '⚙' }
]

export default function App(): JSX.Element {
  const { items } = useData()
  const [view, setView] = useState<View>('dashboard')
  const [configured, setConfigured] = useState(true)

  useEffect(() => {
    void api.hasCredentials().then(setConfigured)
  }, [view])

  const lowCount = items.filter((i) => itemStatus(i) !== 'ok').length

  return (
    <div className="flex h-full">
      <aside className="flex w-56 shrink-0 flex-col bg-slate-900 text-slate-200">
        <div className="px-5 py-4 text-lg font-semibold text-white">Classroom Inventory</div>
        <nav className="flex-1 space-y-1 px-2">
          {NAV.map((n) => (
            <button
              key={n.key}
              onClick={() => setView(n.key)}
              className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm ${
                view === n.key ? 'bg-brand-600 text-white' : 'hover:bg-slate-800'
              }`}
            >
              <span className="w-4 text-center">{n.icon}</span>
              <span className="flex-1 text-left">{n.label}</span>
              {n.key === 'low' && lowCount > 0 && (
                <span className="rounded-full bg-amber-500 px-1.5 text-xs text-white">{lowCount}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="border-t border-slate-800 p-3">
          <SyncStatusPanel />
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        {!configured && view !== 'settings' && (
          <div className="flex items-center justify-between bg-amber-100 px-6 py-2 text-sm text-amber-900">
            <span>Cloud sync isn&apos;t configured — add your AWS keys to sync, or stay local.</span>
            <button className="font-medium underline" onClick={() => setView('settings')}>
              Open Settings
            </button>
          </div>
        )}
        <div className="p-6">
          {view === 'dashboard' && <Dashboard onNavigate={setView} />}
          {view === 'inventory' && <Inventory />}
          {view === 'consume' && <Consume />}
          {view === 'low' && <LowStock />}
          {view === 'history' && <History />}
          {view === 'usage' && <Usage />}
          {view === 'costs' && <Costs />}
          {view === 'settings' && <Settings />}
        </div>
      </main>
      <ConflictModal />
    </div>
  )
}
