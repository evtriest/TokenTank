import type { CSSProperties } from 'react'
import { ArrowDown, ArrowRight, ArrowUp, Clock } from 'lucide-react'
import type { Machine, Provider } from '../types'
import {
  formatAmount,
  formatDuration,
  nextReset,
  percentLabel,
  percentLeft,
  quotaTone,
  remaining,
} from '../lib/quota'
import { hostname } from '../lib/display'
import { describeSplit } from '../lib/hosts'
import { ProviderAvatar } from './ProviderAvatar'
import { VerdictBadge } from './VerdictBadge'
import { QuotaRing } from './QuotaRing'
import { HostSplit } from './HostSplit'

interface Props {
  provider: Provider
  machines: Machine[]
  index: number
  total: number
  now: number
  onMove: (direction: -1 | 1) => void
}

export function ProviderCard({ provider, machines, index, total, now, onMove }: Props) {
  const primary = provider.quotas[0]
  const extras = provider.quotas.slice(1, 3)
  const next = primary ? nextReset(primary, now) : null
  const percent = primary ? percentLeft(primary) : 0
  const tone = primary ? quotaTone(percent) : 'muted'

  return (
    <article
      className="provider-card"
      style={{ '--accent': provider.accent } as CSSProperties}
    >
      <a
        className="card-hit"
        href={`#/p/${provider.id}`}
        aria-label={`Open ${provider.name}`}
      />

      <header className="pc-head">
        <ProviderAvatar provider={provider} />
        <div className="pc-identity">
          <div className="pc-name-row">
            <h3>{provider.name}</h3>
            <span className="plan-pill">{provider.plan}</span>
          </div>
          <p className="pc-host">{hostname(provider.website)}</p>
        </div>
        <div className="rank-buttons">
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={index === 0}
            aria-label={`Move ${provider.name} up`}
            title="Move up"
          >
            <ArrowUp size={14} />
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={index === total - 1}
            aria-label={`Move ${provider.name} down`}
            title="Move down"
          >
            <ArrowDown size={14} />
          </button>
        </div>
      </header>

      {primary ? (
        <div className="pc-quota">
          <QuotaRing percent={percent} />
          <div className="pc-quota-copy">
            <span className="micro-label">{primary.label}</span>
            <p className="pc-big">
              <strong className={`tone-${tone}`}>{percentLabel(percent)}</strong>
              <span> left</span>
            </p>
            <p className="pc-figures">
              {formatAmount(primary.unit, remaining(primary))} of{' '}
              {formatAmount(primary.unit, primary.limit)}
            </p>
            <p className="pc-reset">
              <Clock size={12} />
              {primary.window === 'none'
                ? 'One-time balance, no reset'
                : next
                  ? `resets in ${formatDuration(next - now)}`
                  : 'No reset scheduled'}
            </p>
          </div>
        </div>
      ) : provider.kind === 'local' ? (
        <div className="pc-host-split">
          <HostSplit models={provider.models} machines={machines} />
          <p className="pc-host-split-copy">
            {describeSplit(provider.models, machines, 'from')}
          </p>
          <p className="pc-reset">Local inference · manual reads only</p>
        </div>
      ) : (
        <div className="pc-no-quota">
          <span>No quota tracked yet</span>
          <span>Open the details to add one.</span>
        </div>
      )}

      {extras.length > 0 && (
        <div className="pc-extras">
          {extras.map((quota) => {
            const extraPercent = percentLeft(quota)
            return (
              <div className="mini-quota" key={quota.id}>
                <div className="mini-quota-head">
                  <span>{quota.label}</span>
                  <span>{percentLabel(extraPercent)}</span>
                </div>
                <div className="mini-bar">
                  <i
                    className={`fill tone-${quotaTone(extraPercent)}`}
                    style={{ width: `${extraPercent}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="chips">
        {provider.models.slice(0, 3).map((model) => (
          <span className="chip" key={model.id} title={model.note}>
            {model.host && (
              <i className={`chip-dot chip-dot--${model.host}`} aria-hidden="true" />
            )}
            {model.name}
          </span>
        ))}
        {provider.models.length > 3 && (
          <span className="chip chip--more">+{provider.models.length - 3}</span>
        )}
        {provider.models.length === 0 && (
          <span className="chip chip--empty">No models yet</span>
        )}
      </div>

      {provider.note.trim() && <p className="pc-note">{provider.note}</p>}

      <footer className="pc-foot">
        <VerdictBadge verdict={provider.verdict} />
        <span className="foot-dot">·</span>
        <span>
          {provider.models.length} model{provider.models.length === 1 ? '' : 's'}
        </span>
        <span className="pc-details">
          Details <ArrowRight size={13} />
        </span>
      </footer>
    </article>
  )
}
