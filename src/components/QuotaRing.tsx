import { percentLabel, quotaTone } from '../lib/quota'

export function QuotaRing({
  percent,
  size = 98,
  muted = false,
}: {
  percent: number
  size?: number
  muted?: boolean
}) {
  const radius = 52
  const circumference = 2 * Math.PI * radius
  const safe = Math.max(0, Math.min(100, percent))
  const arc = (safe / 100) * circumference
  const tone = muted ? 'muted' : quotaTone(safe)

  return (
    <div
      className={`ring ring--${tone}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${percentLabel(safe)} left`}
    >
      <svg viewBox="0 0 120 120">
        <circle className="ring-track" cx="60" cy="60" r={radius} />
        <circle
          className="ring-arc"
          cx="60"
          cy="60"
          r={radius}
          strokeDasharray={`${arc} ${circumference}`}
        />
      </svg>
      <div className="ring-center">
        <strong>{percentLabel(safe)}</strong>
        <span>left</span>
      </div>
    </div>
  )
}
