export type ProviderStatus = 'active' | 'watchlist'
export type Verdict = 'works' | 'mixed' | 'failed' | 'untried'
/** A machine id. Built-in machines are `omarchy` and `pi5`; added ones get a generated id. */
export type HostId = string
export type ProviderKind = 'cloud' | 'local'
export type QuotaUnit = 'hours' | 'requests' | 'usd' | 'tokens' | 'neurons' | 'credits'
export type QuotaWindow = 'minute' | 'hour' | 'day' | 'week' | 'month' | 'none'

export interface Quota {
  id: string
  label: string
  unit: QuotaUnit
  limit: number
  used: number
  window: QuotaWindow
  /** ISO timestamp for the start of the current window. */
  anchor: string
}

export interface ProviderModel {
  id: string
  name: string
  note: string
  /** Which local machine the model came from. Cloud models leave this empty. */
  host?: HostId
}

export interface MachineSsh {
  host: string
  port: number
  user: string
  /** When the panel last confirmed it could log in. */
  checkedAt?: string
}

export interface Machine {
  id: string
  label: string
  /** Short form used in pills and the sidebar. */
  short: string
  hostname: string
  endpoint: string
  detail: string
  accent: string
  /** When this machine's inventory was last read by hand. */
  checkedAt?: string
  /** True when the last scan reached it. */
  online?: boolean
  /** Set for machines added by hand on the cloud panel. */
  ssh?: MachineSsh
  sshOk?: boolean
}

export interface MachineDraft {
  label: string
  hostname: string
  endpoint: string
  detail: string
  models: ProviderModel[]
  ssh?: { host: string; port: number; user: string }
}

export interface Provider {
  id: string
  name: string
  accent: string
  kind?: ProviderKind
  status: ProviderStatus
  plan: string
  website: string
  verdict: Verdict
  summary: string
  note: string
  rules: string[]
  sourceUrl?: string
  quotas: Quota[]
  models: ProviderModel[]
  order: number
  createdAt: string
  updatedAt: string
}

export interface ProviderDraft {
  name: string
  plan: string
  website: string
  status: ProviderStatus
  verdict: Verdict
  summary: string
  note: string
  rules: string[]
  sourceUrl?: string
  quotas: Quota[]
  models: ProviderModel[]
}

export interface AppState {
  version: 1 | 2 | 3 | 4
  providers: Provider[]
  machines?: Machine[]
  dataAt?: string | null
}
