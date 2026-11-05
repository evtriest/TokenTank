import type { CSSProperties } from 'react'
import type { Machine, ProviderModel } from '../types'
import { countModelsByMachine } from '../lib/hosts'

export function HostSplit({
  models,
  machines,
}: {
  models: ProviderModel[]
  machines: Machine[]
}) {
  const counts = countModelsByMachine(models, machines)
  const total = machines.reduce((sum, machine) => sum + (counts[machine.id] ?? 0), 0)

  return (
    <span className="host-split">
      {machines.map((machine) =>
        (counts[machine.id] ?? 0) > 0 ? (
          <span
            className="host-pill"
            key={machine.id}
            style={{ '--host-accent': machine.accent } as CSSProperties}
          >
            <i aria-hidden="true" />
            {machine.short}
            <strong>{counts[machine.id]}</strong>
          </span>
        ) : null,
      )}
      {total === 0 && <span className="host-pill host-pill--none">No machine</span>}
    </span>
  )
}
