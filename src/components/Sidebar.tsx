import { FlaskConical, HardDrive, LayoutDashboard, Plus } from 'lucide-react'
import { PANEL_MODE, useStore } from '../store'
import { percentLabel, percentLeft } from '../lib/quota'
import { countModelsByMachine } from '../lib/hosts'

export function Sidebar({ onAdd }: { onAdd: () => void }) {
  const { providers, machines } = useStore()
  const ranked = providers.filter(
    (provider) => !(PANEL_MODE === 'cloud' && provider.kind === 'local'),
  )
  const active = ranked.filter((provider) => provider.status === 'active')
  const watchlist = ranked.filter((provider) => provider.status === 'watchlist')
  const modelCount = providers.reduce((total, provider) => total + provider.models.length, 0)
  const local = providers.find((provider) => provider.kind === 'local')
  const localCounts = countModelsByMachine(local?.models ?? [], machines)

  const tightest = active
    .filter((provider) => provider.quotas.length > 0)
    .map((provider) => ({
      name: provider.name,
      percent: percentLeft(provider.quotas[0]),
    }))
    .sort((a, b) => a.percent - b.percent)[0]

  const onDetail = window.location.hash.startsWith('#/p/')

  function goToTryList() {
    const scroll = () =>
      document.getElementById('watchlist')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    if (onDetail) {
      window.location.hash = '#/'
      window.setTimeout(scroll, 80)
    } else {
      scroll()
    }
  }

  return (
    <aside className="sidebar">
      <a className="brand" href="#/">
        <span className="brand-mark">F</span>
        <span className="brand-copy">
          <strong>freetokens</strong>
          <small>model panel</small>
        </span>
      </a>

      <button type="button" className="btn btn-primary add-provider" onClick={onAdd}>
        <Plus size={15} /> Add provider
      </button>

      <nav className="side-nav" aria-label="Panel">
        <a className={`side-link ${onDetail ? '' : 'is-active'}`} href="#/">
          <LayoutDashboard size={16} /> Overview
        </a>
        <button type="button" className="side-link" onClick={goToTryList}>
          <FlaskConical size={16} /> Try list
          <span className="side-count">{watchlist.length}</span>
        </button>
      </nav>

      <div className="side-block">
        <p className="micro-label">At a glance</p>
        <div className="side-stat">
          <span>In rotation</span>
          <strong>{active.length}</strong>
        </div>
        <div className="side-stat">
          <span>Models tracked</span>
          <strong>{modelCount}</strong>
        </div>
        {local && (
          <>
            <div className="side-stat">
              <span>Local models</span>
              <strong>
                {machines.map((machine) => localCounts[machine.id] ?? 0).join(' / ') || '0'}
              </strong>
            </div>
            <p className="side-hint">
              {machines.map((machine) => machine.short).join(' / ') || 'No machines'}
            </p>
          </>
        )}
        <div className="side-stat">
          <span>Tightest quota</span>
          <strong>{tightest ? `${percentLabel(tightest.percent)}` : '—'}</strong>
        </div>
        {tightest && <p className="side-hint">{tightest.name}</p>}
      </div>

      <div className="side-foot">
        <HardDrive size={13} />
        <p>
          Saved in this browser.
          <br />
          No account, no sync.
        </p>
      </div>
    </aside>
  )
}
