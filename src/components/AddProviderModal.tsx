import { useEffect, useState, type FormEvent } from 'react'
import { Plus, X } from 'lucide-react'
import type { ProviderStatus, QuotaUnit, QuotaWindow, Verdict } from '../types'
import { useStore } from '../store'
import { UNIT_OPTIONS, WINDOW_OPTIONS } from '../lib/quota'
import { uid } from '../lib/id'
import { VERDICT_OPTIONS } from './VerdictBadge'

export function AddProviderModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: (id: string) => void
}) {
  const { addProvider } = useStore()
  const [name, setName] = useState('')
  const [website, setWebsite] = useState('')
  const [plan, setPlan] = useState('Free tier')
  const [status, setStatus] = useState<ProviderStatus>('active')
  const [verdict, setVerdict] = useState<Verdict>('works')
  const [summary, setSummary] = useState('')
  const [note, setNote] = useState('')
  const [rules, setRules] = useState('')
  const [sourceUrl, setSourceUrl] = useState('')
  const [quotaLabel, setQuotaLabel] = useState('Daily requests')
  const [quotaLimit, setQuotaLimit] = useState('100')
  const [quotaUsed, setQuotaUsed] = useState('0')
  const [quotaUnit, setQuotaUnit] = useState<QuotaUnit>('requests')
  const [quotaWindow, setQuotaWindow] = useState<QuotaWindow>('day')
  const [error, setError] = useState('')

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', handleKey)
      document.body.style.overflow = previousOverflow
    }
  }, [onClose])

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!name.trim()) {
      setError('Give the provider a name so you recognise it.')
      return
    }

    const limit = Number(quotaLimit)
    const used = Number(quotaUsed)
    const quotas =
      Number.isFinite(limit) && limit > 0
        ? [
            {
              id: uid('quota'),
              label: quotaLabel.trim() || 'Daily quota',
              unit: quotaUnit,
              limit,
              used: Number.isFinite(used) ? Math.max(0, used) : 0,
              window: quotaWindow,
              anchor: new Date().toISOString(),
            },
          ]
        : []

    const id = addProvider({
      name: name.trim(),
      plan: plan.trim() || 'Free',
      website: website.trim(),
      status,
      verdict,
      summary: summary.trim(),
      note: note.trim(),
      rules: rules
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean),
      sourceUrl: sourceUrl.trim() || undefined,
      quotas,
      models: [],
    })

    onCreated(id)
  }

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-provider-title"
      >
        <header className="modal-head">
          <div>
            <p className="eyebrow">New entry</p>
            <h2 id="add-provider-title">Add a provider</h2>
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </header>

        <form className="modal-form" onSubmit={handleSubmit}>
          <div className="form-grid">
            <label className="field field--wide">
              <span>Provider name *</span>
              <input
                autoFocus
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. Mistral, Chutes, Together"
              />
            </label>
            <label className="field">
              <span>Website</span>
              <input
                value={website}
                onChange={(event) => setWebsite(event.target.value)}
                placeholder="https://…"
              />
            </label>
            <label className="field">
              <span>Plan</span>
              <input
                value={plan}
                onChange={(event) => setPlan(event.target.value)}
                placeholder="Free tier"
              />
            </label>
          </div>

          <div className="form-grid">
            <label className="field">
              <span>Where does it live?</span>
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value as ProviderStatus)}
              >
                <option value="active">In rotation</option>
                <option value="watchlist">Tried / to try</option>
              </select>
            </label>
            <label className="field">
              <span>Verdict</span>
              <select
                value={verdict}
                onChange={(event) => setVerdict(event.target.value as Verdict)}
              >
                {VERDICT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="field">
            <span>One-line summary</span>
            <input
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
              placeholder="What is this provider for?"
            />
          </label>

          <label className="field">
            <span>Your note</span>
            <textarea
              className="big-note"
              rows={4}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="What worked, what failed, which plan, what you'd use it for…"
            />
          </label>

          <fieldset className="form-fieldset">
            <legend>
              One quota to start <small>optional — leave limit at 0 for none</small>
            </legend>
            <div className="form-grid form-grid--quota">
              <label className="field">
                <span>Label</span>
                <input
                  value={quotaLabel}
                  onChange={(event) => setQuotaLabel(event.target.value)}
                />
              </label>
              <label className="field">
                <span>Limit</span>
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={quotaLimit}
                  onChange={(event) => setQuotaLimit(event.target.value)}
                />
              </label>
              <label className="field">
                <span>Used</span>
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={quotaUsed}
                  onChange={(event) => setQuotaUsed(event.target.value)}
                />
              </label>
              <label className="field">
                <span>Unit</span>
                <select
                  value={quotaUnit}
                  onChange={(event) => setQuotaUnit(event.target.value as QuotaUnit)}
                >
                  {UNIT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Resets</span>
                <select
                  value={quotaWindow}
                  onChange={(event) =>
                    setQuotaWindow(event.target.value as QuotaWindow)
                  }
                >
                  {WINDOW_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </fieldset>

          <label className="field">
            <span>Rules &amp; limits · one per line</span>
            <textarea
              rows={4}
              value={rules}
              onChange={(event) => setRules(event.target.value)}
              placeholder="Free tier caps at 1,000 requests/day&#10;Resets at midnight UTC&#10;Card required for paid…"
            />
          </label>

          <label className="field">
            <span>Provider docs URL</span>
            <input
              value={sourceUrl}
              onChange={(event) => setSourceUrl(event.target.value)}
              placeholder="https://…/rate-limits"
            />
          </label>

          {error && <p className="form-error">{error}</p>}

          <footer className="modal-foot">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              <Plus size={15} /> Add provider
            </button>
          </footer>
        </form>
      </div>
    </div>
  )
}
