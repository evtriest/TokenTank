import type { Quota, QuotaUnit, QuotaWindow } from '../types'

export const WINDOW_OPTIONS: { value: QuotaWindow; label: string }[] = [
  { value: 'minute', label: 'Every minute' },
  { value: 'hour', label: 'Hourly' },
  { value: 'day', label: 'Daily' },
  { value: 'week', label: 'Weekly' },
  { value: 'month', label: 'Monthly' },
  { value: 'none', label: 'No reset' },
]

export const UNIT_OPTIONS: { value: QuotaUnit; label: string }[] = [
  { value: 'hours', label: 'Hours' },
  { value: 'requests', label: 'Requests' },
  { value: 'usd', label: 'USD / credits ($)' },
  { value: 'tokens', label: 'Tokens' },
  { value: 'neurons', label: 'Neurons' },
  { value: 'credits', label: 'Credits' },
]

export const LOCAL_TZ = (() => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
})()

function partsInTz(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date)
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0)
  let hour = get('hour')
  if (hour === 24) hour = 0
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour,
    minute: get('minute'),
    second: get('second'),
  }
}

function offsetMs(date: Date, timeZone: string): number {
  const p = partsInTz(date, timeZone)
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  const floored = Math.floor(date.getTime() / 1000) * 1000
  return asUtc - floored
}

/** Midnight at the start of the current day in the given IANA timezone. */
export function startOfDayInTz(date: Date, timeZone = LOCAL_TZ): Date {
  const p = partsInTz(date, timeZone)
  const wallClockMidnight = Date.UTC(p.year, p.month - 1, p.day, 0, 0, 0)
  let guess = wallClockMidnight - offsetMs(date, timeZone)
  // Refine once so DST boundaries don't shift the answer.
  guess = wallClockMidnight - offsetMs(new Date(guess), timeZone)
  return new Date(guess)
}

export function addWindow(date: Date, window: QuotaWindow): Date {
  const d = new Date(date)
  switch (window) {
    case 'minute':
      d.setTime(d.getTime() + 60_000)
      break
    case 'hour':
      d.setTime(d.getTime() + 3_600_000)
      break
    case 'day':
      d.setTime(d.getTime() + 86_400_000)
      break
    case 'week':
      d.setTime(d.getTime() + 7 * 86_400_000)
      break
    case 'month': {
      const day = d.getUTCDate()
      d.setUTCDate(1)
      d.setUTCMonth(d.getUTCMonth() + 1)
      const daysInMonth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
      d.setUTCDate(Math.min(day, daysInMonth))
      break
    }
    case 'none':
      break
  }
  return d
}

/** The next reset moment after `now`, based on the quota's window anchor. */
export function nextReset(quota: Quota, now: number): number | null {
  if (quota.window === 'none') return null
  let next = addWindow(new Date(quota.anchor), quota.window)
  let guard = 0
  while (next.getTime() <= now && guard < 10_000) {
    next = addWindow(next, quota.window)
    guard += 1
  }
  return next.getTime()
}

/** Move the anchor across elapsed windows and clear usage when a window rolls over. */
export function rollQuota(quota: Quota, now: number): Quota {
  if (quota.window === 'none') return quota
  const start = new Date(quota.anchor)
  let next = addWindow(start, quota.window)
  if (next.getTime() > now) return quota

  let anchor = quota.anchor
  let guard = 0
  while (next.getTime() <= now && guard < 10_000) {
    anchor = next.toISOString()
    next = addWindow(new Date(anchor), quota.window)
    guard += 1
  }
  return { ...quota, anchor, used: 0 }
}

export function rollProviders<T extends { quotas: Quota[] }>(providers: T[], now: number): T[] {
  let changed = false
  const next = providers.map((provider) => {
    let providerChanged = false
    const quotas = provider.quotas.map((quota) => {
      const rolled = rollQuota(quota, now)
      if (rolled !== quota) providerChanged = true
      return rolled
    })
    if (!providerChanged) return provider
    changed = true
    return { ...provider, quotas }
  })
  return changed ? next : providers
}

export function remaining(quota: Quota): number {
  return Math.max(0, quota.limit - quota.used)
}

export function percentLeft(quota: Quota): number {
  if (!Number.isFinite(quota.limit) || quota.limit <= 0) return 0
  return Math.max(0, Math.min(100, (remaining(quota) / quota.limit) * 100))
}

export function percentLabel(percent: number): string {
  if (percent > 0 && percent < 1) return '<1%'
  return `${Math.round(percent)}%`
}

export function quotaTone(percent: number): 'good' | 'warn' | 'bad' {
  if (percent < 20) return 'bad'
  if (percent < 50) return 'warn'
  return 'good'
}

export function windowAdverb(window: QuotaWindow): string {
  switch (window) {
    case 'minute':
      return 'every minute'
    case 'hour':
      return 'hourly'
    case 'day':
      return 'daily'
    case 'week':
      return 'weekly'
    case 'month':
      return 'monthly'
    case 'none':
      return 'never'
  }
}

export function formatDuration(ms: number): string {
  if (ms <= 0) return 'now'
  const totalSeconds = Math.floor(ms / 1000)
  const days = Math.floor(totalSeconds / 86_400)
  const hours = Math.floor((totalSeconds % 86_400) / 3_600)
  const minutes = Math.floor((totalSeconds % 3_600) / 60)
  const seconds = totalSeconds % 60
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes.toString().padStart(2, '0')}m`
  if (minutes > 0) return `${minutes}m ${seconds.toString().padStart(2, '0')}s`
  return `${seconds}s`
}

export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '0'
  return new Intl.NumberFormat('en', { maximumFractionDigits: 1 }).format(value)
}

export function formatCompact(value: number): string {
  if (!Number.isFinite(value)) return '0'
  return new Intl.NumberFormat('en', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value)
}

export function formatAmount(unit: QuotaUnit, value: number): string {
  switch (unit) {
    case 'usd':
      return `$${Number(value).toFixed(2)}`
    case 'hours':
      return `${formatNumber(value)} h`
    case 'requests':
      return `${formatNumber(value)} req`
    case 'tokens':
      return `${formatCompact(value)} tokens`
    case 'neurons':
      return `${formatCompact(value)} neurons`
    case 'credits':
      return `${formatNumber(value)} credits`
  }
}

export function formatResetMoment(ms: number | null): string {
  if (ms === null) return 'No reset'
  return new Date(ms).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function newQuota(overrides: Partial<Quota> = {}): Quota {
  const now = new Date().toISOString()
  return {
    id: `q_${Math.random().toString(36).slice(2, 10)}`,
    label: 'New quota',
    unit: 'requests',
    limit: 100,
    used: 0,
    window: 'day',
    anchor: now,
    ...overrides,
  }
}
