'use client'

import { useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import dynamic from 'next/dynamic'
import { ChevronRight } from 'lucide-react'
import { useApp } from '@/lib/store'
import { useDashboardScopeContext } from '@/lib/widgets/DashboardScopeContext'
import { useMoneyScope, useScopedTransactions } from '@/lib/widgets/MoneyScopeContext'
import { scopeBudgets } from '@/lib/scope/moneyScope'
import { budgetStatusForMonth } from '@/lib/finance/budgets'
import { computeSpendingPace, budgetPaceCents, type PaceCategoryRow, type PaceSummary } from '@/lib/finance/spendingPace'
import { categoryMeta } from '@/lib/categories'
import { shortDate } from '@/lib/format'
import { usePanelCaption, usePanelDetail } from '@/components/widgets/WidgetPanel'
import { PanelEmpty, PanelSectionLabel, PanelRow } from '@/components/widgets/panels/kit'
import type { Transaction, TransactionCategory } from '@/lib/types'
import type { PaceRacePoint } from '@/components/widgets/charts/PaceRaceChart'

// recharts stays behind next/dynamic (ssr:false), mirroring SpendingPaceChart —
// it never enters the dashboard's initial-load chunk (spec 022; no-eager-recharts).
const PaceRaceChart = dynamic(
  () => import('@/components/widgets/charts/PaceRaceChart').then((m) => m.PaceRaceChart),
  { ssr: false, loading: () => null }
)

const TOP_N = 5
const rowStyle: CSSProperties = { transition: 'background-color var(--duration-fast) var(--ease-out)' }

/**
 * Spending-pace detail panel (spec 057 US4 — redesigned). The prior version was
 * a single unbounded scrolling column: a bar-cluster chart, then two lists that
 * named largely the same categories twice, both growing without bound as history
 * accumulates. This replaces it with three fixed-height zones — verdict → one
 * honest chart → one bounded list with drill-in — so the panel's height stays
 * constant whether the household has one category or forty.
 *
 * The engine (`lib/finance/spendingPace.ts`) is period-relative rather than a
 * fixed trailing-30/60-day window: "period" is the active dashboard scope's own
 * interval (a calendar month under the default range), "last period" the
 * immediately preceding window of equal length — so a custom range gets an
 * honest "last period" comparison instead of a hardcoded "last month".
 *
 * Honours BOTH scope axes exactly as the card does. An increase never reads
 * more alarmingly than a decrease (FR-021): a faster pace / an increase stays
 * neutral `text-2`, a slower pace / a decrease keeps the card's `positive`
 * sage tint. Neither is ever red — nor is an over-budget pace.
 */
export function SpendingPacePanel() {
  const { transactions: allTransactions, budgets, formatMoney, t, locale, resolveUser } = useApp()
  const scope = useMoneyScope()
  const transactions = useScopedTransactions(allTransactions)
  const { interval, now, periodLabel, referenceDate } = useDashboardScopeContext()
  const { push } = usePanelDetail()

  const subject = scope.kind === 'person' ? resolveUser(scope.personId).name : t('Household')
  usePanelCaption({ subject, period: t(periodLabel) })

  const summary = useMemo(() => computeSpendingPace(transactions, interval, now), [transactions, interval, now])

  const scopedBudgets = useMemo(
    () => scopeBudgets(budgets, scope).filter((b) => b.monthly_limit_cents > 0),
    [budgets, scope]
  )
  const budgetCents = useMemo(() => {
    if (scopedBudgets.length === 0) return null
    // budgetStatusForMonth is by construction ONE month's effective limit —
    // prorating it across a 3/6/12-month range told an exactly-on-budget
    // household it was months of spend above plan (review 2026-08-24, B3).
    // The budget verdict applies only when the scope IS a single calendar
    // month; reading months at noon of each bound is frame-proof for both the
    // local (range) and UTC (selected month) interval frames.
    const HALF_DAY_MS = 12 * 60 * 60 * 1000
    const startAnchor = new Date(interval.start.getTime() + HALF_DAY_MS)
    const endAnchor = new Date(interval.end.getTime() - HALF_DAY_MS)
    const singleMonth =
      startAnchor.getFullYear() === endAnchor.getFullYear() && startAnchor.getMonth() === endAnchor.getMonth()
    if (!singleMonth) return null
    return scopedBudgets.reduce(
      (sum, b) => sum + budgetStatusForMonth(b, transactions, referenceDate).effectiveLimitCents,
      0
    )
  }, [scopedBudgets, transactions, referenceDate, interval])

  if (summary.mtdCents <= 0) {
    return <PanelEmpty>{t('No expenses in this period yet.')}</PanelEmpty>
  }

  const topRows = summary.categoryRows.slice(0, TOP_N)
  const moreCount = summary.categoryRows.length - topRows.length
  const largestCents = summary.categoryRows[0]?.cents ?? 1

  const openAllCategories = () => {
    push(
      t('All categories'),
      <AllCategoriesDetail
        categoryRows={summary.categoryRows}
        transactions={transactions}
        interval={interval}
        periodLabel={t(periodLabel)}
      />
    )
  }

  return (
    <div className="flex flex-col gap-[22px] pb-[22px] pl-[22px] pr-[22px] pt-[18px]">
      <VerdictZone summary={summary} budgetCents={budgetCents} interval={interval} />
      <PaceRaceZone summary={summary} budgetCents={budgetCents} interval={interval} now={now} />
      <div className="flex flex-col gap-1">
        <div className="mb-1 flex items-baseline justify-between">
          <PanelSectionLabel>{t("Where it's going")}</PanelSectionLabel>
          <PanelSectionLabel>{t('Δ vs last period')}</PanelSectionLabel>
        </div>
        {topRows.map((row) => (
          <CategoryRow key={row.category} row={row} largestCents={largestCents} />
        ))}
        {moreCount > 0 ? (
          <button
            type="button"
            onClick={openAllCategories}
            className="mt-1.5 self-end text-[13px] text-accent"
          >
            {t('+ {0} more →', moreCount)}
          </button>
        ) : null}
      </div>
    </div>
  )
}

function VerdictZone({
  summary,
  budgetCents,
  interval,
}: {
  summary: PaceSummary
  budgetCents: number | null
  interval: { start: Date; end: Date }
}) {
  const { formatMoney, t, locale } = useApp()
  const perDay = formatMoney(Math.round(summary.avgPerDayCents))
  const lastDay = new Date(interval.end.getTime() - 24 * 60 * 60 * 1000)
  const endLabel = shortDate(lastDay, locale)

  let verdict: string
  let projection: string
  let deltaColor = 'var(--text-2)'
  let markerValueCents: number | null = null
  let markerCaption: string | null = null

  if (budgetCents != null) {
    const paceToday = budgetPaceCents(budgetCents, summary.daysElapsed, summary.daysInPeriod)
    const diff = summary.mtdCents - paceToday
    if (diff > 0) {
      deltaColor = 'var(--text-2)'
      verdict = t('Spending {0}/day — {1} above your plan for today.', perDay, formatMoney(diff))
    } else if (diff < 0) {
      deltaColor = 'var(--positive)'
      verdict = t('Spending {0}/day — {1} under your plan for today.', perDay, formatMoney(-diff))
    } else {
      verdict = t('Spending {0}/day — right on your plan for today.', perDay)
    }
    projection = t(
      'On pace for ≈ {0} against a {1} budget',
      formatMoney(summary.projectedCents),
      formatMoney(budgetCents)
    )
    markerValueCents = paceToday
    markerCaption = t('budget pace by today · {0}', formatMoney(paceToday))
  } else if (summary.hasPriorPeriod && summary.deltaPct != null) {
    const pct = Math.round(Math.abs(summary.deltaPct) * 100)
    if (summary.deltaPct > 0) {
      deltaColor = 'var(--text-2)'
      verdict = t('Spending {0}/day — about {1}% faster than last period.', perDay, pct)
    } else if (summary.deltaPct < 0) {
      deltaColor = 'var(--positive)'
      verdict = t('Spending {0}/day — about {1}% slower than last period.', perDay, pct)
    } else {
      verdict = t('Spending {0}/day — about the same pace as last period.', perDay)
    }
    projection = t(
      'On pace for ≈ {0} by {1} · last period {2}',
      formatMoney(summary.projectedCents),
      endLabel,
      formatMoney(summary.priorTotalCents)
    )
    markerValueCents = summary.priorRateAtTodayCents
    markerCaption = t('even pace by today · {0}', formatMoney(summary.priorRateAtTodayCents))
  } else {
    verdict = t('Spending {0}/day.', perDay)
    projection = t('On pace for ≈ {0} by {1}', formatMoney(summary.projectedCents), endLabel)
  }

  const denomCents = budgetCents ?? summary.projectedCents
  const fillPct = denomCents > 0 ? Math.min(1, summary.mtdCents / denomCents) * 100 : 0
  const markerPct =
    markerValueCents != null && denomCents > 0 ? Math.min(1, markerValueCents / denomCents) * 100 : null

  return (
    <div>
      <p
        className="m-0 text-[20px] font-medium leading-[1.35] text-text"
        style={{ letterSpacing: '-0.3px' }}
      >
        <span className="tabular-nums" style={{ color: deltaColor }}>
          {verdict}
        </span>
      </p>
      <p className="mt-1.5 text-[13px] tabular-nums text-text-2">{projection}</p>

      <div className="mt-[18px]">
        <div className="mb-[7px] flex items-baseline justify-between">
          <span className="text-xs text-text-3">{t('Period so far')}</span>
          <span className="text-[15px] font-semibold tabular-nums text-text" style={{ letterSpacing: '-0.2px' }}>
            {formatMoney(summary.mtdCents)}
          </span>
        </div>
        <div className="relative h-2 rounded-full" style={{ background: 'var(--chip-bg)' }}>
          <div
            className="absolute inset-y-0 left-0 rounded-full"
            style={{ width: `${fillPct}%`, background: 'var(--positive)', opacity: 0.85 }}
          />
          {markerPct != null ? (
            <div
              className="absolute -top-1 -bottom-1 w-[1.5px]"
              style={{ left: `${markerPct}%`, background: 'color-mix(in srgb, var(--text) 45%, transparent)' }}
            />
          ) : null}
        </div>
        {markerPct != null && markerCaption != null ? (
          <div className="relative h-4">
            <div
              className="absolute top-3 whitespace-nowrap text-[11px] tabular-nums text-text-3"
              style={{ left: `${markerPct}%`, transform: 'translateX(-50%)' }}
            >
              {markerCaption}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function PaceRaceZone({
  summary,
  budgetCents,
  interval,
  now,
}: {
  summary: PaceSummary
  budgetCents: number | null
  interval: { start: Date; end: Date }
  now: Date
}) {
  const { t, locale } = useApp()
  const startLabel = shortDate(interval.start, locale)
  const lastDay = new Date(interval.end.getTime() - 24 * 60 * 60 * 1000)
  const endLabel = shortDate(lastDay, locale)

  const showReference = budgetCents != null || summary.hasPriorPeriod

  const data = useMemo<PaceRacePoint[]>(() => {
    const points: PaceRacePoint[] = []
    for (let i = 0; i < summary.daysInPeriod; i++) {
      const current = i < summary.cumulative.length ? summary.cumulative[i] / 100 : undefined
      let reference: number | undefined
      if (budgetCents != null) {
        reference = (budgetPaceCents(budgetCents, i + 1, summary.daysInPeriod)) / 100
      } else if (summary.hasPriorPeriod) {
        reference = summary.priorCumulative[i] / 100
      }
      points.push({ i, current, reference })
    }
    return points
  }, [summary, budgetCents])

  return (
    <div>
      <PanelSectionLabel>{t('Pace race')}</PanelSectionLabel>
      <div className="mt-2.5 h-[132px]">
        <PaceRaceChart data={data} />
      </div>
      <div className="relative mt-0.5 flex justify-between text-[11px] tabular-nums text-text-3">
        <span>{startLabel}</span>
        {/* 'today' sits at today's ACTUAL position on the axis, and only when
            now falls inside the period — a fully past month has no 'today'
            (review 2026-08-24). */}
        {now.getTime() >= interval.start.getTime() && now.getTime() < interval.end.getTime() ? (
          <span
            className="absolute whitespace-nowrap"
            style={{
              left: `${((summary.daysElapsed - 0.5) / summary.daysInPeriod) * 100}%`,
              transform: 'translateX(-50%)',
            }}
          >
            {t('today')}
          </span>
        ) : null}
        <span>{endLabel}</span>
      </div>
      <div className="mt-2 flex gap-4 text-[11.5px] text-text-3">
        <Legend color="var(--positive)">{t('This period, cumulative')}</Legend>
        {showReference ? (
          <Legend color="color-mix(in srgb, var(--text) 38%, transparent)">
            {budgetCents != null ? t('Budget pace') : t('Last period')}
          </Legend>
        ) : null}
      </div>
    </div>
  )
}

function Legend({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span className="flex items-center gap-1.5" style={{ color }}>
      <span style={{ display: 'inline-block', width: 14, height: 0, borderTop: `1.5px solid currentColor` }} />
      {children}
    </span>
  )
}

function deltaLabel(deltaCents: number, formatMoney: (c: number, opts?: { leadingPlus?: boolean }) => string) {
  if (deltaCents === 0) return { text: '—', className: 'text-text-3' }
  if (deltaCents > 0) return { text: formatMoney(deltaCents, { leadingPlus: true }), className: 'text-text-2' }
  return { text: formatMoney(deltaCents), className: 'text-positive' }
}

function CategoryRow({ row, largestCents }: { row: PaceCategoryRow; largestCents: number }) {
  const { formatMoney, t } = useApp()
  const delta = deltaLabel(row.deltaCents, formatMoney)
  const widthPct = largestCents > 0 ? Math.max(2, (row.cents / largestCents) * 100) : 0
  return (
    <div className="grid h-11 grid-cols-[1fr_auto_78px] items-center gap-3 border-b-[0.5px] border-hairline last:border-b-0">
      <div className="flex flex-col gap-[5px]">
        <span className="text-[14.5px] text-text" style={{ letterSpacing: '-0.1px' }}>
          {t(categoryMeta(row.category).label)}
        </span>
        <div className="h-[3px] rounded-full" style={{ width: `${widthPct}%`, background: 'var(--positive)', opacity: 0.5 }} />
      </div>
      <span className="text-[14.5px] font-semibold tabular-nums text-text" style={{ letterSpacing: '-0.2px' }}>
        {formatMoney(row.cents)}
      </span>
      <span className={`text-right text-[13px] tabular-nums ${delta.className}`}>{delta.text}</span>
    </div>
  )
}

function AllCategoriesDetail({
  categoryRows,
  transactions,
  interval,
  periodLabel,
}: {
  categoryRows: PaceCategoryRow[]
  transactions: Transaction[]
  interval: { start: Date; end: Date }
  periodLabel: string
}) {
  const { t, formatMoney } = useApp()
  const [openCategory, setOpenCategory] = useState<TransactionCategory | null>(null)

  if (openCategory != null) {
    return (
      <CategoryTransactionsDetail
        category={openCategory}
        transactions={transactions}
        interval={interval}
        onBack={() => setOpenCategory(null)}
      />
    )
  }

  return (
    <div className="flex flex-col p-2 pt-0">
      <div className="mb-3 mt-2.5 px-3 text-xs text-text-3">
        {t('{0} categories · {1}', categoryRows.length, periodLabel)}
      </div>
      {categoryRows.map((row) => {
        const delta = deltaLabel(row.deltaCents, formatMoney)
        return (
          <button
            key={row.category}
            type="button"
            style={rowStyle}
            onClick={() => setOpenCategory(row.category)}
            className="grid h-10 grid-cols-[1fr_auto_78px] items-center gap-3 border-b-[0.5px] border-hairline px-3 text-left text-sm last:border-b-0 hover:bg-[var(--surface-2)]"
          >
            <span className="text-text">{t(categoryMeta(row.category).label)}</span>
            <span className="tabular-nums text-text">{formatMoney(row.cents)}</span>
            <span className={`flex items-center justify-end gap-1 tabular-nums ${delta.className}`}>
              {delta.text}
              <ChevronRight size={12} style={{ color: 'var(--text-3)' }} />
            </span>
          </button>
        )
      })}
    </div>
  )
}

function CategoryTransactionsDetail({
  category,
  transactions,
  interval,
  onBack,
}: {
  category: TransactionCategory
  transactions: Transaction[]
  interval: { start: Date; end: Date }
  onBack: () => void
}) {
  const { formatMoney, t } = useApp()
  const startMs = interval.start.getTime()
  const endMs = interval.end.getTime()
  const composing = transactions
    .filter((tx) => tx.kind === 'expense' && tx.category === category)
    .filter((tx) => {
      const ms = new Date(tx.date).getTime()
      return ms >= startMs && ms < endMs
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  return (
    <div className="flex flex-col gap-3 p-5">
      <button type="button" onClick={onBack} className="self-start text-[13px] text-text-2">
        {t('‹ Back')}
      </button>
      <PanelSectionLabel>{t(categoryMeta(category).label)}</PanelSectionLabel>
      {composing.length === 0 ? (
        <PanelEmpty>{t('No expenses in this period yet.')}</PanelEmpty>
      ) : (
        <div className="flex flex-col gap-1.5">
          {composing.map((tx) => (
            <PanelRow key={tx.id} label={tx.merchant} value={formatMoney(tx.amount_cents)} />
          ))}
        </div>
      )}
    </div>
  )
}
