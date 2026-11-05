import type { Machine, ProviderModel } from '../types'

/** Accents are handed out in order as machines are added. */
export const MACHINE_ACCENTS = [
  '#7dd3fc',
  '#f472b6',
  '#b7f077',
  '#facc15',
  '#a78bfa',
  '#fb923c',
  '#5eead4',
  '#f87171',
]

/**
 * Probed 5 Nov 2026:
 * - Hookipa (Raspberry Pi 5 Model B, 16 GB, Debian 13) — Ollama 0.33.2, 6 models.
 * - Omarchy (omarchyxps, Omarchy 4.0.6) — 2 Ollama models on disk + llama.cpp
 *   serving qwen3-0.6b on 127.0.0.1:8080. The Ollama daemon was stopped.
 */
export function createDefaultMachines(now = Date.now()): Machine[] {
  const readAt = new Date(now).toISOString()

  return [
    {
      id: 'omarchy',
      label: 'Omarchy',
      short: 'Omarchy',
      hostname: 'omarchyxps',
      endpoint: '127.0.0.1:11434 · llama.cpp :8080',
      detail: 'Omarchy 4.0.6 · Ollama 0.40.0 (daemon stopped) · 2 Ollama + 1 llama.cpp',
      accent: MACHINE_ACCENTS[0],
      checkedAt: readAt,
    },
    {
      id: 'pi5',
      label: 'Raspberry Pi 5',
      short: 'Pi 5',
      hostname: 'Hookipa',
      endpoint: '192.168.43.51:11434',
      detail: 'Pi 5 Model B · 16 GB · Debian 13 · Ollama 0.33.2',
      accent: MACHINE_ACCENTS[1],
      checkedAt: readAt,
    },
  ]
}

/**
 * The cloud panel starts with one machine: the server it runs on. The address is
 * the local loopback, so a scan of this server lands on the same machine.
 */
export function createServerMachine(now = Date.now()): Machine {
  return {
    id: 'vps',
    label: 'OVHcloud VPS',
    short: 'VPS',
    hostname: socketHostname(),
    endpoint: '127.0.0.1',
    detail: 'This server · read from the panel',
    accent: MACHINE_ACCENTS[0],
    checkedAt: new Date(now).toISOString(),
    online: false,
  }
}

function socketHostname(): string {
  return typeof window === 'undefined' ? '' : window.location.hostname
}

export function nextMachineAccent(count: number): string {
  return MACHINE_ACCENTS[count % MACHINE_ACCENTS.length]
}

export function machineById(machines: Machine[], id: string | undefined): Machine | undefined {
  if (!id) return undefined
  return machines.find((machine) => machine.id === id)
}

export function countModelsByMachine(
  models: ProviderModel[],
  machines: Machine[],
): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const machine of machines) counts[machine.id] = 0
  for (const model of models) {
    if (model.host && model.host in counts) counts[model.host] += 1
  }
  return counts
}

export function modelsForMachine(models: ProviderModel[], machineId: string): ProviderModel[] {
  return models.filter((model) => model.host === machineId)
}

/** "3 on Omarchy · 6 on Raspberry Pi 5" */
export function describeSplit(
  models: ProviderModel[],
  machines: Machine[],
  verb = 'on',
): string {
  const counts = countModelsByMachine(models, machines)
  return machines
    .map((machine) => `${counts[machine.id] ?? 0} ${verb} ${machine.label}`)
    .join(' · ')
}

export function hostOptions(machines: Machine[]): { value: string; label: string }[] {
  return machines.map((machine) => ({ value: machine.id, label: machine.label }))
}
