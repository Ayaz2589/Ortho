'use client'

import { useApp } from '@/lib/store'

/**
 * A kept-vs-spent split of a window's income, as a two-segment bar plus a
 * dot key underneath (spec 057 US5 redesign — savings-trends panel, D10
 * append). The "spent" segment is a neutral mix of `--text`, never a warning
 * colour — a shortfall reads through the verdict sentence and the sign on
 * the amounts, not through the bar (FR-021).
 */
export function IncomeSplitBar({ keptCents, spentCents }: { keptCents: number; spentCents: number }) {
  const { formatMoney, t } = useApp()
  const totalCents = keptCents + spentCents
  const keptPct = totalCents > 0 ? Math.max(0, Math.min(100, (keptCents / totalCents) * 100)) : 0
  const spentPct = 100 - keptPct
  const spentColor = 'color-mix(in srgb, var(--text) 13%, transparent)'

  return (
    <div>
      <div className="flex h-2.5 overflow-hidden rounded-full" style={{ background: 'var(--chip-bg)' }}>
        <div style={{ width: `${keptPct}%`, background: 'var(--positive)' }} />
        <div style={{ width: `${spentPct}%`, background: spentColor }} />
      </div>
      <div className="mt-2 flex items-center justify-between text-xs tabular-nums text-text-2">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-[7px] w-[7px] rounded-full" style={{ background: 'var(--positive)' }} />
          {t('Kept {0}', formatMoney(keptCents))}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-[7px] w-[7px] rounded-full" style={{ background: spentColor }} />
          {t('Spent {0}', formatMoney(spentCents))}
        </span>
      </div>
    </div>
  )
}
