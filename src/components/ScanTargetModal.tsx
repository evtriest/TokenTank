import { useEffect, useState } from 'react'
import {
  AlertTriangle,
  Globe2,
  Loader2,
  Server,
  Wifi,
  X,
} from 'lucide-react'
import { useStore } from '../store'
import { checkTarget } from '../lib/target'

type Choice = 'local' | 'self' | 'custom'

/**
 * Ask what to scan before anything leaves the panel. The local network is only
 * on offer when the server actually sits on one; a public address is named by
 * hand, is marked red, and needs a second click.
 */
export function ScanTargetModal({ onClose }: { onClose: () => void }) {
  const { scanNetwork, scanning, context } = useStore()
  const [choice, setChoice] = useState<Choice>(context?.localNetwork ? 'local' : 'custom')
  const [custom, setCustom] = useState('')
  const [error, setError] = useState('')
  const [confirming, setConfirming] = useState(false)

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

  const checked = choice === 'custom' ? checkTarget(custom) : null
  const target = choice === 'self' ? 'self' : choice === 'local' ? 'local' : custom.trim()
  const publicTarget = checked?.ok === true && checked.public
  const noLocalNetwork = context !== null && !context.localNetwork

  async function start() {
    setError('')
    if (choice === 'custom') {
      if (!checked?.ok) {
        setError(checked?.message ?? 'Give an address, a range or a subnet.')
        return
      }
      if (checked.public && !confirming) {
        setConfirming(true)
        return
      }
    }
    const ok = await scanNetwork(target)
    if (ok) onClose()
    else setError('The scan did not run. The reason is under the scan bar.')
  }

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="scan-title">
        <header className="modal-head">
          <div>
            <p className="eyebrow">Scan</p>
            <h2 id="scan-title">What should be read?</h2>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </header>

        <div className="modal-form">
          {noLocalNetwork && (
            <p className="scan-warn scan-warn--danger">
              <AlertTriangle size={13} />
              <span>
                This panel runs on a public address ({context?.localIp}). There is no
                local network to sweep from here: name an address or range, or read
                this server only.
              </span>
            </p>
          )}

          <div className="scan-choices">
            <label className={`scan-choice ${choice === 'local' ? 'is-on' : ''}`}>
              <input
                type="radio"
                name="scan-target"
                checked={choice === 'local'}
                disabled={!context?.localNetwork}
                onChange={() => {
                  setChoice('local')
                  setConfirming(false)
                }}
              />
              <Wifi size={14} />
              <span>
                <strong>Local network</strong>
                <small>
                  {context?.localNetwork
                    ? `${context.subnet} · detected on this machine`
                    : 'Not available: this server is not on a private network.'}
                </small>
              </span>
            </label>

            <label className={`scan-choice ${choice === 'self' ? 'is-on' : ''}`}>
              <input
                type="radio"
                name="scan-target"
                checked={choice === 'self'}
                onChange={() => {
                  setChoice('self')
                  setConfirming(false)
                }}
              />
              <Server size={14} />
              <span>
                <strong>This server</strong>
                <small>
                  {context?.hostname
                    ? `${context.hostname} · its own model endpoints only`
                    : 'Its own model endpoints only'}
                </small>
              </span>
            </label>

            <label className={`scan-choice ${choice === 'custom' ? 'is-on' : ''}`}>
              <input
                type="radio"
                name="scan-target"
                checked={choice === 'custom'}
                onChange={() => {
                  setChoice('custom')
                  setConfirming(false)
                }}
              />
              <Globe2 size={14} />
              <span>
                <strong>An address or range</strong>
                <small>192.168.43.7 · 192.168.43.0/24 · 192.168.43.10-50</small>
              </span>
            </label>
          </div>

          {choice === 'custom' && (
            <label className="field">
              <span>Address, range or subnet</span>
              <input
                autoFocus
                value={custom}
                onChange={(event) => {
                  setCustom(event.target.value)
                  setConfirming(false)
                }}
                placeholder="192.168.43.10-192.168.43.60"
              />
            </label>
          )}

          {choice === 'custom' && custom.trim() !== '' && checked && !checked.ok && (
            <p className="form-error">{checked.message}</p>
          )}

          {publicTarget && (
            <p className="scan-warn scan-warn--danger">
              <AlertTriangle size={13} />
              <span>
                <strong>{checked?.summary}</strong> is outside the private ranges. A
                scan sends probes to addresses that are not yours, over the open
                internet.
              </span>
            </p>
          )}

          {confirming && (
            <div className="scan-confirm">
              <p>
                <strong>Are you sure?</strong> This scan leaves this server and probes{' '}
                {checked?.summary} — {checked?.hosts} address
                {checked?.hosts === 1 ? '' : 'es'}. Only scan what you are responsible
                for.
              </p>
            </div>
          )}

          {error && <p className="form-error">{error}</p>}

          <footer className="modal-foot">
            {confirming ? (
              <>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setConfirming(false)}
                  disabled={scanning}
                >
                  Back
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => void start()}
                  disabled={scanning}
                >
                  {scanning ? (
                    <Loader2 size={14} className="spin" />
                  ) : (
                    <AlertTriangle size={14} />
                  )}
                  {scanning ? 'Scanning…' : 'Yes, scan it'}
                </button>
              </>
            ) : (
              <>
                <button type="button" className="btn btn-ghost" onClick={onClose}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => void start()}
                  disabled={scanning}
                >
                  {scanning ? <Loader2 size={14} className="spin" /> : <Wifi size={14} />}
                  {scanning ? 'Scanning…' : publicTarget ? 'Scan anyway' : 'Scan'}
                </button>
              </>
            )}
          </footer>
        </div>
      </div>
    </div>
  )
}
