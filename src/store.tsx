import {
  createContext,
  useContext,
  useEffect,
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
import { createDefaultMachines, createServerMachine, nextMachineAccent } from './lib/hosts'
import { rollProviders } from './lib/quota'
import { uid } from './lib/id'

export type PanelMode = 'local' | 'cloud'

/** The cloud build reads only its own server and adds machines over SSH. */
export const PANEL_MODE: PanelMode =
  import.meta.env.VITE_PANEL_MODE === 'cloud' ? 'cloud' : 'local'

/**
 * Each build keeps its own saved panel: the Pi's browser holds the network
 * view, the VPS browser holds the server view. Neither overwrites the other.
 */
const STORAGE_KEY =
  PANEL_MODE === 'cloud' ? 'freetokens.panel.cloud.v1' : 'freetokens.panel.v1'
const STORAGE_VERSION = 3

const API_BASE = import.meta.env.BASE_URL
const SCAN_ENDPOINT = `${API_BASE}api/scan`
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

export interface ScanResult {
  at: string
  mode: PanelMode
  subnet: string
  localIp: string
  devices: ScanDevice[]
}

export interface SshCheckResult {
  ok: boolean
  target: string
  detail: string
  command: string
  publicKey: string
}

interface SavedState {
  version: 1 | 2 | 3
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
} {
  const fallback = {
    providers:
      PANEL_MODE === 'cloud' ? [createServerProvider(now)] : createSeedProviders(now),
    machines:
      PANEL_MODE === 'cloud' ? [createServerMachine(now)] : createDefaultMachines(now),
    dataAt: null,
    scan: null,
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
  mode: PanelMode
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
  scanNetwork: () => Promise<void>
}

const StoreContext = createContext<Store | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [initial] = useState(() => loadState(Date.now()))
  const [providers, setProviders] = useState<Provider[]>(initial.providers)
  const [machines, setMachines] = useState<Machine[]>(initial.machines)
  const [dataAt, setDataAt] = useState<string | null>(initial.dataAt)
  const [scan, setScan] = useState<ScanResult | null>(initial.scan)
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState('')
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    saveState(providers, machines, dataAt, scan)
  }, [providers, machines, dataAt, scan])

  // The cloud panel is supposed to show what this server really serves, so it
  // reads the server once on open. After that only the Read button touches the
  // network — the saved result is what you see on the next visit.
  useEffect(() => {
    if (PANEL_MODE === 'cloud' && !initial.scan) void scanNetwork()
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

  function applyScan(payload: {
    scannedAt?: string
    mode?: PanelMode
    subnet?: string
    localIp?: string
    devices?: ScanDevice[]
  }) {
    const at = payload.scannedAt ?? new Date().toISOString()
    const cloud = (payload.mode ?? PANEL_MODE) === 'cloud'
    const devices = Array.isArray(payload.devices) ? payload.devices : []
    const hosted = devices.filter((device) => device.agent || cloud)
    const mapping = new Map<string, string>()
    const next = [...machines]

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
        // The cloud panel is the live view of this server, so the card shows the
        // agent it just answered with. The network build keeps its own notes.
        detail: cloud
          ? device.agent || existing?.detail || ''
          : existing?.detail || device.agent || '',
        accent: existing?.accent ?? nextMachineAccent(next.length),
        checkedAt: at,
        online: device.reachable || cloud,
      }

      if (existing) next[next.indexOf(existing)] = machine
      else next.push(machine)
    }

    setMachines(next)

    const scannedModels = new Map<string, { name: string; note: string }[]>()
    for (const device of hosted) {
      const id = mapping.get(device.ip)
      if (id && (device.reachable || cloud)) scannedModels.set(id, device.models ?? [])
    }

    setProviders((current) =>
      current.map((provider) => {
        if (provider.kind !== 'local') return provider
        let models = provider.models
        for (const [machineId, entries] of scannedModels) {
          models = mergeMachineModels(models, machineId, entries)
        }
        return { ...provider, models, updatedAt: at }
      }),
    )

    setDataAt(at)
    setScan({
      at,
      mode: cloud ? 'cloud' : 'local',
      subnet: payload.subnet ?? '',
      localIp: payload.localIp ?? '',
      devices,
    })
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

  async function scanNetwork() {
    setScanning(true)
    setScanError('')
    try {
      const response = await fetch(`${SCAN_ENDPOINT}?refresh=1`, {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      })
      const type = response.headers.get('content-type') ?? ''
      if (!response.ok || !type.includes('application/json')) {
        throw new Error(
          PANEL_MODE === 'cloud'
            ? 'No scanner behind this address. Start the panel service on this VPS to read it.'
            : 'No scanner behind this address. Open the panel on the Pi (port 8094) to scan the network.',
        )
      }
      applyScan(
        (await response.json()) as {
          scannedAt?: string
          mode?: PanelMode
          subnet?: string
          localIp?: string
          devices?: ScanDevice[]
        },
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Scan failed'
      setScanError(
        message.includes('JSON') || message.includes('fetch')
          ? PANEL_MODE === 'cloud'
            ? 'No scanner behind this address. Start the panel service on this VPS to read it.'
            : 'No scanner behind this address. Open the panel on the Pi (port 8094) to scan the network.'
          : message,
      )
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
        mode: PANEL_MODE,
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
