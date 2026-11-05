import type { CSSProperties } from 'react'
import type { Machine, ProviderModel } from '../types'
import { shortDateTime } from '../lib/display'

export function LocalHosts({
  models,
  machines,
  href,
  showModels = true,
  onRemove,
}: {
  models: ProviderModel[]
  machines: Machine[]
  href?: string
  showModels?: boolean
  onRemove?: (id: string) => void
}) {
  if (machines.length === 0) {
    return (
      <div className="inner-empty">
        No machines yet. Read this server or add another one by hand.
      </div>
    )
  }

  return (
    <div className="host-grid">
      {machines.map((machine) => {
        const hostModels = models.filter((model) => model.host === machine.id)
        const style = { '--host-accent': machine.accent } as CSSProperties

        return (
          <div className="host-card" style={style} key={machine.id}>
            <header className="host-head">
              <span className="host-dot" aria-hidden="true" />
              <div className="host-identity">
                <h3>{machine.label}</h3>
                <p>{machine.hostname || machine.endpoint}</p>
              </div>
              <strong className="host-count">
                {hostModels.length}
                <span> models</span>
              </strong>
            </header>
            <p className="host-meta">{machine.endpoint}</p>
            {machine.ssh && (
              <p className="host-ssh">
                ssh {machine.ssh.user ? `${machine.ssh.user}@` : ''}
                {machine.ssh.host}:{machine.ssh.port}
              </p>
            )}
            <p className="host-detail">{machine.detail}</p>
            {showModels && (
              <div className="chips">
                {hostModels.map((model) => (
                  <span className="chip" key={model.id} title={model.note}>
                    {model.name}
                  </span>
                ))}
                {hostModels.length === 0 && (
                  <span className="chip chip--empty">No models assigned</span>
                )}
              </div>
            )}
            <footer className="host-foot">
              <span className={`host-status ${machine.online ? 'is-online' : ''}`}>
                {machine.online ? 'online' : 'not scanned'}
              </span>
              <span className="host-read">read {shortDateTime(machine.checkedAt)}</span>
              {href && (
                <a className="host-open" href={href}>
                  Models
                </a>
              )}
              {onRemove && (
                <button
                  type="button"
                  className="text-btn text-btn--danger host-remove"
                  onClick={() => onRemove(machine.id)}
                >
                  Remove
                </button>
              )}
            </footer>
          </div>
        )
      })}
    </div>
  )
}
