import { useState } from 'react'
import { Loader2, Plus, RefreshCw, Wifi } from 'lucide-react'
import { shortDateTime } from '../lib/display'
import type { ScanResult } from '../store'
import { ScanTargetModal } from './ScanTargetModal'

export function ScanBar({
  scanning,
  error,
  scan,
  dataAt,
  onRefresh,
  onAddMachine,
}: {
  scanning: boolean
  error: string
  scan: ScanResult | null
  dataAt: string | null
  onRefresh: () => void
  onAddMachine: () => void
}) {
  const [picking, setPicking] = useState(false)

  return (
    <div className="scan-bar">
      <div className="scan-actions">
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => setPicking(true)}
          disabled={scanning}
        >
          {scanning ? <Loader2 size={14} className="spin" /> : <Wifi size={14} />}
          {scanning ? 'Scanning…' : 'Scan…'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onRefresh}>
          <RefreshCw size={14} /> New data
        </button>
        <button type="button" className="btn btn-ghost" onClick={onAddMachine}>
          <Plus size={14} /> Add machine
        </button>
        <span className="scan-time">
          {scan
            ? `Read ${scan.target || 'this server'} ${shortDateTime(scan.at)}`
            : 'Not scanned yet'}
        </span>
      </div>

      {error && <p className="scan-error">{error}</p>}

      {scan && scan.public && (
        <p className="scan-warn scan-warn--danger">
          The last scan went to {scan.target}, which is a public range.
        </p>
      )}

      {scan && scan.devices.length > 0 && (
        <div className="scan-devices">
          <p className="micro-label">
            {scan.devices.length} device{scan.devices.length === 1 ? '' : 's'} on{' '}
            {scan.target || scan.subnet}
          </p>
          <div className="chips">
            {scan.devices.map((device) => (
              <span
                className={`chip scan-chip ${device.agent ? 'scan-chip--model' : ''}`}
                key={device.ip}
                title={device.agent ?? 'No model API found'}
              >
                {device.hostname || device.ip}
                {device.hostname && <span className="scan-device-ip">{device.ip}</span>}
                {device.models.length > 0 && (
                  <strong className="scan-device-count">{device.models.length}</strong>
                )}
              </span>
            ))}
          </div>
        </div>
      )}

      {!scan && !error && (
        <p className="scan-hint">
          Nothing is polled in the background. Scan asks what to read: this server,
          the local network when this machine has one, or an address or range you
          name.
        </p>
      )}
      {scan && <p className="scan-hint">Last read {shortDateTime(dataAt)}</p>}

      {picking && <ScanTargetModal onClose={() => setPicking(false)} />}
    </div>
  )
}
