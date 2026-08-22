'use client'

import { useMemo } from 'react'
import { useApp } from '@/lib/store'
import { useDashboardScopeContext } from '@/lib/widgets/DashboardScopeContext'
import { useMoneyScope, useScopedTransactions } from '@/lib/widgets/MoneyScopeContext'
import { detectRoutines, normalizeMerchantKey } from '@/lib/finance/routines'
import { mediumDate } from '@/lib/format'
import { usePanelCaption, usePanelRouteOut, usePanelDetail } from '@/components/widgets/WidgetPanel'
import { PanelEmpty, PanelSectionLabel, PanelRow } from '@/components/widgets/panels/kit'
import type { Transaction } from '@/lib/types'

/**
 * Top-merchants detail panel (spec 057, US6). Answers what the card's fixed
 * top-5 rows cannot: the full ranked list, and which of those merchants are
 * recurring charges rather than one-off visits — via the existing detection
 * engine (`detectRoutines`/`normalizeMerchantKey`, lib/finance/routines.ts),
 * reused as-is rather than reimplemented (FR-016). Selecting a merchant
 * pushes a second level (D6) with its history: first/last seen, typical
 * amount, and how this period compares to the one before — all derived from
 * already-loaded transactions (X-6).
 *
 * Honours BOTH scope axes exactly as `TopMerchantsBody` does: scoped
 * transactions for the people axis, the dashboard interval for the time
 * axis. The route-out goes to the full ledger rather than a merchant-filtered
 * one — the transactions screen has no query-param filter to link into today,
 * and adding one is outside this panel's four touch points; the per-merchant
 * second level already gives that narrower view without a navigation.
 */

interface MerchantEntry {
  merchant: string
  cents: number
  count: number
  recurring: boolean
}

function median(nums: readonly number[]): number {
  const sorted = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? Math.round((sorted[mid - 1] + sorted[mid]) / 2) : sorted[mid]
}

export function TopMerchantsPanel() {
  const { transactions: allTransactions, formatMoney, t, locale, resolveUser } = useApp()
  const scope = useMoneyScope()
  const transactions = useScopedTransactions(allTransactions)
  const { interval, periodLabel } = useDashboardScopeContext()

  const subject = scope.kind === 'person' ? resolveUser(scope.personId).name : t('Household')
  usePanelCaption({ subject, period: periodLabel })
  usePanelRouteOut({ label: t('See all transactions'), href: '/transactions' })
  const { push } = usePanelDetail()

  const recurringMerchantKeys = useMemo(() => {
    const routines = detectRoutines(transactions, interval.end)
    return new Set(routines.filter((r) => r.kind === 'recurring_charge').map((r) => r.merchantKey))
  }, [transactions, interval.end])

  const entries = useMemo<MerchantEntry[]>(() => {
    const startMs = interval.start.getTime()
    const endMs = interval.end.getTime()
    const map = new Map<string, { merchant: string; cents: number; count: number }>()
    for (const tx of transactions) {
      if (tx.kind !== 'expense') continue
      const ms = new Date(tx.date).getTime()
      if (ms < startMs || ms >= endMs) continue
      const entry = map.get(tx.merchant) ?? { merchant: tx.merchant, cents: 0, count: 0 }
      entry.cents += tx.amount_cents
      entry.count += 1
      map.set(tx.merchant, entry)
    }
    return [...map.values()]
      .sort((a, b) => b.cents - a.cents)
      .map((e) => ({ ...e, recurring: recurringMerchantKeys.has(normalizeMerchantKey(e.merchant)) }))
  }, [transactions, interval.start, interval.end, recurringMerchantKeys])

  if (entries.length === 0) {
    return <PanelEmpty>{t('No expenses in this period yet.')}</PanelEmpty>
  }

  return (
    <ul className="flex flex-col gap-0.5 p-2">
      {entries.map((entry) => {
        const visitsLabel = entry.count === 1 ? t('1 visit') : t('{0} visits', entry.count)
        return (
          <li key={entry.merchant}>
            <button
              type="button"
              onClick={() =>
                push(
                  entry.merchant,
                  <MerchantDetail
                    merchant={entry.merchant}
                    recurring={entry.recurring}
                    transactions={transactions}
                    interval={interval}
                  />
                )
              }
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-text">{entry.merchant}</p>
                <p className="flex items-center gap-1 text-xs text-text-3">
                  <span>{visitsLabel}</span>
                  {entry.recurring ? (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="text-text-2">{t('Monthly charge')}</span>
                    </>
                  ) : null}
                </p>
              </div>
              <span className="shrink-0 text-sm tabular-nums text-text">{formatMoney(entry.cents)}</span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function MerchantDetail({
  merchant,
  recurring,
  transactions,
  interval,
}: {
  merchant: string
  recurring: boolean
  transactions: Transaction[]
  interval: { start: Date; end: Date }
}) {
  const { formatMoney, t, locale } = useApp()

  const { firstSeenAt, lastSeenAt, typicalAmountCents, currentCents, previousCents } = useMemo(() => {
    const history = transactions
      .filter((tx) => tx.kind === 'expense' && tx.merchant === merchant)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

    const startMs = interval.start.getTime()
    const endMs = interval.end.getTime()
    const windowMs = endMs - startMs
    const prevStartMs = startMs - windowMs

    let current = 0
    let previous = 0
    for (const tx of history) {
      const ms = new Date(tx.date).getTime()
      if (ms >= startMs && ms < endMs) current += tx.amount_cents
      else if (ms >= prevStartMs && ms < startMs) previous += tx.amount_cents
    }

    return {
      firstSeenAt: history[0]?.date ?? null,
      lastSeenAt: history[history.length - 1]?.date ?? null,
      typicalAmountCents: history.length > 0 ? median(history.map((tx) => tx.amount_cents)) : 0,
      currentCents: current,
      previousCents: previous,
    }
  }, [transactions, merchant, interval.start, interval.end])

  return (
    <div className="flex flex-col gap-5 p-5">
      {recurring ? <PanelSectionLabel>{t('Monthly charge')}</PanelSectionLabel> : null}
      <div className="flex flex-col gap-0.5">
        <span className="text-[24px] font-light leading-none tabular-nums text-text">
          {formatMoney(typicalAmountCents)}
        </span>
        <span className="text-xs text-text-2">{t('typical amount')}</span>
      </div>
      <div className="flex flex-col gap-2.5">
        {firstSeenAt ? <PanelRow label={t('First seen')} value={mediumDate(new Date(firstSeenAt), locale)} /> : null}
        {lastSeenAt ? <PanelRow label={t('Last seen')} value={mediumDate(new Date(lastSeenAt), locale)} /> : null}
      </div>
      <div className="text-xs text-text-2">
        {t(
          '{0} this period, compared with {1} the period before.',
          formatMoney(currentCents),
          formatMoney(previousCents)
        )}
      </div>
    </div>
  )
}
