'use client'

import { useMemo, type ReactNode } from 'react'
import Link from 'next/link'
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Pencil } from 'lucide-react'
import { useApp } from '@/lib/store'
import { goalProgress } from '@/lib/finance/goals'
import { goalProjection } from '@/lib/finance/goalProjection'
import { monthYear, monthYearLong } from '@/lib/format'
import { ordinalDay } from '@/lib/ordinalDay'
import type { Goal, GoalContribution } from '@/lib/types'

/**
 * One savings target or debt (spec 059 US1). Replaces `GoalCard`, whose tallest
 * element was a ledger of identical rows — the least information on the card
 * taking the most room — and which rendered a debt and a savings target
 * identically despite their running in opposite directions.
 *
 * Three rules this component exists to hold:
 *
 * 1. **The headline is chosen by kind.** A debt is measured by what REMAINS, a
 *    savings target by what has ACCUMULATED. Same for the verbs (clear/fund,
 *    payments/deposits, paid/funded).
 * 2. **Direction of travel is the type signal, not colour.** Savings grows from
 *    the left; debt is anchored right and depletes toward zero with the paid
 *    share behind it. One hue (`--positive`) at two opacities — introducing a
 *    second hue to separate the kinds is a contract violation, not a preference.
 * 3. **The collapsed card is a fixed height.** The cadence line states in one
 *    sentence what seven identical rows used to repeat; the ledger lives behind
 *    the disclosure (`ContributionLedger`, rendered by the section that owns
 *    which card is open).
 *
 * Every date comes from `goalProjection`, which returns an explicit refusal when
 * it cannot honestly project. This component NEVER computes a fallback date —
 * that is the one thing that would let an invented figure reach the screen.
 */
export function SavingsDebtCard({
  goal,
  contributions,
  now,
  href,
  onAddContribution,
  onEdit,
  expanded,
  onToggleExpanded,
  ledger,
}: {
  goal: Goal
  contributions: GoalContribution[]
  now: Date
  /** When set, the name links to the item's detail page. */
  href?: string
  onAddContribution?: (goal: Goal) => void
  onEdit?: (goal: Goal) => void
  /** Controlled by the section, so at most one card is open at a time. */
  expanded?: boolean
  onToggleExpanded?: (goal: Goal) => void
  /** The expanded contribution list. Rendered only when `expanded`. */
  ledger?: ReactNode
}) {
  const { formatMoney, t, locale } = useApp()

  const isDebt = goal.kind === 'debt_payoff'
  const progress = useMemo(() => goalProgress(goal.target_cents, contributions), [goal.target_cents, contributions])
  const projection = useMemo(() => goalProjection(goal, contributions, now), [goal, contributions, now])
  const pct = Math.round(progress.fraction * 100)
  const remainingPct = Math.max(0, 100 - pct)

  const Icon = isDebt ? ArrowDown : ArrowUp
  const cadence = projection.cadence

  const name = (
    <span data-testid="sd-name" className="min-w-0 truncate text-[17.5px] tracking-[-0.3px] text-text">
      {goal.name}
    </span>
  )

  return (
    <div data-testid="savings-debt-card" className="flex gap-3.5 py-4">
      {/* Filled well for a debt, outlined ring for savings — the kind is legible
          before a single word is read. */}
      <span
        aria-hidden
        className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
        style={
          isDebt
            ? { background: 'var(--surface-2)', color: 'var(--text-2)' }
            : {
                background: 'transparent',
                border: '0.5px solid color-mix(in srgb, var(--positive) 35%, transparent)',
                color: 'var(--positive)',
              }
        }
      >
        <Icon size={15} />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          {href ? (
            <Link
              href={href}
              className="ortho-interactive flex min-w-0 items-center gap-1 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            >
              {name}
              <ChevronRight size={15} className="shrink-0 text-text-3" aria-hidden />
            </Link>
          ) : (
            name
          )}
          <span
            data-testid="sd-headline"
            className="shrink-0 whitespace-nowrap text-[19px] font-semibold tracking-[-0.45px] tabular-nums text-text"
          >
            {isDebt
              ? t('{0} left', formatMoney(progress.remaining_cents))
              : t('{0} saved', formatMoney(progress.saved_cents))}
          </span>
          {onEdit ? (
            <button
              type="button"
              onClick={() => onEdit(goal)}
              aria-label={t('Edit {0}', goal.name)}
              className="ortho-interactive -my-1.5 shrink-0 rounded-full p-1.5 text-text-3"
            >
              <Pencil size={14} />
            </button>
          ) : null}
        </div>

        {/* The cadence line — what replaces seven identical ledger rows. Stated as
            observed behaviour, never as a commitment the app will execute. */}
        <div className="mb-3 mt-[5px] flex items-baseline justify-between gap-3 text-[12.5px] tabular-nums text-text-3">
          {cadence ? (
            <span data-testid="sd-cadence" className="min-w-0 truncate">
              {t(
                '{0} · {1}/mo since {2}',
                isDebt ? t('Debt') : t('Savings'),
                formatMoney(cadence.amountCents),
                monthYear(monthStart(cadence.firstMonthKey), locale)
              )}
            </span>
          ) : (
            <span className="min-w-0 truncate">{isDebt ? t('Debt') : t('Savings')}</span>
          )}
          <span data-testid="sd-percent" className="shrink-0">
            {isDebt ? t('{0}% paid', pct) : t('{0}% funded', pct)}
          </span>
        </div>

        <Track isDebt={isDebt} pct={pct} remainingPct={remainingPct} label={t('{0}% complete', pct)} />

        <div
          data-testid="sd-track-caption"
          className="mt-2 flex justify-between gap-3 text-[12.5px] tabular-nums text-text-3"
        >
          <span className="min-w-0 truncate">
            {isDebt
              ? t('{0} paid', formatMoney(progress.saved_cents))
              : t('{0} to go', formatMoney(progress.remaining_cents))}
          </span>
          <span className="shrink-0">{formatMoney(goal.target_cents)}</span>
        </div>

        <p data-testid="sd-eta" className="mt-3 text-[14px] tabular-nums text-text-2">
          <EtaText goal={goal} projection={projection} />
        </p>

        {(cadence && onToggleExpanded) || onAddContribution ? (
          <div className="mt-2.5 flex items-baseline justify-between gap-3 text-[12.5px] tabular-nums">
            {cadence && onToggleExpanded ? (
              <button
                type="button"
                data-testid="sd-disclosure"
                aria-expanded={expanded ?? false}
                onClick={() => onToggleExpanded(goal)}
                className="ortho-interactive -my-1 inline-flex min-w-0 items-center gap-1.5 rounded py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                style={{ color: expanded ? 'var(--text)' : 'var(--text-2)' }}
              >
                <span className="truncate">
                  {cadence.contributionCount === 1
                    ? t('1 contribution · every {0}', ordinalDay(cadence.dayOfMonth, locale))
                    : t(
                        '{0} contributions · every {1}',
                        cadence.contributionCount,
                        ordinalDay(cadence.dayOfMonth, locale)
                      )}
                </span>
                <ChevronDown
                  size={13}
                  aria-hidden
                  className="shrink-0 text-text-3 transition-transform"
                  style={{ transform: expanded ? 'rotate(180deg)' : undefined }}
                />
              </button>
            ) : (
              <span />
            )}
            {onAddContribution ? (
              <button
                type="button"
                onClick={() => onAddContribution(goal)}
                className="ortho-interactive -my-1 shrink-0 rounded py-1 text-[13px] text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              >
                {t('Add contribution')}
              </button>
            ) : null}
          </div>
        ) : null}

        {/* Local and additive: the card keeps its shape and the list unfolds
            beneath the footer. `0fr → 1fr` animates to CONTENT height without
            measuring, which matters when the row count varies from 1 to 12. */}
        <div
          className="grid transition-[grid-template-rows] motion-reduce:transition-none"
          style={{
            gridTemplateRows: expanded ? '1fr' : '0fr',
            transitionDuration: 'var(--duration-fast)',
            transitionTimingFunction: 'var(--ease-out)',
          }}
        >
          <div className="overflow-hidden">{expanded ? ledger : null}</div>
        </div>
      </div>
    </div>
  )
}

/** The track. Savings fills from the left and grows; debt is anchored right and
 *  depletes, with the paid share behind it. Same hue, opposite direction. */
function Track({
  isDebt,
  pct,
  remainingPct,
  label,
}: {
  isDebt: boolean
  pct: number
  remainingPct: number
  label: string
}) {
  return (
    <div
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuetext={label}
      className="relative h-1.5 w-full overflow-hidden rounded-full"
      style={{ background: 'color-mix(in srgb, var(--text) 6%, transparent)' }}
    >
      {isDebt ? (
        <>
          <span
            data-testid="sd-fill-paid"
            className="absolute bottom-0 top-0 rounded-full"
            style={{
              left: 0,
              width: `${pct}%`,
              background: 'color-mix(in srgb, var(--positive) 22%, transparent)',
            }}
          />
          <span
            data-testid="sd-fill-remaining"
            className="absolute bottom-0 top-0 rounded-full"
            style={{ right: 0, width: `${remainingPct}%`, background: 'var(--positive)' }}
          />
        </>
      ) : (
        <span
          data-testid="sd-fill-saved"
          className="absolute bottom-0 top-0 rounded-full"
          style={{ left: 0, width: `${pct}%`, background: 'var(--positive)' }}
        />
      )}
    </div>
  )
}

/** The one line that answers "when is this done?" — or says honestly that it
 *  cannot yet. Never invents a date when the projection refused. */
function EtaText({
  goal,
  projection,
}: {
  goal: Goal
  projection: ReturnType<typeof goalProjection>
}) {
  const { t, locale } = useApp()
  const isDebt = goal.kind === 'debt_payoff'

  if (!projection.available || !projection.finishDate || projection.paymentsToGo === null) {
    if (projection.unavailableReason === 'reached') return <>{t('Reached')}</>
    return <>{t('Not enough history to project yet')}</>
  }

  const when = <strong className="font-semibold text-text">{monthYearLong(projection.finishDate, locale)}</strong>

  return isDebt ? (
    <>
      {t('Clear by')} {when} —{' '}
      {projection.paymentsToGo === 1 ? t('1 more payment') : t('{0} more payments', projection.paymentsToGo)}
    </>
  ) : (
    <>
      {t('Funded by')} {when} —{' '}
      {projection.paymentsToGo === 1 ? t('1 more deposit') : t('{0} more deposits', projection.paymentsToGo)}
    </>
  )
}

/** Local Date for the first of a `YYYY-MM` key. */
function monthStart(monthKey: string): Date {
  const [y, m] = monthKey.split('-').map(Number)
  return new Date(y, m - 1, 1)
}
