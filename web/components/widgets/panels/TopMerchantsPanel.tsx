'use client'

import { useMemo, useState } from 'react'
import { useApp } from '@/lib/store'
import { useDashboardScopeContext } from '@/lib/widgets/DashboardScopeContext'
import { useMoneyScope, useScopedTransactions } from '@/lib/widgets/MoneyScopeContext'
import { computeTopMerchants, type MerchantEntry, type TopMerchantsSummary } from '@/lib/finance/topMerchants'
import { normalizeMerchantKey, type DetectedRoutine } from '@/lib/finance/routines'
import { categoryMeta } from '@/lib/categories'
import { mediumDate, shortDate } from '@/lib/format'
import { usePanelCaption, usePanelRouteOut, usePanelDetail } from '@/components/widgets/WidgetPanel'
import { PanelEmpty, PanelSectionLabel, PanelRow, CycleStrip } from '@/components/widgets/panels/kit'
import type { Translate } from '@/lib/i18n'
import type { Transaction, TransactionCategory } from '@/lib/types'

const TOP_N = 5

function mode<V>(values: readonly V[]): V {
  const counts = new Map<V, number>()
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
  let best = values[0]
  let bestCount = 0
  for (const v of values) {
    const c = counts.get(v)!
    if (c > bestCount) {
      best = v
      bestCount = c
    }
  }
  return best
}

function deltaCell(deltaCents: number, formatMoney: (c: number, opts?: { leadingPlus?: boolean }) => string) {
  if (deltaCents === 0) return { text: '—', className: 'text-text-3' }
  if (deltaCents > 0) return { text: formatMoney(deltaCents, { leadingPlus: true }), className: 'text-text-2' }
  return { text: formatMoney(deltaCents), className: 'text-positive' }
}

interface MerchantHistory {
  firstSeenAt: string | null
  lastSeenAt: string | null
  category: TransactionCategory | null
  periodTransactions: Transaction[]
}

function merchantHistory(
  transactions: Transaction[],
  merchantKey: string,
  interval: { start: Date; end: Date }
): MerchantHistory {
  const all = transactions
    .filter((tx) => tx.kind === 'expense' && normalizeMerchantKey(tx.merchant) === merchantKey)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  const startMs = interval.start.getTime()
  const endMs = interval.end.getTime()
  const periodTransactions = all
    .filter((tx) => {
      const ms = new Date(tx.date).getTime()
      return ms >= startMs && ms < endMs
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  return {
    firstSeenAt: all[0]?.date ?? null,
    lastSeenAt: all[all.length - 1]?.date ?? null,
    category: all.length > 0 ? mode(all.map((tx) => tx.category)) : null,
    periodTransactions,
  }
}

/**
 * Top-merchants detail panel (spec 057 US6 — redesigned). The prior version
 * was a single unbounded ranked list restating the card louder, with the
 * one thing the card structurally cannot show — which merchants are
 * recurring, and what they add up to — demoted to grey text mid-row. This
 * inverts the priority into three fixed-height zones: a verdict + meter for
 * the standing recurring commitment, a day-of-month cycle strip (detection
 * is monthly by construction — lib/finance/routines.ts — so day-of-month is
 * the only period-independent axis), and a bounded top-5 ranked list with a
 * drill-in. Panel height stays roughly constant whether the household has
 * one merchant or forty.
 *
 * Reuses `detectRoutines`/`normalizeMerchantKey` as-is (FR-016) via the new
 * `computeTopMerchants` engine — nothing about recurring-charge detection is
 * reimplemented here. Honours BOTH scope axes exactly as `TopMerchantsBody`
 * does. Never red; an increase never reads more alarmingly than a decrease.
 */
export function TopMerchantsPanel() {
  const { transactions: allTransactions, formatMoney, t, locale, resolveUser } = useApp()
  const scope = useMoneyScope()
  const transactions = useScopedTransactions(allTransactions)
  const { interval, periodLabel, now } = useDashboardScopeContext()
  const { push } = usePanelDetail()

  const subject = scope.kind === 'person' ? resolveUser(scope.personId).name : t('Household')
  usePanelCaption({ subject, period: periodLabel })
  usePanelRouteOut({ label: t('See all transactions'), href: '/transactions' })

  const summary = useMemo(() => computeTopMerchants(transactions, interval, now), [transactions, interval, now])
  const routineByKey = useMemo(() => new Map(summary.routines.map((r) => [r.merchantKey, r])), [summary.routines])
  const maxCents = summary.entries[0]?.cents ?? 1

  if (summary.entries.length === 0) {
    return (
      <PanelEmpty>
        <p className="m-0">{t('No expenses in this period yet.')}</p>
        <p className="m-0 mt-2 text-[12.5px] text-text-3">
          {t("Recurring charges will appear here once there's spending to recognise.")}
        </p>
      </PanelEmpty>
    )
  }

  const openMerchant = (entry: MerchantEntry) => {
    push(
      entry.merchant,
      <MerchantView
        entry={entry}
        routine={routineByKey.get(entry.merchantKey)}
        history={merchantHistory(transactions, entry.merchantKey, interval)}
      />
    )
  }

  const openAllMerchants = () => {
    push(
      t('All merchants'),
      <AllMerchantsHost
        entries={withUpcomingCharges(summary)}
        hasPriorPeriod={summary.hasPriorPeriod}
        subject={subject}
        periodLabel={periodLabel}
        transactions={transactions}
        interval={interval}
        routineByKey={routineByKey}
      />
    )
  }

  const topEntries = summary.entries.slice(0, TOP_N)
  const moreCount = summary.entries.length - topEntries.length

  return (
    <div className="flex flex-col gap-6 pb-[22px] pl-[22px] pr-[22px] pt-4">
      <VerdictZone summary={summary} />
      {summary.activeRecurringCount > 1 ? <CycleZone summary={summary} /> : null}
      <RankedListZone
        entries={topEntries}
        hasPriorPeriod={summary.hasPriorPeriod}
        maxCents={maxCents}
        moreCount={moreCount}
        onOpenMerchant={openMerchant}
        onOpenAll={openAllMerchants}
      />
    </div>
  )
}

/** Merges in an ACTIVE recurring charge that hasn't landed a transaction
 *  this period at all (so it's absent from `summary.entries`, which only
 *  contains merchants with real period spend) — shown at its typical
 *  amount, so a charge like "Spotify · expected on day 27" still appears
 *  in the full list rather than vanishing until it bills. */
function withUpcomingCharges(summary: TopMerchantsSummary): MerchantEntry[] {
  const known = new Set(summary.entries.map((e) => e.merchantKey))
  const upcoming: MerchantEntry[] = summary.routines
    .filter((r) => r.derivedStatus !== 'lapsed' && !known.has(r.merchantKey))
    .map((r) => ({
      merchantKey: r.merchantKey,
      merchant: r.merchantLabel,
      cents: r.typicalAmountCents,
      count: 0,
      deltaCents: 0,
      recurring: true,
    }))
  return [...summary.entries, ...upcoming].sort((a, b) => b.cents - a.cents)
}

// ── Zone 1 (+ collapsed zone 2 for exactly one active charge) ──────────────

function VerdictZone({ summary }: { summary: TopMerchantsSummary }) {
  const { formatMoney, t } = useApp()

  if (summary.activeRecurringCount === 0) {
    return (
      <p className="m-0 text-[13.5px] leading-[1.55] text-text-2" style={{ textWrap: 'pretty' }}>
        {t(
          'No recurring charges recognised yet — it takes three months of consistent history for a charge to be recognised as recurring.'
        )}
      </p>
    )
  }

  const verdict =
    summary.activeRecurringCount === 1
      ? t('One recurring charge, about {0} a month.', formatMoney(summary.standingMonthlyCents))
      : t('About {0} a month goes to {1} recurring charges.', formatMoney(summary.standingMonthlyCents), summary.activeRecurringCount)

  const sharePct = summary.share === null ? 0 : Math.round(summary.share * 100)

  return (
    <div>
      <p className="m-0 text-[20px] font-medium leading-[1.35] text-text" style={{ letterSpacing: '-0.3px', textWrap: 'pretty' }}>
        <span className="tabular-nums">{verdict}</span>
      </p>
      <div className="mt-4 border-t-[0.5px] border-hairline pt-3.5">
        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-[0.6px] text-text-3">{t('Landed this period')}</span>
          <span className="text-[13px] tabular-nums text-text-2">
            {t('{0} of {1} · {2}%', formatMoney(summary.recurringInPeriodCents), formatMoney(summary.periodTotalCents), sharePct)}
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,.06)' }}>
          <div
            className="h-full rounded-full"
            style={{ width: `${sharePct}%`, background: 'var(--positive)', opacity: 0.85 }}
          />
        </div>
      </div>
      {summary.activeRecurringCount === 1 ? <SingleChargeLine summary={summary} /> : null}
    </div>
  )
}

function SingleChargeLine({ summary }: { summary: TopMerchantsSummary }) {
  const { t, locale } = useApp()
  const dot = summary.dots[0]
  if (!dot) return null
  const dayLine = t('{0}, on day {1}', dot.merchantLabel, dot.day)
  const suffix =
    dot.landed && dot.landedDate
      ? t('landed {0}', shortDate(new Date(dot.landedDate), locale))
      : t('expected on day {0}', dot.day)
  return <p className="mt-2.5 text-[12.5px] tabular-nums text-text-3">{`${dayLine} · ${suffix}`}</p>
}

// ── Zone 2 ───────────────────────────────────────────────────────────────

function CycleZone({ summary }: { summary: TopMerchantsSummary }) {
  const { formatMoney, t } = useApp()

  if (summary.isLongWindow) {
    return (
      <div>
        <PanelSectionLabel>{t('Recurring, by day of month')}</PanelSectionLabel>
        <CycleStrip dots={summary.dots} todayDay={null} />
        <div className="mt-2.5 flex justify-between text-[13px] tabular-nums text-text-2">
          <span>
            <Dot filled />
            {t('{0} charges · {1}', summary.landedCount, formatMoney(summary.landedCents))}
          </span>
          <span>{t('over {0} months', summary.windowMonths)}</span>
        </div>
      </div>
    )
  }

  return (
    <div>
      <PanelSectionLabel>{t('Recurring, by day of month')}</PanelSectionLabel>
      <CycleStrip dots={summary.dots} todayDay={summary.todayDay} />
      <div className="mt-2.5 flex justify-between text-[13px] tabular-nums text-text-2">
        <span>
          <Dot filled />
          {t('{0} landed · {1}', summary.landedCount, formatMoney(summary.landedCents))}
        </span>
        {summary.containsToday ? (
          <span>
            <Dot filled={false} />
            {t('{0} still ahead · ≈ {1}', summary.aheadCount, formatMoney(summary.aheadCents))}
          </span>
        ) : null}
      </div>
      {summary.nextCharge ? (
        <p className="mt-2 text-[12.5px] tabular-nums text-text-3">
          {t('Next: {0} on day {1} · ≈ {2}', summary.nextCharge.merchantLabel, summary.nextCharge.day, formatMoney(summary.nextCharge.amountCents))}
        </p>
      ) : null}
    </div>
  )
}

function Dot({ filled }: { filled: boolean }) {
  return (
    <span
      className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle"
      style={
        filled
          ? { background: 'var(--positive)' }
          : { border: '1.5px solid rgba(166,196,164,.75)', background: 'transparent' }
      }
    />
  )
}

// ── Zone 3 ───────────────────────────────────────────────────────────────

function RankedListZone({
  entries,
  hasPriorPeriod,
  maxCents,
  moreCount,
  onOpenMerchant,
  onOpenAll,
}: {
  entries: MerchantEntry[]
  hasPriorPeriod: boolean
  maxCents: number
  moreCount: number
  onOpenMerchant: (entry: MerchantEntry) => void
  onOpenAll: () => void
}) {
  const { t } = useApp()
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <PanelSectionLabel>{t('Top merchants')}</PanelSectionLabel>
        {hasPriorPeriod ? <PanelSectionLabel>{t('Δ vs last period')}</PanelSectionLabel> : null}
      </div>
      {entries.map((entry) => (
        <MerchantRow key={entry.merchantKey} entry={entry} hasPriorPeriod={hasPriorPeriod} maxCents={maxCents} onOpen={() => onOpenMerchant(entry)} />
      ))}
      {moreCount > 0 ? (
        <button type="button" onClick={onOpenAll} className="mt-2 self-end text-[13px] text-accent" style={{ display: 'block', marginLeft: 'auto' }}>
          {t('+ {0} more →', moreCount)}
        </button>
      ) : null}
    </div>
  )
}

function MerchantRow({
  entry,
  hasPriorPeriod,
  maxCents,
  onOpen,
}: {
  entry: MerchantEntry
  hasPriorPeriod: boolean
  maxCents: number
  onOpen: () => void
}) {
  const { formatMoney } = useApp()
  const widthPct = maxCents > 0 ? Math.max(2, (entry.cents / maxCents) * 100) : 0
  const delta = deltaCell(entry.deltaCents, formatMoney)
  return (
    <button
      type="button"
      onClick={onOpen}
      className="grid h-11 w-full items-center gap-2.5 border-b-[0.5px] border-hairline text-left last:border-b-0"
      style={{ gridTemplateColumns: hasPriorPeriod ? '1fr 84px 68px' : '1fr 84px' }}
    >
      <div className="flex min-w-0 flex-col gap-1.5">
        <span className="truncate text-[14.5px] text-text" style={{ letterSpacing: '-0.1px' }}>
          {entry.merchant}
          {entry.recurring ? <span className="ml-1.5 text-[12px] text-positive">↻</span> : null}
        </span>
        <div className="h-[3px] rounded-full" style={{ width: `${widthPct}%`, background: 'var(--positive)', opacity: 0.45 }} />
      </div>
      <span className="text-right text-[14.5px] font-semibold tabular-nums text-text" style={{ letterSpacing: '-0.2px' }}>
        {formatMoney(entry.cents)}
      </span>
      {hasPriorPeriod ? <span className={`text-right text-[13px] tabular-nums ${delta.className}`}>{delta.text}</span> : null}
    </button>
  )
}

// ── Second level: merchant view ─────────────────────────────────────────

function MerchantView({
  entry,
  routine,
  history,
}: {
  entry: MerchantEntry
  routine: DetectedRoutine | undefined
  history: MerchantHistory
}) {
  const { formatMoney, t, locale } = useApp()
  const previousCents = entry.cents - entry.deltaCents

  return (
    <div className="flex flex-col">
      <div className="border-b-[0.5px] border-hairline px-[22px] pb-[18px] pt-5">
        <div className="text-xs text-text-3">{routine ? t('Typical charge') : t('Total this period')}</div>
        <div className="mt-0.5 text-[28px] font-semibold tabular-nums text-text" style={{ letterSpacing: '-0.8px' }}>
          {formatMoney(routine ? routine.typicalAmountCents : entry.cents)}
        </div>
        <p className="mt-2 text-[13px] leading-[1.5] tabular-nums text-text-2">
          {routine ? (
            <>
              {t('Every month since {0} · {1} charges', mediumDate(new Date(routine.firstSeenAt), locale), routine.occurrenceCount)}
              <br />
            </>
          ) : null}
          {t('{0} this period · {1} last', formatMoney(entry.cents), formatMoney(previousCents))}
        </p>
        {routine ? (
          <div
            className="mt-3 inline-flex items-center gap-1.5 rounded-full text-[11.5px]"
            style={{ background: 'var(--chip-bg)', color: 'var(--chip-text)', padding: '4px 9px' }}
          >
            {routine.derivedStatus === 'lapsed'
              ? t('↻ Lapsed · last seen {0}', mediumDate(new Date(routine.lastSeenAt), locale))
              : t('↻ Recurring · confidence {0}', routine.confidence)}
          </div>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-x-[18px] gap-y-3.5 px-[22px] py-4">
        {history.firstSeenAt ? <Fact label={t('First seen')} value={mediumDate(new Date(history.firstSeenAt), locale)} /> : null}
        {history.lastSeenAt ? <Fact label={t('Last seen')} value={mediumDate(new Date(history.lastSeenAt), locale)} /> : null}
        {history.category ? <Fact label={t('Category')} value={t(categoryMeta(history.category).label)} /> : null}
        <Fact label={t('Charges in period')} value={String(entry.count)} />
      </div>
      <div className="px-[22px] pb-5 pt-1">
        <PanelSectionLabel>{t('Transactions in this period')}</PanelSectionLabel>
        <div className="mt-1.5 flex flex-col">
          {history.periodTransactions.map((tx) => (
            <PanelRow key={tx.id} label={shortDate(new Date(tx.date), locale)} value={formatMoney(tx.amount_cents)} labelClassName="text-text-3" />
          ))}
        </div>
      </div>
    </div>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] text-text-3">{label}</div>
      <div className="mt-0.5 text-[14px] tabular-nums text-text" style={{ letterSpacing: '-0.1px' }}>
        {value}
      </div>
    </div>
  )
}

// ── Second level: all-merchants view ────────────────────────────────────

function AllMerchantsHost({
  entries,
  hasPriorPeriod,
  subject,
  periodLabel,
  transactions,
  interval,
  routineByKey,
}: {
  entries: MerchantEntry[]
  hasPriorPeriod: boolean
  subject: string
  periodLabel: string
  transactions: Transaction[]
  interval: { start: Date; end: Date }
  routineByKey: Map<string, DetectedRoutine>
}) {
  const { t } = useApp()
  const [openEntry, setOpenEntry] = useState<MerchantEntry | null>(null)

  if (openEntry) {
    return (
      <div className="flex flex-col gap-3 pt-2">
        <button type="button" onClick={() => setOpenEntry(null)} className="self-start px-[22px] text-[13px] text-text-2">
          {t('‹ Back')}
        </button>
        <MerchantView
          entry={openEntry}
          routine={routineByKey.get(openEntry.merchantKey)}
          history={merchantHistory(transactions, openEntry.merchantKey, interval)}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col px-1.5 pb-5 pt-1.5">
      <div className="mb-1 mt-2.5 px-3 text-xs text-text-3">
        {t('{0} merchants · {1} · ranked by spend', entries.length, `${subject} · ${periodLabel}`)}
      </div>
      {entries.map((entry) => (
        <AllMerchantsRow key={entry.merchantKey} entry={entry} hasPriorPeriod={hasPriorPeriod} routine={routineByKey.get(entry.merchantKey)} onOpen={() => setOpenEntry(entry)} />
      ))}
    </div>
  )
}

function AllMerchantsRow({
  entry,
  hasPriorPeriod,
  routine,
  onOpen,
}: {
  entry: MerchantEntry
  hasPriorPeriod: boolean
  routine: DetectedRoutine | undefined
  onOpen: () => void
}) {
  const { formatMoney, t } = useApp()
  const delta = deltaCell(entry.deltaCents, formatMoney)
  const meta = metaLine(entry, routine, t)
  return (
    <button
      type="button"
      onClick={onOpen}
      style={{
        transition: 'background-color var(--duration-fast) var(--ease-out)',
        gridTemplateColumns: hasPriorPeriod ? '1fr 84px 68px 14px' : '1fr 84px 14px',
      }}
      className="grid h-[46px] items-center gap-2.5 border-b-[0.5px] border-hairline px-3 text-left text-sm last:border-b-0 hover:bg-[var(--surface-2)]"
    >
      <span className="min-w-0 truncate text-text">
        {entry.merchant}
        {entry.recurring ? <span className="ml-1.5 text-[12px] text-positive">↻</span> : null}
        <span className="block truncate text-[11px] text-text-3">{meta}</span>
      </span>
      <span className="tabular-nums text-text">{formatMoney(entry.cents)}</span>
      {hasPriorPeriod ? <span className={`tabular-nums ${delta.className}`}>{delta.text}</span> : null}
      <span className="text-right text-text-3">›</span>
    </button>
  )
}

function metaLine(entry: MerchantEntry, routine: DetectedRoutine | undefined, t: Translate): string {
  if (!routine) return entry.count === 1 ? t('1 visit') : t('{0} visits', entry.count)
  if (entry.count === 0) return t('expected on day {0}', new Date(routine.lastSeenAt).getDate())
  return entry.count === 1 ? t('1 charge') : t('{0} charges', entry.count)
}
