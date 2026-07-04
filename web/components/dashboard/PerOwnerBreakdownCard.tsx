'use client'

import { useMemo, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { useApp } from '@/lib/store'
import { Card, SectionLabel } from '@/components/ui'
import { paletteFor } from '@/lib/categories'
import { effectiveShares, shortDate } from '@/lib/format'
import { sharePercent } from '@/lib/splits'
import type { Transaction, User } from '@/lib/types'
import { longLabel, type DashboardRange, type Interval } from './range'

const MAX_ROWS = 25

export function PerOwnerBreakdownCard({
  range,
  interval,
  label,
}: {
  range: DashboardRange
  interval: Interval
  label?: string
}) {
  const { householdMembers, spentBy, currentPersonId, transactions, formatMoney, locale, t } =
    useApp()
  const [expanded, setExpanded] = useState<string | null>(null)

  const inRange = (date: string) => {
    const t = new Date(date).getTime()
    return t >= interval.start.getTime() && t < interval.end.getTime()
  }

  const entries = useMemo(
    () =>
      householdMembers
        .map((user) => ({
          user,
          cents: spentBy(user.id, interval.start, interval.end),
        }))
        .sort((a, b) => b.cents - a.cents),
    // `spentBy` closes over the store's `transactions`, so the aggregate must
    // recompute when they change — otherwise the per-owner totals/bars freeze
    // at pre-mutation values while every other dashboard card updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [householdMembers, transactions, interval.start, interval.end]
  )

  const maxCents = Math.max(1, ...entries.map((e) => e.cents))

  return (
    <Card className="p-5">
      <SectionLabel right={label ?? t(longLabel(range))}>{t('Per owner')}</SectionLabel>

      {entries.length === 0 ? (
        <p className="py-2 text-[13px] text-text-3">{t('No household members yet.')}</p>
      ) : (
        <div className="mt-3 flex flex-col gap-3.5">
          {entries.map((entry) => {
            const isOpen = expanded === entry.user.id
            const palette = paletteFor(entry.user.color_key)
            const fraction = entry.cents / maxCents
            return (
              <div key={entry.user.id} className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : entry.user.id)}
                  className="flex flex-col gap-1 text-left"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[15px] font-normal text-text">
                      {entry.user.name}
                    </span>
                    {entry.user.id === currentPersonId && (
                      <span className="text-xs text-text-3">{t('(you)')}</span>
                    )}
                    <span className="ml-auto text-[15px] font-normal tabular-nums text-text">
                      {formatMoney(entry.cents)}
                    </span>
                    <ChevronDown
                      size={14}
                      className="text-text-3 transition-transform"
                      style={{ transform: isOpen ? 'rotate(180deg)' : undefined }}
                    />
                  </div>
                  <div
                    className="h-2 w-full overflow-hidden rounded-full"
                    style={{ background: 'rgba(0,0,0,0.05)' }}
                  >
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `max(8px, ${fraction * 100}%)`,
                        background: palette.bg,
                      }}
                    />
                  </div>
                </button>
                {isOpen && (
                  <ExpandedShares
                    user={entry.user}
                    transactions={transactions}
                    inRange={inRange}
                    formatMoney={formatMoney}
                    locale={locale}
                    t={t}
                  />
                )}
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}

function ExpandedShares({
  user,
  transactions,
  inRange,
  formatMoney,
  locale,
  t,
}: {
  user: User
  transactions: Transaction[]
  inRange: (date: string) => boolean
  formatMoney: (cents: number) => string
  locale: string
  t: (key: string, ...args: Array<string | number>) => string
}) {
  // Participated expenses in range (transactions newest-first from store),
  // with this user's split-weighted share.
  const shares = transactions
    .filter(
      (t) => t.kind === 'expense' && inRange(t.date) && t.owner_ids.includes(user.id)
    )
    .map((tx) => {
      const share = effectiveShares(tx)[user.id] ?? 0
      return { tx, share, pct: sharePercent(share, tx.amount_cents) }
    })

  const shown = shares.slice(0, MAX_ROWS)
  const remaining = Math.max(0, shares.length - shown.length)

  if (shares.length === 0) {
    return <p className="py-2 pl-1 text-[13px] text-text-3">{t('No expenses in this period.')}</p>
  }

  const pctLabel = (pct: number) =>
    Number.isInteger(pct) ? `${pct}%` : `${pct.toFixed(1)}%`

  return (
    <div className="pl-1">
      {shown.map((item, i) => (
        <div key={item.tx.id}>
          {i > 0 && <div className="h-px bg-hairline" />}
          <div className="flex items-center gap-2.5 py-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-sm font-normal text-text">
                  {item.tx.merchant}
                </span>
                {item.tx.owner_ids.length > 1 && (
                  <span
                    className="rounded-full px-1.5 py-px text-[10px] font-normal text-text-2"
                    style={{ background: 'rgba(0,0,0,0.06)' }}
                  >
                    {pctLabel(item.pct)}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-text-3">
                {shortDate(new Date(item.tx.date), locale)}
              </p>
            </div>
            <span className="text-sm font-normal tabular-nums text-text">
              {formatMoney(item.share)}
            </span>
          </div>
        </div>
      ))}
      {remaining > 0 && (
        <p className="pt-2.5 text-center text-xs text-text-3">{t('+ {0} more', remaining)}</p>
      )}
    </div>
  )
}
