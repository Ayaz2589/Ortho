'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { useApp } from '@/lib/store'
import { useMoneyScope, useScopedTransactions } from '@/lib/widgets/MoneyScopeContext'
import { categoryMeta } from '@/lib/categories'
import { groupByDay, dayLabel, parseTxDate } from '@/lib/format'
import { usePanelCaption, usePanelRouteOut } from '@/components/widgets/WidgetPanel'
import { PanelEmpty, PanelSectionLabel } from '@/components/widgets/panels/kit'

/** Bounded feed length (FR-018): a longer glance, never the whole ledger. */
const RECENT_LIMIT = 45

/**
 * Recent-activity detail panel (spec 057, US10 — the third panel, built ON
 * the kit extracted from US2/US3 to test whether it generalises before six
 * follow-up sandboxes depend on it, T040). Answers what the card's fixed
 * five rows cannot: the fuller recent feed, grouped by date, with a route
 * out to the full ledger rather than reproducing it (FR-018).
 *
 * Honours the people axis; ignores the time window ENTIRELY, by design —
 * `ActivityBody` is a live feed, not windowed to the dashboard's selected
 * month (spec 041 O-2). The caption therefore states the subject only; never
 * a period this panel does not actually apply to (D5, FR-014).
 */
export function ActivityPanel() {
  const { transactions: allTransactions, formatMoney, t, locale, resolveUser } = useApp()
  const scope = useMoneyScope()
  const transactions = useScopedTransactions(allTransactions)

  const subject = scope.kind === 'person' ? resolveUser(scope.personId).name : t('Household')
  usePanelCaption({ subject })
  usePanelRouteOut({ label: t('See all transactions'), href: '/transactions' })

  // A longer GLANCE, not a second transactions screen (FR-018): the feed is
  // bounded to the most recent rows and the 'See all transactions' route-out
  // carries the rest — the panel used to render the entire ledger
  // (review 2026-08-24).
  const groups = useMemo(() => {
    const recent = [...transactions]
      .sort((a, b) => parseTxDate(b.date).getTime() - parseTxDate(a.date).getTime())
      .slice(0, RECENT_LIMIT)
    return groupByDay(recent)
  }, [transactions])

  if (transactions.length === 0) {
    return <PanelEmpty>{t('No transactions yet.')}</PanelEmpty>
  }

  return (
    <div className="flex flex-col gap-5 p-5">
      {groups.map((group) => (
        <div key={group.day.toISOString()} className="flex flex-col gap-1.5">
          <PanelSectionLabel>{t(dayLabel(group.day, locale))}</PanelSectionLabel>
          {group.items.map((tx) => {
            const meta = categoryMeta(tx.category)
            const Icon = meta.icon
            return (
              <Link
                key={tx.id}
                href={`/transactions/edit?id=${tx.id}`}
                className="flex items-center gap-3 rounded-xl p-2"
              >
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                  style={{ background: 'var(--chip-bg)' }}
                >
                  <Icon size={15} style={{ color: meta.tint }} />
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-text">{tx.merchant}</span>
                <span className="shrink-0 tabular-nums text-sm text-text-2">{formatMoney(tx.amount_cents)}</span>
              </Link>
            )
          })}
        </div>
      ))}
    </div>
  )
}
