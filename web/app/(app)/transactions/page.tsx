'use client'

import { useMemo, useState } from 'react'
import { Search, Plus, X, ArrowUpDown, ChevronDown, SlidersHorizontal } from 'lucide-react'
import { useApp } from '@/lib/store'
import { PageHeader, IconButton, Card, Segmented, EmptyState, Modal } from '@/components/ui'
import { useIsExpanded } from '@/lib/useMediaQuery'
import { groupByDay, groupDaysByMonth, dayLabel, monthYearLong, expenseTotal, startOfMonth } from '@/lib/format'
import type { Transaction } from '@/lib/types'
import { TransactionRow } from '@/components/transactions/TransactionRow'
import { TransactionDetailModal } from '@/components/transactions/TransactionDetailModal'
import { TransactionsDesktop } from '@/components/web/TransactionsDesktop'
import { TxModalWeb } from '@/components/web/TxModalWeb'
import { useTransactionFilters } from '@/lib/useTransactionFilters'
import { FilterPanel } from '@/components/web/FilterPanel'
import { ActiveFilterChips } from '@/components/web/ActiveFilterChips'

type ScopeFilter = 'all' | 'shared' | 'personal'

export default function TransactionsPage() {
  const isExpanded = useIsExpanded()
  const { transactions, formatMoney, deleteTransaction, locale } = useApp()
  const f = useTransactionFilters()

  const [searchActive, setSearchActive] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [copySource, setCopySource] = useState<Transaction | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)

  const hasAny = transactions.length > 0

  const months = useMemo(() => groupDaysByMonth(groupByDay(f.filtered)), [f.filtered])
  const noMatches = hasAny && f.filtered.length === 0

  // Collapse every month by default except the current (or most recent) one; any
  // active filter expands all so matches aren't hidden inside a collapsed month.
  const currentMonthKey = useMemo(() => startOfMonth(new Date()).getTime(), [])
  const defaultOpenKey = useMemo(() => {
    if (months.some((m) => m.month.getTime() === currentMonthKey)) return currentMonthKey
    return months[0]?.month.getTime() ?? null
  }, [months, currentMonthKey])

  const [openMonths, setOpenMonths] = useState<Set<number> | null>(null)
  const isMonthOpen = (key: number) =>
    f.count > 0 || (openMonths === null ? key === defaultOpenKey : openMonths.has(key))
  function toggleMonth(key: number) {
    setOpenMonths((prev) => {
      const base = prev ?? (defaultOpenKey !== null ? new Set([defaultOpenKey]) : new Set<number>())
      const next = new Set(base)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function openAdd() {
    setCopySource(null)
    setAddOpen(true)
  }
  function openCopy(tx: Transaction) {
    setCopySource(tx)
    setAddOpen(true)
  }

  // Desktop (≥1024px): the ledger table + detail drawer.
  if (isExpanded) return <TransactionsDesktop />

  // Mobile / medium: single-column day-grouped list.
  return (
    <div className="mx-auto w-full max-w-[640px]">
      <PageHeader
        title="Transactions"
        right={
          <>
            {hasAny && (
              <IconButton
                ariaLabel={searchActive ? 'Close search' : 'Search transactions'}
                onClick={() => {
                  if (searchActive) {
                    f.setQuery('')
                    setSearchActive(false)
                  } else {
                    setSearchActive(true)
                  }
                }}
              >
                {searchActive ? <X size={18} /> : <Search size={18} />}
              </IconButton>
            )}
            {hasAny && (
              <span className="relative">
                <IconButton ariaLabel={`Filters${f.count > 0 ? ` (${f.count} active)` : ''}`} onClick={() => setFilterOpen(true)}>
                  <SlidersHorizontal size={18} />
                </IconButton>
                {f.count > 0 && (
                  <span
                    className="pointer-events-none absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-medium tabular-nums text-white"
                    style={{ background: 'var(--accent)' }}
                  >
                    {f.count}
                  </span>
                )}
              </span>
            )}
            <IconButton ariaLabel="Add transaction" onClick={openAdd}>
              <Plus size={18} />
            </IconButton>
          </>
        }
      />

      {hasAny && searchActive && (
        <div className="mb-4 flex flex-col gap-3">
          <input
            type="text"
            autoFocus
            value={f.criteria.query}
            onChange={(e) => f.setQuery(e.target.value)}
            placeholder="Search transactions"
            className="w-full rounded-xl bg-surface px-4 py-2.5 text-[15px] text-text outline-none placeholder:text-text-3"
          />
          <Segmented<ScopeFilter>
            options={[
              { value: 'all', label: 'All' },
              { value: 'shared', label: 'Shared' },
              { value: 'personal', label: 'Personal' },
            ]}
            value={f.criteria.scope}
            onChange={f.setScope}
          />
        </div>
      )}

      {hasAny && <ActiveFilterChips f={f} />}

      {!hasAny ? (
        <EmptyState
          icon={<ArrowUpDown size={40} />}
          title="No transactions yet"
          body="Log an expense or income to see it grouped by day here."
          action={
            <button
              type="button"
              onClick={openAdd}
              className="mt-2 rounded-full px-5 py-2.5 text-[15px] font-normal text-accent"
              style={{ background: 'rgba(0,0,0,0.05)' }}
            >
              Add transaction
            </button>
          }
        />
      ) : noMatches ? (
        <EmptyState
          icon={<SlidersHorizontal size={40} />}
          title="No transactions match your filters"
          body="Try removing a filter or widening your search."
          action={
            <button
              type="button"
              onClick={f.clearAll}
              className="mt-2 rounded-full px-5 py-2.5 text-[15px] font-normal text-accent"
              style={{ background: 'rgba(0,0,0,0.05)' }}
            >
              Clear filters
            </button>
          }
        />
      ) : (
        <div className="flex flex-col gap-5">
          {months.map((m) => {
            const key = m.month.getTime()
            const open = isMonthOpen(key)
            const monthItems = m.days.flatMap((d) => d.items)
            return (
              <div key={key} className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => toggleMonth(key)}
                  aria-expanded={open}
                  className="flex items-center justify-between px-1 py-1"
                >
                  <span className="flex items-center gap-1.5 text-[13px] font-normal uppercase tracking-[0.6px] text-text-2">
                    <ChevronDown
                      size={15}
                      className="text-text-3 transition-transform"
                      style={{ transform: open ? undefined : 'rotate(-90deg)' }}
                    />
                    {monthYearLong(m.month, locale)}
                    <span className="tabular-nums normal-case tracking-normal text-text-3">
                      ({monthItems.length})
                    </span>
                  </span>
                  <span className="text-[13px] font-normal tabular-nums text-text-3">
                    {formatMoney(expenseTotal(monthItems))}
                  </span>
                </button>
                {open &&
                  m.days.map((g) => (
                    <Card key={g.day.getTime()} className="overflow-hidden">
                      <div className="flex items-center justify-between px-4 pb-1 pt-3">
                        <span className="text-[13px] font-normal uppercase tracking-[0.6px] text-text-2">
                          {dayLabel(g.day, locale)}
                        </span>
                        <span className="text-[13px] font-normal tabular-nums text-text-3">
                          {formatMoney(expenseTotal(g.items))}
                        </span>
                      </div>
                      <div className="divide-y divide-hairline">
                        {g.items.map((tx) => (
                          <TransactionRow
                            key={tx.id}
                            tx={tx}
                            onOpen={() => setDetailId(tx.id)}
                            onCopy={() => openCopy(tx)}
                            onDelete={() => deleteTransaction(tx.id)}
                          />
                        ))}
                      </div>
                    </Card>
                  ))}
              </div>
            )
          })}
        </div>
      )}

      <Modal
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        title="Filters"
        right={
          f.count > 0 ? (
            <button type="button" onClick={f.clearAll} className="text-accent">
              Clear
            </button>
          ) : undefined
        }
      >
        <FilterPanel f={f} />
      </Modal>

      {addOpen && (
        <TxModalWeb
          open
          onClose={() => {
            setAddOpen(false)
            setCopySource(null)
          }}
          copying={copySource}
        />
      )}

      <TransactionDetailModal
        open={detailId !== null}
        txId={detailId}
        onClose={() => setDetailId(null)}
      />
    </div>
  )
}
