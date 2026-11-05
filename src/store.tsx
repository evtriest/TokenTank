import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type {
  Machine,
  MachineDraft,
  Provider,
  ProviderDraft,
  ProviderModel,
  ProviderStatus,
} from './types'
import { createSeedProviders } from './data/seed'
import { createServerProvider, ensureLocalProvider } from './data/local'
import { createDefaultMachines, nextMachineAccent } from './lib/hosts'
import { rollProviders } from './lib/quota'
import { uid } from './lib/id'

/**
 * One panel for every deployment. What it can read is decided at runtime by the
 * server behind it: a machine on a private network can sweep that network, a
 * public server reads itself — and either can be pointed at an address or range
 * on purpose. The saved panel lives in this browser, so the Pi and the VPS never
 * overwrite each other's list.
 */
const STORAGE_KEY = 'freetokens.panel.v1'
const STORAGE_VERSION = 4

const API_BASE = import.meta.env.BASE_URL
const SCAN_ENDPOINT = `${API_BASE}api/scan`
const CONTEXT_ENDPOINT = `${API_BASE}api/context`
const SSH_CHECK_ENDPOINT = `${API_BASE}api/ssh/check`

const ACCENTS = ['#ff8a4c', '#a78bfa', '#7dd3fc', '#b7f077', '#f472b6', '#facc15', '#5eead4', '#fb923c']

function accentFor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  }
  return ACCENTS[hash % ACCENTS.length]
}

export interface ScanDevice {
  ip: string
  hostname: string
  openPorts: number[]
  /** e.g. "Ollama 0.33.2" or "OpenAI API :8080". Empty for plain devices. */
  agent: string | null
  port: number | null
  /** True when the model list was actually read. */
  reachable: boolean
  models: { name: string; note: string }[]
}

/** What the server behind the panel says about its own network. */
export interface ServerContext {
  hostname: string
  localIp: string
  /** The private subnet this server sits on; empty on a public address. */
  subnet: string
  localNetwork: boolean
  maxHosts: number
}

export type ScanScope = 'local' | 'self' | 'custom'

export interface ScanResult {
  at: string
  scope: ScanScope
  /** What was read: "192.168.43.0/24", "this server", "10.0.0.1-40". */
  target: string
  /** True when the target was outside the private ranges. */
  public: boolean
  subnet: string
  localIp: string
  devices: ScanDevice[]
}

interface ScanPayload {
  scannedAt?: string
  scope?: ScanScope
  target?: string
  public?: boolean
  localNetwork?: boolean
  subnet?: string
  localIp?: string
  devices?: ScanDevice[]
}

export interface SshCheckResult {
  ok: boolean
  target: string
  detail: string
  command: string
  publicKey: string
}

interface SavedState {
  version: 1 | 2 | 3 | 4
  providers: Provider[]
  machines?: Machine[]
  dataAt?: string | null
  scan?: ScanResult | null
}

function loadState(now: number): {
  providers: Provider[]
  machines: Machine[]
  dataAt: string | null
  scan: ScanResult | null
  /** False for a browser that has never saved a panel here. */
  saved: boolean
} {
  const fallback = {
    providers: [createServerProvider(now)],
    machines: [] as Machine[],
    dataAt: null,
    scan: null,
    saved: false,
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as SavedState
    if (!parsed || !Array.isArray(parsed.providers)) return fallback

    const providers =
      parsed.version === 1 ? ensureLocalProvider(parsed.providers, now) : parsed.providers
    const machines = Array.isArray(parsed.machines) ? parsed.machines : fallback.machines

    return {
      providers: rollProviders(providers, now),
      machines,
      dataAt: parsed.dataAt ?? null,
      scan: parsed.scan ?? null,
      saved: true,
    }
  } catch {
    // Corrupt or unavailable storage: fall back to seed data.
    return fallback
  }
}

function saveState(
  providers: Provider[],
  machines: Machine[],
  dataAt: string | null,
  scan: ScanResult | null,
): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: STORAGE_VERSION,
        providers,
        machines,
        dataAt,
        scan,
      }),
    )
  } catch {
    // Storage can be full or blocked; the panel keeps working in memory.
  }
}

/** Keep models for a machine in sync with what the scanner just read. */
function mergeMachineModels(
  models: ProviderModel[],
  machineId: string,
  scanned: { name: string; note: string }[],
): ProviderModel[] {
  const scannedNames = new Set(scanned.map((entry) => entry.name).filter(Boolean))
  const kept = models.filter(
    (model) => model.host !== machineId || scannedNames.has(model.name),
  )
  const known = new Set(kept.map((model) => model.name))
  const additions = scanned
    .filter((entry) => entry.name && !known.has(entry.name))
    .map((entry) => ({
      id: uid('model'),
      name: entry.name,
      note: entry.note ?? '',
      host: machineId,
    }))
  return [...kept, ...additions]
}

interface Store {
  providers: Provider[]
  machines: Machine[]
  now: number
  dataAt: string | null
  scan: ScanResult | null
  /** What the server says about its own network, once it has answered. */
  context: ServerContext | null
  /** True when this panel has no private network, so the local entry is not ranked. */
  serverOnly: boolean
  scanning: boolean
  scanError: string
  /** Ask the server whether it can log in to a machine over SSH. */
  sshCheck: (input: {
    host: string
    port?: string
    user?: string
    command?: string
  }) => Promise<SshCheckResult>
  updateProvider: (id: string, updater: (provider: Provider) => Provider) => void
  addProvider: (draft: ProviderDraft) => string
  removeProvider: (id: string) => void
  moveProvider: (id: string, direction: -1 | 1) => void
  setProviderStatus: (id: string, status: ProviderStatus) => void
  addMachine: (draft: MachineDraft) => string
  removeMachine: (id: string) => void
  refreshData: () => void
  /** "" lets the server pick; "self", "local" or an address/range pin it down. */
  scanNetwork: (target: string) => Promise<boolean>
}

const StoreContext = createContext<Store | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [initial] = useState(() => loadState(Date.now()))
  const [providers, setProviders] = useState<Provider[]>(initial.providers)
  const [machines, setMachines] = useState<Machine[]>(initial.machines)
  const [dataAt, setDataAt] = useState<string | null>(initial.dataAt)
  const [scan, setScan] = useState<ScanResult | null>(initial.scan)
  const [context, setContext] = useState<ServerContext | null>(null)
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState('')
  const [now, setNow] = useState(() => Date.now())
  /** True once this panel has folded in a scan of its own deployment. */
  const seenScan = useRef(initial.scan !== null)
  const providersRef = useRef(providers)
  const machinesRef = useRef(machines)
  providersRef.current = providers
  machinesRef.current = machines
  const serverOnly = context !== null && !context.localNetwork

  useEffect(() => {
    saveState(providers, machines, dataAt, scan)
  }, [providers, machines, dataAt, scan])

  // Ask the server where it lives once, so the scan dialog knows whether a local
  // network exists here. This status read never scans.
  useEffect(() => {
    let alive = true
    fetch(CONTEXT_ENDPOINT, { headers: { Accept: 'application/json' }, cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: ServerContext | null) => {
        if (alive && payload && typeof payload.localNetwork === 'boolean') setContext(payload)
      })
      .catch(() => {
        // Static hosting without server.py: the panel keeps working from saved data.
      })
    return () => {
      alive = false
    }
  }, [])

  // One read when the panel opens. What it covers is the server's call: the
  // private network when there is one, only this server otherwise. After this
  // the Scan button is the only thing that touches the network.
  useEffect(() => {
    if (!initial.scan) void scanNetwork('')
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => {
      const timestamp = Date.now()
      setNow(timestamp)
      setProviders((current) => rollProviders(current, timestamp))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [])

  function updateProvider(id: string, updater: (provider: Provider) => Provider) {
    setProviders((current) =>
      current.map((provider) =>
        provider.id === id
          ? {
              ...updater(provider),
              id: provider.id,
              updatedAt: new Date().toISOString(),
            }
          : provider,
      ),
    )
  }

  function addProvider(draft: ProviderDraft): string {
    const id = uid('provider')
    const timestamp = new Date().toISOString()
    setProviders((current) => {
      const group = current.filter((provider) => provider.status === draft.status)
      const order = group.reduce((max, provider) => Math.max(max, provider.order), -1) + 1
      return [
        ...current,
        {
          ...draft,
          id,
          accent: accentFor(draft.name),
          order,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      ]
    })
    return id
  }

  function removeProvider(id: string) {
    setProviders((current) => current.filter((provider) => provider.id !== id))
  }

  function moveProvider(id: string, direction: -1 | 1) {
    setProviders((current) => {
      const target = current.find((provider) => provider.id === id)
      if (!target) return current
      const group = current
        .filter((provider) => provider.status === target.status)
        .sort((a, b) => a.order - b.order)
      const index = group.findIndex((provider) => provider.id === id)
      const neighbour = group[index + direction]
      if (!neighbour) return current
      return current.map((provider) => {
        if (provider.id === target.id) {
          return { ...provider, order: neighbour.order, updatedAt: new Date().toISOString() }
        }
        if (provider.id === neighbour.id) {
          return { ...provider, order: target.order, updatedAt: new Date().toISOString() }
        }
        return provider
      })
    })
  }

  function setProviderStatus(id: string, status: ProviderStatus) {
    setProviders((current) => {
      const target = current.find((provider) => provider.id === id)
      if (!target || target.status === status) return current
      const group = current.filter((provider) => provider.status === status)
      const order = group.reduce((max, provider) => Math.max(max, provider.order), -1) + 1
      return current.map((provider) =>
        provider.id === id
          ? { ...provider, status, order, updatedAt: new Date().toISOString() }
          : provider,
      )
    })
  }

  function addMachine(draft: MachineDraft): string {
    const id = uid('machine')
    const timestamp = new Date().toISOString()
    setMachines((current) => [
      ...current,
      {
        id,
        label: draft.label,
        short: draft.label,
        hostname: draft.hostname,
        endpoint: draft.endpoint,
        detail: draft.detail,
        accent: nextMachineAccent(current.length),
        checkedAt: timestamp,
        online: false,
        ssh: draft.ssh ? { ...draft.ssh, checkedAt: timestamp } : undefined,
        sshOk: draft.ssh ? true : undefined,
      },
    ])
    if (draft.models.length > 0) {
      setProviders((current) =>
        current.map((provider) =>
          provider.kind === 'local'
            ? {
                ...provider,
                models: [
                  ...provider.models,
                  ...draft.models.map((model) => ({ ...model, host: id })),
                ],
                updatedAt: timestamp,
              }
            : provider,
        ),
      )
    }
    return id
  }

  function removeMachine(id: string) {
    setMachines((current) => current.filter((machine) => machine.id !== id))
    setProviders((current) =>
      current.map((provider) => ({
        ...provider,
        models: provider.models.map((model) =>
          model.host === id ? { ...model, host: undefined } : model,
        ),
      })),
    )
  }

  /** Stamp a hand-checked refresh without touching the network. */
  function refreshData() {
    const timestamp = new Date().toISOString()
    setDataAt(timestamp)
    setMachines((current) =>
      current.map((machine) => ({ ...machine, checkedAt: timestamp })),
    )
  }

  /** Fold one scan payload into the panel. */
  function applyScan(payload: ScanPayload) {
    const at = payload.scannedAt ?? new Date().toISOString()
    const devices = Array.isArray(payload.devices) ? payload.devices : []
    const scope: ScanScope =
      payload.scope === 'self' ? 'self' : payload.scope === 'custom' ? 'custom' : 'local'
    const localNetwork = payload.localNetwork ?? false

    let baseProviders = providersRef.current
    let baseMachines = machinesRef.current

    // A panel with nothing saved adopts the machine it runs on: the provider
    // board where there is a private network, only this server's own inventory
    // on a bare public server.
    if (!seenScan.current) {
      seenScan.current = true
      if (localNetwork) {
        const stamp = Date.now()
        baseProviders = createSeedProviders(stamp)
        baseMachines = createDefaultMachines(stamp)
      } else {
        baseProviders = [createServerProvider(Date.now())]
        baseMachines = []
      }
    }

    const hosted = devices.filter(
      (device) => device.agent !== null || device.reachable || scope === 'self',
    )
    const mapping = new Map<string, string>()
    const next = [...baseMachines]

    for (const device of hosted) {
      const existing = next.find(
        (machine) =>
          (machine.endpoint ?? '').includes(device.ip) ||
          (device.hostname !== '' &&
            machine.hostname.toLowerCase() === device.hostname.toLowerCase()),
      )
      const id = existing?.id ?? `machine-${device.ip.replace(/\./g, '-')}`
      mapping.set(device.ip, id)

      const label = existing?.label || device.hostname || device.ip
      const machine: Machine = {
        id,
        label,
        short: existing?.short || label,
        hostname: device.hostname || existing?.hostname || '',
        endpoint: `${device.ip}:${device.port ?? 11434}`,
        // A scan is the freshest truth about the agent, so it beats a stale note.
        detail: device.agent || existing?.detail || '',
        accent: existing?.accent ?? nextMachineAccent(next.length),
        checkedAt: at,
        online: device.reachable || scope === 'self',
      }

      if (existing) next[next.indexOf(existing)] = machine
      else next.push(machine)
    }

    const scannedModels = new Map<string, { name: string; note: string }[]>()
    for (const device of hosted) {
      const id = mapping.get(device.ip)
      if (id && (device.reachable || scope === 'self')) {
        scannedModels.set(id, device.models ?? [])
      }
    }

    const nextProviders = baseProviders.map((provider) => {
      if (provider.kind !== 'local') return provider
      let models = provider.models
      for (const [machineId, entries] of scannedModels) {
        models = mergeMachineModels(models, machineId, entries)
      }
      return { ...provider, models, updatedAt: at }
    })

    setMachines(next)
    setProviders(nextProviders)
    setDataAt(at)
    setScan({
      at,
      scope,
      target: payload.target || (scope === 'self' ? 'this server' : ''),
      public: Boolean(payload.public),
      subnet: payload.subnet ?? '',
      localIp: payload.localIp ?? '',
      devices,
    })
    setContext((current) =>
      current
        ? { ...current, localNetwork, localIp: payload.localIp || current.localIp }
        : current,
    )
  }

  async function sshCheck(input: {
    host: string
    port?: string
    user?: string
    command?: string
  }): Promise<SshCheckResult> {
    const response = await fetch(SSH_CHECK_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(input),
      cache: 'no-store',
    })
    const type = response.headers.get('content-type') ?? ''
    if (!type.includes('application/json')) {
      throw new Error('No SSH checker behind this address.')
    }
    const payload = (await response.json()) as SshCheckResult & { error?: string }
    if (payload.error) throw new Error(payload.error)
    return payload
  }

  async function scanNetwork(target: string): Promise<boolean> {
    setScanning(true)
    setScanError('')
    try {
      const params = new URLSearchParams({ refresh: '1' })
      if (target) params.set('target', target)
      const response = await fetch(`${SCAN_ENDPOINT}?${params.toString()}`, {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      })
      if (response.status === 409) {
        throw new Error(
          'That target is outside the private ranges. Confirm the scan to go ahead.',
        )
      }
      const type = response.headers.get('content-type') ?? ''
      if (!type.includes('application/json')) {
        throw new Error(
          'No scanner behind this address. Run server.py next to the build to scan.',
        )
      }
      const payload = (await response.json()) as ScanPayload & { error?: string }
      if (!response.ok || payload.error) {
        throw new Error(payload.error ?? `The scanner answered ${response.status}.`)
      }
      applyScan(payload)
      return true
    } catch (error) {
      setScanError(error instanceof Error ? error.message : 'The scan failed.')
      return false
    } finally {
      setScanning(false)
    }
  }

  return (
    <StoreContext.Provider
      value={{
        providers,
        machines,
        now,
        dataAt,
        scan,
        context,
        serverOnly,
        scanning,
        scanError,
        sshCheck,
        updateProvider,
        addProvider,
        removeProvider,
        moveProvider,
        setProviderStatus,
        addMachine,
        removeMachine,
        refreshData,
        scanNetwork,
      }}
    >
      {children}
    </StoreContext.Provider>
  )
}

export function useStore(): Store {
  const store = useContext(StoreContext)
  if (!store) throw new Error('useStore must be used inside StoreProvider')
  return store
}
