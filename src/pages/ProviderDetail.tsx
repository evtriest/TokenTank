import { useState, type FormEvent } from 'react'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  Check,
  ChevronLeft,
  FlaskConical,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react'
import type { HostId, Provider, Quota, QuotaUnit, QuotaWindow, Verdict } from '../types'
import { useStore } from '../store'
import {
  UNIT_OPTIONS,
  WINDOW_OPTIONS,
  formatAmount,
  formatDuration,
  formatResetMoment,
  nextReset,
  newQuota,
  percentLabel,
  percentLeft,
  quotaTone,
  remaining,
  windowAdverb,
} from '../lib/quota'
import { hostname, shortDate } from '../lib/display'
import { uid } from '../lib/id'
import { ProviderAvatar } from '../components/ProviderAvatar'
import { VERDICT_OPTIONS, VerdictBadge } from '../components/VerdictBadge'
import { HostSplit } from '../components/HostSplit'
import { LocalHosts } from '../components/LocalHosts'
import { ScanBar } from '../components/ScanBar'
import { hostOptions } from '../lib/hosts'

export function ProviderDetail({
  id,
  onAddMachine,
}: {
  id: string
  onAddMachine: () => void
}) {
  const { providers } = useStore()
  const provider = providers.find((entry) => entry.id === id)

  if (!provider) {
    return (
      <div className="page detail-page">
        <a href="#/" className="back-link">
          <ChevronLeft size={15} /> Model panel
        </a>
        <div className="empty-panel">
          <p>That provider is not in this panel anymore.</p>
          <a href="#/" className="btn btn-ghost">
            Back to the overview
          </a>
        </div>
      </div>
    )
  }

  return <ProviderDetailBody provider={provider} onAddMachine={onAddMachine} />
}

function ProviderDetailBody({
  provider,
  onAddMachine,
}: {
  provider: Provider
  onAddMachine: () => void
}) {
  const {
    now,
    machines,
    dataAt,
    scan,
    scanning,
    scanError,
    serverOnly,
    refreshData,
    updateProvider,
    removeProvider,
    removeMachine,
    setProviderStatus,
  } = useStore()
  const [editingRules, setEditingRules] = useState(false)
  const [rulesDraft, setRulesDraft] = useState(provider.rules.join('\n'))
  const [newModel, setNewModel] = useState('')
  const [newModelHost, setNewModelHost] = useState<HostId>(machines[0]?.id ?? '')

  const update = (updater: (current: Provider) => Provider) =>
    updateProvider(provider.id, updater)

  const patchQuota = (quotaId: string, patch: Partial<Quota>) =>
    update((current) => ({
      ...current,
      quotas: current.quotas.map((quota) =>
        quota.id === quotaId ? { ...quota, ...patch } : quota,
      ),
    }))

  const addQuota = () =>
    update((current) => ({ ...current, quotas: [...current.quotas, newQuota()] }))

  const removeQuota = (quotaId: string) =>
    update((current) => ({
      ...current,
      quotas: current.quotas.filter((quota) => quota.id !== quotaId),
    }))

  const resetQuota = (quotaId: string) =>
    patchQuota(quotaId, { used: 0, anchor: new Date().toISOString() })

  const updateModel = (
    modelId: string,
    patch: { name?: string; note?: string; host?: HostId },
  ) =>
    update((current) => ({
      ...current,
      models: current.models.map((model) =>
        model.id === modelId ? { ...model, ...patch } : model,
      ),
    }))

  const moveModel = (modelId: string, direction: -1 | 1) =>
    update((current) => {
      const models = [...current.models]
      const index = models.findIndex((model) => model.id === modelId)
      const target = index + direction
      if (index < 0 || target < 0 || target >= models.length) return current
      ;[models[index], models[target]] = [models[target], models[index]]
      return { ...current, models }
    })

  const removeModel = (modelId: string) =>
    update((current) => ({
      ...current,
      models: current.models.filter((model) => model.id !== modelId),
    }))

  function handleAddModel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = newModel.trim()
    if (!name) return
    update((current) => ({
      ...current,
      models: [
        ...current.models,
        {
          id: uid('model'),
          name,
          note: '',
          ...(current.kind === 'local' ? { host: newModelHost } : {}),
        },
      ],
    }))
    setNewModel('')
  }

  function handleRemoveMachine(machineId: string) {
    const confirmed = window.confirm(
      'Remove this machine? Its models stay in the list but lose their host.',
    )
    if (confirmed) removeMachine(machineId)
  }

  function startEditingRules() {    setRulesDraft(provider.rules.join('\n'))
    setEditingRules(true)
  }

  function saveRules() {
    update((current) => ({
      ...current,
      rules: rulesDraft
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean),
    }))
    setEditingRules(false)
  }

  function handleDelete() {
    const confirmed = window.confirm(
      `Delete ${provider.name} and all of its quotas, models and notes?`,
    )
    if (!confirmed) return
    removeProvider(provider.id)
    window.location.hash = '#/'
  }

  const isActive = provider.status === 'active'

  return (
    <div className={`page detail-page ${isActive ? '' : 'detail-page--watch'}`}>
      <a href="#/" className="back-link">
        <ChevronLeft size={15} /> Model panel
      </a>

      <header className="detail-head">
        <ProviderAvatar provider={provider} size={58} />
        <div className="detail-identity">
          <div className="detail-title-row">
            <h1>{provider.name}</h1>
            <VerdictBadge verdict={provider.verdict} />
          </div>
          <p className="detail-sub">
            <span className="plan-pill">{provider.plan}</span>
            {provider.website && (
              <>
                <span className="sub-dot">·</span>
                <a href={provider.website} target="_blank" rel="noreferrer">
                  {hostname(provider.website)} <ArrowUpRight size={12} />
                </a>
              </>
            )}
            <span className="sub-dot">·</span>
            <span>
              {provider.models.length} model{provider.models.length === 1 ? '' : 's'}
            </span>
            {provider.kind === 'local' && (
              <>
                <span className="sub-dot">·</span>
                <HostSplit models={provider.models} machines={machines} />
              </>
            )}
          </p>
        </div>
        <div className="detail-actions">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() =>
              setProviderStatus(provider.id, isActive ? 'watchlist' : 'active')
            }
          >
            {isActive ? (
              <>
                <FlaskConical size={14} /> Move to try list
              </>
            ) : (
              <>
                <Plus size={14} /> Move into rotation
              </>
            )}
          </button>
        </div>
      </header>

      <div className="detail-grid">
        <div className="detail-main">
          {provider.kind === 'local' && (
            <section className="panel">
              <div className="panel-head">
                <div>
                  <h2>Machines</h2>
                  <p>
                    {serverOnly
                      ? 'Where these models run. Read this server, or add another machine by hand after its SSH check.'
                      : 'Where these models run. Scan the network, or add a machine by hand.'}
                  </p>
                </div>
                <HostSplit models={provider.models} machines={machines} />
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
                models={provider.models}
                machines={machines}
                showModels={false}
                onRemove={handleRemoveMachine}
              />
            </section>
          )}

          {provider.kind !== 'local' && (
          <section className="panel">
            <div className="panel-head">
              <div>
                <h2>Quota</h2>
                <p>Self-tracked. The bar shows what is left in the current window.</p>
              </div>
            </div>

            {provider.quotas.length === 0 ? (
              <div className="inner-empty">
                No quota is tracked for this provider yet.
              </div>
            ) : (
              <div className="quota-list">
                {provider.quotas.map((quota) => {
                  const percent = percentLeft(quota)
                  const tone = quotaTone(percent)
                  const next = nextReset(quota, now)
                  return (
                    <div className="quota-editor" key={quota.id}>
                      <div className="qe-head">
                        <div className="qe-title">
                          <h3>{quota.label}</h3>
                          <p>
                            {percentLabel(percent)} left ·{' '}
                            {quota.window === 'none'
                              ? 'one-time balance'
                              : `resets ${windowAdverb(quota.window)}${
                                  next ? ` in ${formatDuration(next - now)}` : ''
                                }`}
                          </p>
                        </div>
                        <div className={`qe-big tone-${tone}`}>
                          {formatAmount(quota.unit, remaining(quota))}
                        </div>
                      </div>

                      <div className="bar">
                        <i
                          className={`fill tone-${tone}`}
                          style={{ width: `${percent}%` }}
                        />
                      </div>

                      <div className="qe-grid">
                        <label className="field">
                          <span>Used</span>
                          <input
                            type="number"
                            min={0}
                            step="any"
                            value={quota.used}
                            onFocus={(event) => event.target.select()}
                            onChange={(event) =>
                              patchQuota(quota.id, {
                                used: Math.max(0, Number(event.target.value) || 0),
                              })
                            }
                          />
                        </label>
                        <label className="field">
                          <span>Limit</span>
                          <input
                            type="number"
                            min={0}
                            step="any"
                            value={quota.limit}
                            onFocus={(event) => event.target.select()}
                            onChange={(event) =>
                              patchQuota(quota.id, {
                                limit: Math.max(0, Number(event.target.value) || 0),
                              })
                            }
                          />
                        </label>
                        <label className="field">
                          <span>Unit</span>
                          <select
                            value={quota.unit}
                            onChange={(event) =>
                              patchQuota(quota.id, {
                                unit: event.target.value as QuotaUnit,
                              })
                            }
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
                            value={quota.window}
                            onChange={(event) =>
                              patchQuota(quota.id, {
                                window: event.target.value as QuotaWindow,
                                anchor: new Date().toISOString(),
                              })
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

                      <div className="qe-foot">
                        <span className="qe-reset-at">{formatResetMoment(next)}</span>
                        <button
                          type="button"
                          className="text-btn"
                          onClick={() => resetQuota(quota.id)}
                        >
                          <RotateCcw size={13} /> Reset usage
                        </button>
                        <button
                          type="button"
                          className="text-btn text-btn--danger"
                          onClick={() => removeQuota(quota.id)}
                        >
                          <Trash2 size={13} /> Remove
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            <button type="button" className="btn btn-ghost add-row" onClick={addQuota}>
              <Plus size={14} /> Add quota
            </button>
          </section>
          )}

          <section className="panel">
            <div className="panel-head">
              <div>
                <h2>Models</h2>
                <p>
                  {provider.kind === 'local'
                    ? 'Each row shows the machine it came from. Set the host on a row to keep the split honest.'
                    : 'Notes are per model. Use the arrows to rank them for this provider.'}
                </p>
              </div>
              {provider.kind === 'local' ? (
                <HostSplit models={provider.models} machines={machines} />
              ) : (
                <span className="section-count">{provider.models.length}</span>
              )}
            </div>

            {provider.models.length === 0 ? (
              <div className="inner-empty">
                No models noted yet. Add the ones you actually reach for.
              </div>
            ) : (
              <ul className="model-list">
                {provider.models.map((model, index) => (
                  <li className="model-row" key={model.id}>
                    <div className="model-tools">
                      <button
                        type="button"
                        onClick={() => moveModel(model.id, -1)}
                        disabled={index === 0}
                        aria-label={`Move ${model.name} up`}
                        title="Move up"
                      >
                        <ArrowUp size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveModel(model.id, 1)}
                        disabled={index === provider.models.length - 1}
                        aria-label={`Move ${model.name} down`}
                        title="Move down"
                      >
                        <ArrowDown size={13} />
                      </button>
                    </div>
                    <div className="model-content">
                      <div className="model-title-row">
                        <div className="model-name">{model.name}</div>
                        {provider.kind === 'local' && (
                          <select
                            className={`host-select ${model.host ? '' : 'host-select--none'}`}
                            value={model.host ?? ''}
                            aria-label={`Host for ${model.name}`}
                            onChange={(event) =>
                              updateModel(model.id, {
                                host: (event.target.value || undefined) as
                                  | HostId
                                  | undefined,
                              })
                            }
                          >
                            <option value="">Host…</option>
                            {hostOptions(machines).map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                      <textarea
                        rows={2}
                        value={model.note}
                        placeholder="Where this model shines, or where it falls over…"
                        onChange={(event) =>
                          updateModel(model.id, { note: event.target.value })
                        }
                      />
                    </div>
                    <button
                      type="button"
                      className="icon-btn icon-btn--danger"
                      onClick={() => removeModel(model.id)}
                      aria-label={`Remove ${model.name}`}
                      title="Remove model"
                    >
                      <Trash2 size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <form className="add-model" onSubmit={handleAddModel}>
              <input
                value={newModel}
                onChange={(event) => setNewModel(event.target.value)}
                placeholder="Add a model by name…"
                aria-label="New model name"
              />
              {provider.kind === 'local' && (
                <select
                  className="host-select add-model-host"
                  value={newModelHost}
                  aria-label="Host for new model"
                  onChange={(event) => setNewModelHost(event.target.value as HostId)}
                >
                  {hostOptions(machines).map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              )}
              <button type="submit" className="btn btn-ghost">
                <Plus size={14} /> Add
              </button>
            </form>
          </section>

          <section className="panel">
            <div className="panel-head">
              <div>
                <h2>Rules &amp; limits</h2>
                <p>Read before leaning on the free tier.</p>
              </div>
              {editingRules ? (
                <div className="edit-actions">
                  <button type="button" className="text-btn" onClick={saveRules}>
                    <Check size={13} /> Save
                  </button>
                  <button
                    type="button"
                    className="text-btn"
                    onClick={() => setEditingRules(false)}
                  >
                    <X size={13} /> Cancel
                  </button>
                </div>
              ) : (
                <button type="button" className="text-btn" onClick={startEditingRules}>
                  <Pencil size={13} /> Edit
                </button>
              )}
            </div>

            {editingRules ? (
              <textarea
                className="rules-editor"
                rows={9}
                value={rulesDraft}
                onChange={(event) => setRulesDraft(event.target.value)}
                placeholder="One rule per line…"
              />
            ) : provider.rules.length > 0 ? (
              <ol className="rules-list">
                {provider.rules.map((rule, index) => (
                  <li key={`${provider.id}-rule-${index}`}>{rule}</li>
                ))}
              </ol>
            ) : (
              <div className="inner-empty">
                No rules saved yet. Add what you know so future-you remembers.
              </div>
            )}

            <div className="rules-foot">
              {provider.sourceUrl && (
                <a
                  className="source-link"
                  href={provider.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Provider docs <ArrowUpRight size={13} />
                </a>
              )}
              <span className="panel-hint">Terms change — this copy is yours to correct.</span>
            </div>
          </section>
        </div>

        <aside className="detail-side">
          <section className="panel note-panel">
            <div className="panel-head">
              <div>
                <h2>Your note</h2>
                <p>The big picture: plan, catches, what you would use it for.</p>
              </div>
              <span className="save-hint">
                <Check size={12} /> autosaved
              </span>
            </div>
            <textarea
              className="big-note"
              rows={9}
              value={provider.note}
              placeholder="What worked, what didn't, which plan you're on, what you'd tell yourself next month…"
              onChange={(event) =>
                update((current) => ({ ...current, note: event.target.value }))
              }
            />
          </section>

          <section className="panel">
            <div className="panel-head">
              <div>
                <h2>Verdict</h2>
                <p>How it has actually gone.</p>
              </div>
            </div>
            <div className="verdict-picker">
              {VERDICT_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`verdict-option verdict-option--${option.value} ${
                    provider.verdict === option.value ? 'is-selected' : ''
                  }`}
                  onClick={() =>
                    update((current) => ({
                      ...current,
                      verdict: option.value as Verdict,
                    }))
                  }
                >
                  <i aria-hidden="true" />
                  {option.label}
                </button>
              ))}
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <div>
                <h2>Profile</h2>
                <p>Details you want to keep handy.</p>
              </div>
            </div>
            <label className="field">
              <span>Plan</span>
              <input
                value={provider.plan}
                onChange={(event) =>
                  update((current) => ({ ...current, plan: event.target.value }))
                }
              />
            </label>
            <label className="field">
              <span>Website</span>
              <input
                value={provider.website}
                onChange={(event) =>
                  update((current) => ({ ...current, website: event.target.value }))
                }
              />
            </label>
            <label className="field">
              <span>One-line summary</span>
              <textarea
                rows={2}
                value={provider.summary}
                onChange={(event) =>
                  update((current) => ({ ...current, summary: event.target.value }))
                }
              />
            </label>
            <p className="panel-hint">
              Added {shortDate(provider.createdAt)} · updated{' '}
              {shortDate(provider.updatedAt)}
            </p>
          </section>

          <section className="panel danger-panel">
            <h2>Remove provider</h2>
            <p>Deletes its quotas, models, notes and rules from this browser.</p>
            <button type="button" className="btn btn-danger" onClick={handleDelete}>
              <Trash2 size={14} /> Delete provider
            </button>
          </section>
        </aside>
      </div>
    </div>
  )
}
