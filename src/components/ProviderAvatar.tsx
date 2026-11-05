import type { CSSProperties } from 'react'
import type { Provider } from '../types'

export function ProviderAvatar({
  provider,
  size = 38,
}: {
  provider: Provider
  size?: number
}) {
  const initials = provider.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase()

  return (
    <div
      className="avatar"
      aria-hidden="true"
      style={
        {
          '--avatar-accent': provider.accent,
          width: size,
          height: size,
          fontSize: Math.max(11, size * 0.33),
        } as CSSProperties
      }
    >
      {initials || '?'}
    </div>
  )
}
