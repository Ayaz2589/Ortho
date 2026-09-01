'use client'

import { useApp } from '@/lib/store'
import { monthYearLong } from '@/lib/format'
import type { SavingsDebtsSummary } from '@/lib/finance/goalProjection'

/**
 * The aggregate verdict above the cards (spec 059 US2) — the one thing no
 * individual card can show: what the whole set costs each month, and how much of
 * the combined total is already behind you.
 *
 * The sub-line degrades honestly rather than padding itself out: with a single
 * projectable item it names only that one (no "last:" clause), and with none it
 * is absent entirely rather than rendering an empty or zeroed line.
 */
export function SavingsDebtsHeader({ summary }: { summary: SavingsDebtsSummary }) {
  const { formatMoney, t, locale } = useApp()

  const fundedPct = summary.targetCents > 0 ? (summary.contributedCents / summary.targetCents) * 100 : 0
  const next = summary.nextToFinish
  const last = summary.lastToFinish
  const showsBoth = next && last && next.goalId !== last.goalId

  return (
    <div className="pb-5">
      <p
        data-testid="sd-aggregate"
        className="m-0 text-[19px] font-medium leading-[1.4] tracking-[-0.3px] text-text"
        style={{ textWrap: 'pretty' }}
      >
        {t(
          "You're putting {0} a month toward {1} — {2} of {3} is behind you.",
          formatMoney(summary.monthlyCommitmentCents),
          summary.activeCount === 1 ? t('1 item') : t('{0} items', summary.activeCount),
          formatMoney(summary.contributedCents),
          formatMoney(summary.targetCents)
        )}
      </p>

      {next ? (
        <p data-testid="sd-aggregate-sub" className="mt-1.5 text-[13px] tabular-nums text-text-3">
          {showsBoth
            ? t(
                'Next to finish: {0}, {1} · last: {2}, {3}',
                next.name,
                monthYearLong(next.finishDate, locale),
                last.name,
                monthYearLong(last.finishDate, locale)
              )
            : t('Next to finish: {0}, {1}', next.name, monthYearLong(next.finishDate, locale))}
        </p>
      ) : null}

      <div
        className="mt-3.5 flex h-2 overflow-hidden rounded-full"
        style={{ background: 'color-mix(in srgb, var(--text) 6%, transparent)' }}
      >
        <span
          data-testid="sd-split-funded"
          className="block h-full"
          style={{ width: `${fundedPct}%`, background: 'var(--positive)' }}
        />
        <span
          className="block h-full"
          style={{
            width: `${100 - fundedPct}%`,
            background: 'color-mix(in srgb, var(--text) 10%, transparent)',
          }}
        />
      </div>
    </div>
  )
}
