import type { CSSProperties } from 'react'
import { ArrowDown, ArrowRight, ArrowUp, Plus } from 'lucide-react'
import type { Provider } from '../types'
import { formatAmount, windowAdverb } from '../lib/quota'
import { ProviderAvatar } from './ProviderAvatar'
import { VerdictBadge } from './VerdictBadge'

interface Props {
  provider: Provider
  index: number
  total: number
  onMove: (direction: -1 | 1) => void
  onPromote: () => void
}

export function WatchCard({ provider, index, total, onMove, onPromote }: Props) {
  const offer = provider.quotas[0]

  return (
    <article
      className="watch-card"
      style={{ '--accent': provider.accent } as CSSProperties}
    >
      <a
        className="card-hit"
        href={`#/p/${provider.id}`}
        aria-label={`Open ${provider.name}`}
      />

      <header className="wc-head">
        <ProviderAvatar provider={provider} />
        <div className="wc-identity">
          <h3>{provider.name}</h3>
          <p>{provider.plan}</p>
        </div>
        <VerdictBadge verdict={provider.verdict} />
      </header>

      <p className="wc-summary">{provider.summary}</p>

      <div className="wc-offer">
        <span className="micro-label">The offer</span>
        <p>
          {offer
            ? `${formatAmount(offer.unit, offer.limit)} · ${offer.label}${
                offer.window === 'day'
                  ? ` · resets ${windowAdverb(offer.window)}`
                  : ''
              }`
            : 'No quota set — open it to add your own limits.'}
        </p>
      </div>

      <div className="wc-note">
        {provider.note.trim() ? (
          provider.note
        ) : (
          <span className="wc-note-placeholder">
            Add a note — what worked, what failed, what you would use it for.
          </span>
        )}
      </div>

      <footer className="wc-foot">
        <button type="button" className="promote" onClick={onPromote}>
          <Plus size={13} /> Move to rotation
        </button>
        <div className="wc-rank">
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
        <span className="pc-details">
          Details <ArrowRight size={13} />
        </span>
      </footer>
    </article>
  )
}
