import type { Verdict } from '../types'

const VERDICTS: Record<Verdict, { label: string; hint: string }> = {
  works: { label: 'Works', hint: 'Keeps a spot in rotation' },
  mixed: { label: 'Mixed', hint: 'Works, with catches' },
  failed: { label: 'Failed', hint: 'Tried, didn’t work out' },
  untried: { label: 'Not tried', hint: 'Still on the bench' },
}

export const VERDICT_OPTIONS = (Object.keys(VERDICTS) as Verdict[]).map((value) => ({
  value,
  ...VERDICTS[value],
}))

export function VerdictBadge({ verdict }: { verdict: Verdict }) {
  const meta = VERDICTS[verdict] ?? VERDICTS.untried
  return (
    <span className={`verdict verdict--${verdict}`} title={meta.hint}>
      <i aria-hidden="true" />
      {meta.label}
    </span>
  )
}
