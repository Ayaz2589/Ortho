'use client'

import { useMemo } from 'react'
import dynamic from 'next/dynamic'
import { useApp } from '@/lib/store'
import { useDashboardScopeContext } from '@/lib/widgets/DashboardScopeContext'
import { useMoneyScope, useScopedTransactions } from '@/lib/widgets/MoneyScopeContext'
import { computeSavingsTrends, shiftMonthKey, type SavingsMonthPoint, type SavingsTrendsSummary } from '@/lib/finance/savingsTrends'
import { monthBoundsInterval } from '@/lib/useDashboardRange'
import { usePanelCaption, usePanelDetail } from '@/components/widgets/WidgetPanel'
import { PanelEmpty, PanelSectionLabel, PanelRow, IncomeSplitBar, ReconciledMonthCard } from '@/components/widgets/panels/kit'
import type { RateByMonthPoint } from '@/components/widgets/charts/RateByMonthChart'
import type { Transaction } from '@/lib/types'
import type { Translate } from '@/lib/i18n'

// recharts stays behind next/dynamic (ssr:false) — reached only through this
// call, never through the kit barrel, so it never enters the dashboard's
// initial-load chunk (spec 022; test/bundle/no-eager-recharts).
const RateByMonthChart = dynamic(
  () => import('@/components/widgets/charts/RateByMonthChart').then((m) => m.RateByMonthChart),
  { ssr: false, loading: () => null }
)

const CHART_COMPACT_THRESHOLD = 8
const TRAILING_MONTHS = 6

/** Percent with a Unicode minus for shortfalls; "—" when the rate is
 *  undefined (no income). Mirrors the card's own `formatRate` — not exported,
 *  so the shape is duplicated rather than shared across a file this panel
 *  must not touch. */
function formatRate(rate: number | null): string {
  if (rate === null) return '—'
  const pct = Math.round(rate * 100)
  return `${pct < 0 ? '−' : ''}${Math.abs(pct)}%`
}

function pctMagnitude(rate: number): number {
  return Math.abs(Math.round(rate * 100))
}

/**
 * Savings-trends detail panel (spec 057 US5 — redesigned). The prior version
 * was an unbounded scrolling stack — one four-line block per month, growing
 * without bound as history accumulates, with the card's own bar chart
 * dropped entirely. This replaces it with three fixed-height zones — a
 * window verdict + kept/spent split, the card's chart extended (not
 * abandoned) with best/leanest emphasis and a window-average reference, and
 * exactly three bounded reconciled cards with drill-in — so the panel's
 * height stays constant whether the window is 3 months or 24.
 *
 * Honours BOTH scope axes exactly as the card does. A shortfall reads
 * through sign and position only, never colour (FR-021); a negative rate
 * uses `--text`, never a warning colour — the one variation from the
 * positive case.
 */
export function SavingsTrendsPanel() {
  const { transactions: allTransactions, t, locale, resolveUser } = useApp()
  const scope = useMoneyScope()
  const transactions = useScopedTransactions(allTransactions)
  const { interval, periodLabel, isSpecificMonth, selectedMonth, availableMonths } = useDashboardScopeContext()
  const { push, pop } = usePanelDetail()

  const subject = scope.kind === 'person' ? resolveUser(scope.personId).name : t('Household')
  usePanelCaption({ subject, period: t(periodLabel) })

  const summary = useMemo(() => computeSavingsTrends(transactions, interval), [transactions, interval])
  const hasActivity = summary.windowIncomeCents > 0 || summary.windowExpenseCents > 0

  // Single-month view only: a trailing window ending at the selected month,
  // bounded by real recorded history (`availableMonths`), never fabricated.
  const context = useMemo(() => {
    if (!isSpecificMonth || !selectedMonth) return null
    const candidates = Array.from({ length: TRAILING_MONTHS }, (_, i) => shiftMonthKey(selectedMonth, -(TRAILING_MONTHS - 1 - i)))
    const present = candidates.filter((k) => availableMonths?.includes(k))
    if (present.length < 2) return null
    const earliest = candidates.find((k) => availableMonths?.includes(k))!
    const span = { start: monthBoundsInterval(earliest).start, end: monthBoundsInterval(selectedMonth).end }
    const contextSummary = computeSavingsTrends(transactions, span)
    const prevKey = shiftMonthKey(selectedMonth, -1)
    const prevPresent = availableMonths?.includes(prevKey) ?? false
    return { summary: contextSummary, prevKey, prevPresent }
  }, [isSpecificMonth, selectedMonth, availableMonths, transactions])

  if (!hasActivity) return <PanelEmpty>{t('Not enough data yet.')}</PanelEmpty>

  if (isSpecificMonth && selectedMonth) {
    return <SingleMonthBody summary={summary} context={context} selectedMonth={selectedMonth} />
  }

  const openEveryMonth = () => {
    push(
      t('Every month'),
      <EveryMonthDetail
        summary={summary}
        subject={subject}
        onOpenMonth={(yyyymm) => {
          const label = monthName(yyyymm, locale)
          const monthTxns = transactionsInMonth(transactions, yyyymm)
          push(label, <MonthTransactionsDetail label={label} transactions={monthTxns} onBack={pop} />)
        }}
      />
    )
  }

  return <MultiMonthBody summary={summary} onOpenEveryMonth={openEveryMonth} />
}

// ── Multi-month window ──────────────────────────────────────────────────

function MultiMonthBody({ summary, onOpenEveryMonth }: { summary: SavingsTrendsSummary; onOpenEveryMonth: () => void }) {
  const { t, locale } = useApp()
  const monthLabel = (yyyymm: string) => monthName(yyyymm, locale)

  const cards = worthALookCards(summary, t)

  return (
    <div className="flex flex-col gap-6 pb-[24px] pl-[22px] pr-[22px] pt-[18px]">
      <VerdictZone summary={summary} monthLabel={monthLabel} />
      <RateByMonthZone
        label={t('Rate by month')}
        months={summary.months}
        averageRate={summary.windowRate}
        bestKey={summary.bestKey}
        leanestKey={summary.leanestKey}
        monthLabel={monthLabel}
        compact={summary.months.length > CHART_COMPACT_THRESHOLD}
      />
      <div className="flex flex-col gap-2.5">
        <PanelSectionLabel>{t('Worth a look')}</PanelSectionLabel>
        {cards.map((c) => (
          <ReconciledMonthCard
            key={c.month.yyyymm}
            tag={c.tag}
            label={monthLabel(c.month.yyyymm)}
            rate={c.month.rate}
            incomeCents={c.month.incomeCents}
            expenseCents={c.month.expenseCents}
            savedCents={c.month.savedCents}
          />
        ))}
        {summary.months.length > 1 ? (
          <button type="button" onClick={onOpenEveryMonth} className="self-end text-[13px] text-accent">
            {t('All {0} months →', summary.months.length)}
          </button>
        ) : null}
      </div>
    </div>
  )
}

function worthALookCards(summary: SavingsTrendsSummary, t: Translate): Array<{ month: SavingsMonthPoint; tag: string }> {
  const mostRecentKey = summary.months[summary.months.length - 1]?.yyyymm ?? null
  const roles: Array<{ key: string | null; label: string }> = [
    { key: summary.bestKey, label: t('Best month') },
    { key: summary.leanestKey, label: t('Leanest month') },
    { key: mostRecentKey, label: t('Most recent') },
  ]
  const order: string[] = []
  const tagsByKey = new Map<string, string[]>()
  for (const r of roles) {
    if (!r.key) continue
    if (!tagsByKey.has(r.key)) {
      tagsByKey.set(r.key, [])
      order.push(r.key)
    }
    tagsByKey.get(r.key)!.push(r.label)
  }
  return order.map((key) => ({
    month: summary.months.find((m) => m.yyyymm === key)!,
    tag: tagsByKey.get(key)!.join(' · '),
  }))
}

// ── Single-month window ─────────────────────────────────────────────────

function SingleMonthBody({
  summary,
  context,
  selectedMonth,
}: {
  summary: SavingsTrendsSummary
  context: { summary: SavingsTrendsSummary; prevKey: string; prevPresent: boolean } | null
  selectedMonth: string
}) {
  const { t, locale } = useApp()
  const monthLabel = (yyyymm: string) => monthName(yyyymm, locale)
  const selected = summary.months[0]
  // `prevPresent` comes from the HOUSEHOLD's availableMonths; under person
  // scope (or a genuinely empty month) the scoped bucket can be all-zero — a
  // zeroed 'Previous month' card is exactly the presentation the widget's own
  // 'No comparison yet' guard exists to avoid (review 2026-08-24).
  const prevBucket = context?.prevPresent ? context.summary.months.find((m) => m.yyyymm === context.prevKey) ?? null : null
  const prevMonth = prevBucket && (prevBucket.incomeCents !== 0 || prevBucket.expenseCents !== 0) ? prevBucket : null

  const clauses: string[] = []
  if (prevMonth && prevMonth.rate !== null && selected.rate !== null) {
    const prevPct = Math.round(prevMonth.rate * 100)
    const curPct = Math.round(selected.rate * 100)
    if (curPct < prevPct) clauses.push(t('Down from {0}% in {1}', prevPct, monthLabel(prevMonth.yyyymm)))
    else if (curPct > prevPct) clauses.push(t('Up from {0}% in {1}', prevPct, monthLabel(prevMonth.yyyymm)))
    else clauses.push(t('Same as {0}% in {1}', prevPct, monthLabel(prevMonth.yyyymm)))
  }
  if (context && context.summary.windowRate !== null) {
    clauses.push(t('{0}% average over {1} months', Math.round(context.summary.windowRate * 100), context.summary.months.length))
  }

  return (
    <div className="flex flex-col gap-6 pb-[24px] pl-[22px] pr-[22px] pt-[18px]">
      <VerdictZone summary={summary} monthLabel={monthLabel} subLine={clauses.length > 0 ? clauses.join(' · ') : undefined} />
      {context ? (
        <RateByMonthZone
          label={t('This month in context')}
          months={context.summary.months}
          averageRate={context.summary.windowRate}
          selectedKey={selectedMonth}
          monthLabel={monthLabel}
          compact={false}
        />
      ) : null}
      <div className="flex flex-col gap-2.5">
        <PanelSectionLabel>{t('{0} reconciled', monthLabel(selectedMonth))}</PanelSectionLabel>
        <ReconciledMonthCard
          tag={t('Selected month')}
          label={monthLabel(selected.yyyymm)}
          rate={selected.rate}
          incomeCents={selected.incomeCents}
          expenseCents={selected.expenseCents}
          savedCents={selected.savedCents}
        />
        {prevMonth ? (
          <ReconciledMonthCard
            tag={t('Previous month')}
            label={monthLabel(prevMonth.yyyymm)}
            rate={prevMonth.rate}
            incomeCents={prevMonth.incomeCents}
            expenseCents={prevMonth.expenseCents}
            savedCents={prevMonth.savedCents}
          />
        ) : null}
      </div>
    </div>
  )
}

// ── Zone 1: verdict + kept/spent split ──────────────────────────────────

function VerdictZone({
  summary,
  monthLabel,
  subLine,
}: {
  summary: SavingsTrendsSummary
  monthLabel: (yyyymm: string) => string
  subLine?: string
}) {
  const { formatMoney, t } = useApp()
  const isSingleMonth = summary.months.length === 1
  const monthCount = summary.months.length

  let verdict: string
  if (summary.windowRate === null) {
    verdict = t('No income recorded — {0} went out this window.', formatMoney(summary.windowExpenseCents))
  } else if (summary.windowSavedCents > 0) {
    const pct = pctMagnitude(summary.windowRate)
    verdict = isSingleMonth
      ? t('You kept {0} of the {1} that came in — {2}% this month.', formatMoney(summary.windowSavedCents), formatMoney(summary.windowIncomeCents), pct)
      : t('You kept {0} of the {1} that came in — {2}% across {3} months.', formatMoney(summary.windowSavedCents), formatMoney(summary.windowIncomeCents), pct, monthCount)
  } else {
    const pct = pctMagnitude(summary.windowRate)
    verdict = isSingleMonth
      ? t('You spent {0} more than came in — {1}% this month.', formatMoney(-summary.windowSavedCents), pct)
      : t('You spent {0} more than came in — {1}% across {2} months.', formatMoney(-summary.windowSavedCents), pct, monthCount)
  }

  let autoSubLine: string | undefined = subLine
  if (autoSubLine === undefined && summary.bestKey && summary.leanestKey) {
    const best = summary.months.find((m) => m.yyyymm === summary.bestKey)!
    const leanest = summary.months.find((m) => m.yyyymm === summary.leanestKey)!
    autoSubLine = t(
      'Best month {0} at {1}% · leanest {2} at {3}%',
      monthLabel(best.yyyymm),
      pctMagnitude(best.rate!),
      monthLabel(leanest.yyyymm),
      pctMagnitude(leanest.rate!)
    )
  }

  const keptCents = summary.windowSavedCents > 0 ? summary.windowSavedCents : 0
  const spentCents = summary.windowExpenseCents

  return (
    <div>
      <p className="m-0 text-[20px] font-medium leading-[1.35] text-text" style={{ letterSpacing: '-0.3px' }}>
        <span className="tabular-nums">{verdict}</span>
      </p>
      {autoSubLine ? <p className="mt-1.5 text-[13px] tabular-nums text-text-2">{autoSubLine}</p> : null}
      <div className="mt-[18px]">
        <IncomeSplitBar keptCents={keptCents} spentCents={spentCents} />
      </div>
    </div>
  )
}

// ── Zone 2: rate-by-month chart + label strip ───────────────────────────

function RateByMonthZone({
  label,
  months,
  averageRate,
  bestKey,
  leanestKey,
  selectedKey,
  monthLabel,
  compact,
}: {
  label: string
  months: SavingsMonthPoint[]
  averageRate: number | null
  bestKey?: string | null
  leanestKey?: string | null
  selectedKey?: string | null
  monthLabel: (yyyymm: string) => string
  compact: boolean
}) {
  const { t, locale } = useApp()
  const chartData: RateByMonthPoint[] = months.map((m) => ({
    key: m.yyyymm,
    ratePct: m.rate === null ? 0 : Math.round(m.rate * 100),
    hasRate: m.rate !== null,
  }))
  const averagePct = averageRate === null ? null : Math.round(averageRate * 100)

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <PanelSectionLabel>{label}</PanelSectionLabel>
        {averagePct !== null ? <span className="text-[11px] tabular-nums text-text-3">{t('avg {0}%', averagePct)}</span> : null}
      </div>
      <div className="mt-2.5 h-[128px]">
        <RateByMonthChart data={chartData} averagePct={averagePct} bestKey={bestKey} leanestKey={leanestKey} selectedKey={selectedKey} />
      </div>
      {!compact ? (
        <div className="mt-1.5 grid gap-1" style={{ gridTemplateColumns: `repeat(${months.length}, 1fr)` }}>
          {months.map((m) => {
            const emphasised = m.yyyymm === bestKey || m.yyyymm === leanestKey || m.yyyymm === selectedKey
            return (
              <span
                key={m.yyyymm}
                className="text-center text-[12px] tabular-nums"
                style={{ color: emphasised ? 'var(--text)' : 'var(--text-2)', fontWeight: emphasised ? 600 : 400 }}
              >
                {formatRate(m.rate)}
              </span>
            )
          })}
        </div>
      ) : null}
      <div className="mt-1 grid gap-1" style={{ gridTemplateColumns: `repeat(${months.length}, 1fr)` }}>
        {months.map((m, i) => {
          const showLabel = !compact || i % 3 === 0
          return (
            <span key={m.yyyymm} className="text-center text-[11px] text-text-3">
              {showLabel ? monthName(m.yyyymm, locale, true) : ''}
            </span>
          )
        })}
      </div>
    </div>
  )
}

// ── Second level: every month ───────────────────────────────────────────

function EveryMonthDetail({
  summary,
  subject,
  onOpenMonth,
}: {
  summary: SavingsTrendsSummary
  subject: string
  onOpenMonth: (yyyymm: string) => void
}) {
  const { t, formatMoney, locale } = useApp()
  const newestFirst = [...summary.months].reverse()

  return (
    <div className="flex flex-col p-2 pt-0">
      <div className="mb-1 mt-2.5 px-3 text-xs text-text-3">
        {subject} · {t('{0} months · newest first', summary.months.length)}
      </div>
      {newestFirst.map((m) => {
        const tag = m.yyyymm === summary.bestKey ? t('Best') : m.yyyymm === summary.leanestKey ? t('Leanest') : null
        const negative = m.rate !== null && m.rate < 0
        return (
          <button
            key={m.yyyymm}
            type="button"
            onClick={() => onOpenMonth(m.yyyymm)}
            className="grid h-[52px] grid-cols-[1fr_58px_96px_16px] items-center gap-2.5 border-b-[0.5px] border-hairline px-3 text-left text-sm last:border-b-0 hover:bg-[var(--surface-2)]"
          >
            <span>
              <span className="text-text" style={{ letterSpacing: '-0.1px' }}>
                {monthName(m.yyyymm, locale)}
              </span>
              {tag ? <span className="ml-2 text-[10px] font-semibold uppercase tracking-[0.5px] text-text-3">{tag}</span> : null}
              <span className="block text-[11px] tabular-nums text-text-3">
                {t('{0} in · {1} out', formatMoney(m.incomeCents), formatMoney(m.expenseCents))}
              </span>
            </span>
            <span
              className="text-right text-[14.5px] font-semibold tabular-nums"
              style={{ color: negative ? 'var(--text)' : 'var(--positive)' }}
            >
              {formatRate(m.rate)}
            </span>
            <span className="text-right tabular-nums text-text">{formatMoney(m.savedCents)}</span>
            <span className="text-right text-text-3">›</span>
          </button>
        )
      })}
      <div className="grid h-14 grid-cols-[1fr_58px_96px_16px] items-center gap-2.5 border-t-[0.5px] border-hairline px-3 text-sm">
        <span className="font-semibold text-text">{t('Window total')}</span>
        <span
          className="text-right text-[14.5px] font-semibold tabular-nums"
          style={{ color: summary.windowRate !== null && summary.windowRate < 0 ? 'var(--text)' : 'var(--positive)' }}
        >
          {formatRate(summary.windowRate)}
        </span>
        <span className="text-right font-semibold tabular-nums text-text">{formatMoney(summary.windowSavedCents)}</span>
        <span />
      </div>
    </div>
  )
}

function MonthTransactionsDetail({ label, transactions, onBack }: { label: string; transactions: Transaction[]; onBack: () => void }) {
  const { t, formatMoney } = useApp()
  return (
    <div className="flex flex-col gap-3 p-5">
      <button type="button" onClick={onBack} className="self-start text-[13px] text-text-2">
        {t('‹ Back')}
      </button>
      <PanelSectionLabel>{label}</PanelSectionLabel>
      {transactions.length === 0 ? (
        <PanelEmpty>{t('Not enough data yet.')}</PanelEmpty>
      ) : (
        <div className="flex flex-col gap-1.5">
          {transactions.map((tx) => (
            <PanelRow key={tx.id} label={tx.merchant} value={formatMoney(tx.amount_cents)} />
          ))}
        </div>
      )}
    </div>
  )
}

function monthName(yyyymm: string, locale: string, short = false): string {
  const [y, m] = yyyymm.split('-').map(Number)
  return new Intl.DateTimeFormat(locale, { month: short ? 'short' : 'long' }).format(new Date(y, m - 1, 1))
}

function transactionsInMonth(transactions: Transaction[], yyyymm: string): Transaction[] {
  const { start, end } = monthBoundsInterval(yyyymm)
  const startMs = start.getTime()
  const endMs = end.getTime()
  return transactions
    .filter((tx) => {
      const ms = new Date(tx.date).getTime()
      return ms >= startMs && ms < endMs
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
}
