import { useEffect, useState, type FormEvent } from 'react'
import { Loader2, Plus, RotateCcw, Terminal, X } from 'lucide-react'
import { useStore, type SshCheckResult } from '../store'
import { uid } from '../lib/id'

export function AddMachineModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: (id: string) => void
}) {
  const { addMachine, sshCheck } = useStore()
  /** The SSH check lives on the server, so it is available on every deployment. */
  const showSsh = true
  const [label, setLabel] = useState('')
  const [hostname, setHostname] = useState('')
  const [endpoint, setEndpoint] = useState('')
  const [detail, setDetail] = useState('')
  const [models, setModels] = useState('')
  const [sshUser, setSshUser] = useState('')
  const [sshPort, setSshPort] = useState('22')
  const [checking, setChecking] = useState(false)
  const [checked, setChecked] = useState<SshCheckResult | null>(null)
  const [sshCommand, setSshCommand] = useState('')
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

  async function runCheck(command?: string) {
    setChecking(true)
    setError('')
    try {
      const result = await sshCheck({
        host: hostname.trim(),
        port: sshPort.trim(),
        user: sshUser.trim(),
        command,
      })
      setChecked(result)
      if (!result.ok && result.command) setSshCommand(result.command)
    } catch (caught) {
      setChecked(null)
      setError(caught instanceof Error ? caught.message : 'The SSH check failed.')
    } finally {
      setChecking(false)
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!label.trim()) {
      setError('Give the machine a name.')
      return
    }

    const parsedModels = models
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [name, note = ''] = line.split('|').map((part) => part.trim())
        return { id: uid('model'), name, note }
      })
      .filter((model) => model.name)

    const id = addMachine({
      label: label.trim(),
      hostname: hostname.trim(),
      endpoint: endpoint.trim(),
      detail: detail.trim(),
      models: parsedModels,
      ssh:
        hostname.trim() || sshUser.trim()
          ? {
              host: hostname.trim() || label.trim(),
              port: Number(sshPort) || 22,
              user: sshUser.trim(),
            }
          : undefined,
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
        aria-labelledby="add-machine-title"
      >
        <header className="modal-head">
          <div>
            <p className="eyebrow">Local compute</p>
            <h2 id="add-machine-title">Add a machine</h2>
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
            <label className="field">
              <span>Name *</span>
              <input
                autoFocus
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                placeholder="e.g. Studio PC"
              />
            </label>
            <label className="field">
              <span>Hostname or IP</span>
              <input
                value={hostname}
                onChange={(event) => {
                  setHostname(event.target.value)
                  setChecked(null)
                }}
                placeholder="e.g. studio.example.com"
              />
            </label>
          </div>

          {showSsh && (
            <div className="ssh-box">
              <div className="form-grid">
                <label className="field">
                  <span>SSH user</span>
                  <input
                    value={sshUser}
                    onChange={(event) => {
                      setSshUser(event.target.value)
                      setChecked(null)
                    }}
                    placeholder="e.g. studio"
                  />
                </label>
                <label className="field">
                  <span>SSH port</span>
                  <input
                    value={sshPort}
                    onChange={(event) => {
                      setSshPort(event.target.value)
                      setChecked(null)
                    }}
                    placeholder="22"
                  />
                </label>
              </div>

              <div className="scan-actions">
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => void runCheck()}
                  disabled={checking || !hostname.trim()}
                >
                  {checking ? (
                    <Loader2 size={14} className="spin" />
                  ) : (
                    <Terminal size={14} />
                  )}
                  {checking ? 'Checking…' : 'Check SSH'}
                </button>
                <span
                  className={`ssh-status ${
                    checked ? (checked.ok ? 'is-ok' : 'is-fail') : ''
                  }`}
                >
                  {checking
                    ? 'testing'
                    : checked
                      ? checked.ok
                        ? 'connection works'
                        : 'no connection'
                      : 'not checked'}
                </span>
              </div>

              {!checked && (
                <p className="scan-hint">
                  This panel logs in from its server before it adds the machine. The
                  other machine needs this server&rsquo;s key in its
                  <code> ~/.ssh/authorized_keys</code>.
                </p>
              )}

              {checked && (
                <p className="ssh-detail">
                  {checked.ok
                    ? `Connected to ${checked.target}.`
                    : checked.detail || 'No answer from ssh.'}
                </p>
              )}

              {checked && !checked.ok && (
                <>
                  <label className="field">
                    <span>SSH command to this machine</span>
                    <input
                      value={sshCommand}
                      onChange={(event) => setSshCommand(event.target.value)}
                      placeholder="ssh user@host"
                    />
                  </label>
                  <div className="scan-actions">
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => void runCheck(sshCommand)}
                      disabled={checking || !sshCommand.trim()}
                    >
                      <RotateCcw size={14} /> Retry
                    </button>
                    <span className="scan-time">
                      Edit the command if the address or key differs, then retry.
                    </span>
                  </div>
                  {checked.publicKey && (
                    <>
                      <p className="scan-hint">
                        Or put this key on the other machine, then retry:
                      </p>
                      <pre className="ssh-key">{checked.publicKey}</pre>
                    </>
                  )}
                </>
              )}
            </div>
          )}

          <div className="form-grid">
            <label className="field">
              <span>Endpoint</span>
              <input
                value={endpoint}
                onChange={(event) => setEndpoint(event.target.value)}
                placeholder="192.168.43.60:11434"
              />
            </label>
            <label className="field">
              <span>Hardware / OS</span>
              <input
                value={detail}
                onChange={(event) => setDetail(event.target.value)}
                placeholder="Ryzen 7 · 32 GB · Ubuntu"
              />
            </label>
          </div>

          <label className="field">
            <span>Models · one per line, optional note after |</span>
            <textarea
              rows={5}
              value={models}
              onChange={(event) => setModels(event.target.value)}
              placeholder={'llama3.2:3b | 3.2B · 2.02 GB\nqwen3.5:2b'}
            />
          </label>

          <p className="panel-hint">
            Models you list here join the Local models provider and count toward this
            machine. A scan can fill this in for you later.
          </p>

          {error && <p className="form-error">{error}</p>}

          <footer className="modal-foot">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
            >
              <Plus size={15} /> Add machine
            </button>
          </footer>
        </form>
      </div>
    </div>
  )
}
