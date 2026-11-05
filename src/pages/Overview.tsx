import { Plus } from 'lucide-react'
import { useStore } from '../store'
import { ProviderCard } from '../components/ProviderCard'
import { WatchCard } from '../components/WatchCard'
import { LocalHosts } from '../components/LocalHosts'
import { ScanBar } from '../components/ScanBar'
import { describeSplit } from '../lib/hosts'
import { shortDateTime } from '../lib/display'
import {
  formatDuration,
  nextReset,
  percentLabel,
  percentLeft,
} from '../lib/quota'

export function Overview({
  onAdd,
  onAddMachine,
}: {
  onAdd: () => void
  onAddMachine: () => void
}) {
  const {
    providers,
    machines,
    now,
    dataAt,
    scan,
    scanning,
    scanError,
    serverOnly,
    refreshData,
    removeMachine,
    moveProvider,
    setProviderStatus,
  } = useStore()

  // On a server without a private network the local entry is not a provider you
  // rotate: it is what the live section reads.
  const ranked = providers.filter(
    (provider) => !(serverOnly && provider.kind === 'local'),
  )
  const active = ranked
    .filter((provider) => provider.status === 'active')
    .sort((a, b) => a.order - b.order)
  const watchlist = ranked
    .filter((provider) => provider.status === 'watchlist')
    .sort((a, b) => a.order - b.order)
  const modelCount = providers.reduce((total, provider) => total + provider.models.length, 0)
  const local = providers.find((provider) => provider.kind === 'local')

  const withQuota = active
    .filter((provider) => provider.quotas.length > 0)
    .map((provider) => ({
      provider,
      percent: percentLeft(provider.quotas[0]),
    }))
    .sort((a, b) => a.percent - b.percent)
  const tightest = withQuota[0]

  const upcomingList: { providerName: string; at: number }[] = []
  for (const provider of active) {
    for (const quota of provider.quotas) {
      const at = nextReset(quota, now)
      if (at !== null) upcomingList.push({ providerName: provider.name, at })
    }
  }
  const upcoming = upcomingList.sort((a, b) => a.at - b.at)[0]

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">Model panel</p>
          <h1>What&rsquo;s left in the tank</h1>
          <p className="page-sub">
            Every provider you use, its quota, and when it refills. Click any card for
            the rules, notes, and per-model detail.
          </p>
        </div>
        <button type="button" className="btn btn-primary head-add" onClick={onAdd}>
          <Plus size={15} /> Add provider
        </button>
      </header>

      <section className="stat-panel" aria-label="Panel summary">
        <div className="stat">
          <span>In rotation</span>
          <strong>{active.length}</strong>
          <small>
            {watchlist.length} on the try list
          </small>
        </div>
        <div className="stat">
          <span>Models tracked</span>
          <strong>{modelCount}</strong>
          <small>
            {local
              ? `${local.models.length} local · ${machines.length} machine${
                  machines.length === 1 ? '' : 's'
                }`
              : 'across every provider'}
          </small>
        </div>
        <div className="stat">
          <span>Tightest quota</span>
          <strong>{tightest ? percentLabel(tightest.percent) : '—'}</strong>
          <small>{tightest ? tightest.provider.name : 'Add a quota to track'}</small>
        </div>
        <div className="stat">
          <span>Next reset</span>
          <strong>{upcoming ? formatDuration(upcoming.at - now) : '—'}</strong>
          <small>{upcoming ? upcoming.providerName : 'No timed quota'}</small>
        </div>
      </section>

      {local && (
        <section className="host-section" aria-label="Local model machines">
          <div className="section-head">
            <div>
              <h2>{serverOnly ? 'Live on this server' : 'Local compute'}</h2>
              <p>
                {machines.length > 0
                  ? `${local.models.length} local model${
                      local.models.length === 1 ? '' : 's'
                    } — ${describeSplit(local.models, machines)}${
                      serverOnly ? ', read on this server' : ''
                    }.`
                  : serverOnly
                    ? 'Nothing is listening here yet. Read this server, or add another machine by hand.'
                    : 'No machines yet. Scan the network to see what is running.'}
              </p>
            </div>
            <a className="section-link" href={`#/p/${local.id}`}>
              Open local models
            </a>
          </div>
          <ScanBar
            scanning={scanning}
            error={scanError}
            scan={scan}
            dataAt={dataAt}
            onRefresh={refreshData}
            onAddMachine={onAddMachine}
          />
          <LocalHosts
            models={local.models}
            machines={machines}
            href={`#/p/${local.id}`}
            onRemove={(machineId) => {
              const machine = machines.find((entry) => entry.id === machineId)
              const confirmed = window.confirm(
                `Remove ${machine?.label ?? 'this machine'}? Its models stay in the list but lose their host.`,
              )
              if (confirmed) removeMachine(machineId)
            }}
          />
        </section>
      )}

      <section className="panel-section">
        <div className="section-head">
          <div>
            <h2>In rotation</h2>
            <p>Ranked by what you reach for first.</p>
          </div>
          <span className="section-count">{active.length} providers</span>
        </div>

        {active.length > 0 ? (
          <div className="provider-grid">
            {active.map((provider, index) => (
              <ProviderCard
                key={provider.id}
                provider={provider}
                machines={machines}
                index={index}
                total={active.length}
                now={now}
                onMove={(direction) => moveProvider(provider.id, direction)}
              />
            ))}
          </div>
        ) : (
          <div className="empty-panel">
            <p>Nothing in rotation yet.</p>
            <button type="button" className="btn btn-ghost" onClick={onAdd}>
              <Plus size={15} /> Add the first provider
            </button>
          </div>
        )}
      </section>

      <section className="panel-section watch-section" id="watchlist">
        <div className="section-head">
          <div>
            <h2>
              <span className="watch-dot" aria-hidden="true" />
              Tried &amp; to try
            </h2>
            <p>
              Offers you are weighing, or providers that didn&rsquo;t work out. Keep the
              note; move one into rotation when it earns it.
            </p>
          </div>
          <span className="section-count">{watchlist.length} watching</span>
        </div>

        {watchlist.length > 0 ? (
          <div className="watch-grid">
            {watchlist.map((provider, index) => (
              <WatchCard
                key={provider.id}
                provider={provider}
                index={index}
                total={watchlist.length}
                onMove={(direction) => moveProvider(provider.id, direction)}
                onPromote={() => setProviderStatus(provider.id, 'active')}
              />
            ))}
          </div>
        ) : (
          <div className="empty-panel empty-panel--watch">
            <p>No providers on the bench.</p>
            <button type="button" className="btn btn-ghost" onClick={onAdd}>
              <Plus size={15} /> Add a provider to try
            </button>
          </div>
        )}
      </section>

      <footer className="page-foot">
        <p>
          Quotas here are self-tracked. They start at zero — update them as you use a
          provider. Terms change often, so open a provider to read its rules. Local
          machine data comes from the last{' '}
          {serverOnly ? 'read of this server' : 'network scan'}
          {dataAt ? ` (${shortDateTime(dataAt)})` : ''}; nothing is polled in the background.
        </p>
      </footer>
    </div>
  )
}
