'use client'

import { useApp } from '@/lib/store'
import { monthYearLong, monthYear } from '@/lib/format'
import type { GoalProjection, WhatIfScenario } from '@/lib/finance/goalProjection'
import type { Goal } from '@/lib/types'
import { DetailBlock, BlockValueStrong } from './DetailBlock'

/**
 * Block 1 — projected finish (spec 059 US4).
 *
 * The old page stated a static number and stopped. This leads with the date and
 * then shows the levers that move it: a real what-if table, derived rather than
 * configured.
 *
 * The table offers levers and endorses none of them (FR-035). A sooner date is
 * marked as an improvement; a later one is stated in the same muted shade as any
 * neutral value, because a later date must never read more alarmingly than an
 * earlier one (FR-034).
 */
export function ProjectedFinishBlock({
  goal,
  projection,
  scenarios,
}: {
  goal: Goal
  projection: GoalProjection
  scenarios: WhatIfScenario[]
  /** Accepted for symmetry with the other blocks; the dates are already derived. */
  now?: Date
}) {
  const { formatMoney, t, locale } = useApp()

  // The engine refused to project, so there is nothing honest to put here. The
  // page renders its own "not enough history" line above.
  if (!projection.available || !projection.finishDate || projection.paymentsToGo === null) return null

  const isDebt = goal.kind === 'debt_payoff'

  return (
    <DetailBlock
      label={t('Projected finish')}
      testId="projected-finish"
      value={
        <>
          <BlockValueStrong>{monthYearLong(projection.finishDate, locale)}</BlockValueStrong>
          {' · '}
          {projection.paymentsToGo === 1 ? t('1 month') : t('{0} months', projection.paymentsToGo)}
        </>
      }
    >
      <div className="flex flex-col">
        {scenarios.map((s, i) => (
          <div
            key={`${s.kind}-${i}`}
            className="grid h-[42px] items-center gap-3 border-b text-[13.5px] tabular-nums text-text-2 last:border-b-0"
            style={{ gridTemplateColumns: '1fr 108px 116px', borderColor: 'var(--hairline)' }}
          >
            <span data-testid="whatif-scenario" className="min-w-0 truncate">
              {scenarioLabel(s, { t, formatMoney, isDebt, basis: projection.basis })}
            </span>
            <span className="shrink-0 text-right font-semibold text-text">
              {monthYear(s.finishDate, locale)}
            </span>
            <span
              data-testid="whatif-delta"
              className="shrink-0 text-right"
              style={{ color: s.deltaMonths < 0 ? 'var(--positive)' : 'var(--text-3)' }}
            >
              {deltaLabel(s, t)}
            </span>
          </div>
        ))}
      </div>
    </DetailBlock>
  )
}

function scenarioLabel(
  s: WhatIfScenario,
  {
    t,
    formatMoney,
    isDebt,
    basis,
  }: {
    t: (k: string, ...a: Array<string | number>) => string
    formatMoney: (c: number) => string
    isDebt: boolean
    basis: GoalProjection['basis']
  }
): string {
  const amount = formatMoney(s.monthlyCents)
  switch (s.kind) {
    case 'current':
      // When the pace came from the recent average, SAY so — the projection's
      // basis is stated aloud rather than implied, and the planned amount then
      // appears below as an improvement rather than as the baseline.
      if (basis === 'recent_average') return t('At your recent average, {0}/mo', amount)
      return isDebt ? t('Keep paying {0}/mo', amount) : t('Keep saving {0}/mo', amount)
    case 'planned':
      return t('At the planned {0}/mo', amount)
    case 'increase':
      return isDebt ? t('Pay {0}/mo', amount) : t('Save {0}/mo', amount)
    case 'skip':
      return t('Skip one month')
  }
}

function deltaLabel(s: WhatIfScenario, t: (k: string, ...a: Array<string | number>) => string): string {
  if (s.deltaMonths === 0) return s.kind === 'current' ? t('on plan') : t('same')
  const n = Math.abs(s.deltaMonths)
  if (s.deltaMonths < 0) return n === 1 ? t('1 month sooner') : t('{0} months sooner', n)
  return n === 1 ? t('1 month later') : t('{0} months later', n)
}
