import { Loader2, Plus, RefreshCw, Server, Wifi } from 'lucide-react'
import { shortDateTime } from '../lib/display'
import { PANEL_MODE, type ScanResult } from '../store'

export function ScanBar({
  scanning,
  error,
  scan,
  dataAt,
  onScan,
  onRefresh,
  onAddMachine,
}: {
  scanning: boolean
  error: string
  scan: ScanResult | null
  dataAt: string | null
  onScan: () => void
  onRefresh: () => void
  onAddMachine: () => void
}) {
  const cloud = PANEL_MODE === 'cloud'

  return (
    <div className="scan-bar">
      <div className="scan-actions">
        <button
          type="button"
          className="btn btn-ghost"
          onClick={onScan}
          disabled={scanning}
        >
          {scanning ? (
            <Loader2 size={14} className="spin" />
          ) : cloud ? (
            <Server size={14} />
          ) : (
            <Wifi size={14} />
          )}
          {scanning
            ? cloud
              ? 'Reading…'
              : 'Scanning…'
            : cloud
              ? 'Read this server'
              : 'Scan network'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onRefresh}>
          <RefreshCw size={14} /> New data
        </button>
        <button type="button" className="btn btn-ghost" onClick={onAddMachine}>
          <Plus size={14} /> Add machine
        </button>
        <span className="scan-time">
          {scan ? `${cloud ? 'Read' : 'Scanned'} ${shortDateTime(scan.at)}` : 'Not scanned yet'}
        </span>
      </div>

      {error && <p className="scan-error">{error}</p>}

      {scan && scan.devices.length > 0 && (
        <div className="scan-devices">
          <p className="micro-label">
            {cloud
              ? 'This server'
              : `${scan.devices.length} devices on ${scan.subnet}`}
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
          {cloud
            ? 'Only this server is read: its own model endpoints, nothing else on the network. Add other machines by hand; nothing is polled in the background.'
            : 'Nothing is polled in the background. Scan when you want fresh data — it reads the machines that are on the network now.'}
        </p>
      )}
      {scan && <p className="scan-hint">Last read {shortDateTime(dataAt)}</p>}
    </div>
  )
}
