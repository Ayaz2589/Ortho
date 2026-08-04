'use client'

import { useApp } from '@/lib/store'
import type { PlanHealth } from '@/lib/planning/planSummary'

/**
 * Plan-health HERO (spec 038 — US2; spec 040). The single "Left to plan" figure for
 * the selected month = income − base monthly budget allowances − planned goal
 * contributions − money already spent OUTSIDE any budget, with the components shown
 * beneath so the number is trustworthy (the unbudgeted-spend term appears only when
 * there is such spend). Rendered card-less on the page background (like the dashboard's
 * NetSummaryHero). An over-committed month is calm ATTENTION (sand `--accent`),
 * NEVER the destructive/red token (constitution I/II). Presentational — the page
 * computes the summary once and passes this slice in.
 */
export function PlanHealthHero({ health }: { health: PlanHealth }) {
  const { formatMoney, t } = useApp()

  const left = health.leftToPlanCents
  const color = left >= 0 ? 'var(--positive)' : 'var(--accent)'

  return (
    <section aria-label={t('Plan health')} className="mb-7">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[13px] uppercase tracking-[0.6px] text-text-2">{t('Left to plan')}</span>
      </div>
      <p
        data-testid="left-to-plan"
        className="mt-1 truncate text-[44px] font-light leading-none tracking-[-1px] tabular-nums sm:text-[56px]"
        style={{ color }}
      >
        {formatMoney(left)}
      </p>
      <p className="mt-2 text-[13px] text-text-3">
        {left >= 0 ? t('Income not yet allocated this month.') : t("You've committed more than this month's income.")}
      </p>

      <dl data-testid="plan-breakdown" className="mt-5 flex flex-wrap items-baseline gap-x-8 gap-y-3">
        <Term label={t('Income')} value={formatMoney(health.incomeCents)} tint="var(--positive)" />
        <Term label={t('Budgeted')} value={formatMoney(health.budgetedCents)} />
        <Term label={t('Goal contributions')} value={formatMoney(health.goalContributionsCents)} />
        {health.unbudgetedSpentCents > 0 ? (
          <Term label={t('Spent (unbudgeted)')} value={formatMoney(health.unbudgetedSpentCents)} />
        ) : null}
      </dl>
    </section>
  )
}

function Term({ label, value, tint }: { label: string; value: string; tint?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-text-2">{label}</dt>
      <dd className="text-[17px] tabular-nums" style={tint ? { color: tint } : { color: 'var(--text)' }}>
        {value}
      </dd>
    </div>
  )
}
