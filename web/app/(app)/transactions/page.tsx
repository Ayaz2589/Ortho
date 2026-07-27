'use client'

import { useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { Search, Plus, X, ArrowUpDown, ChevronDown, SlidersHorizontal, FileSpreadsheet } from 'lucide-react'
import { useApp } from '@/lib/store'
import { PageHeader, IconButton, Card, EmptyState, Modal } from '@/components/ui'
import { useIsExpanded } from '@/lib/useMediaQuery'
import { groupByDay, groupDaysByMonth, dayLabel, shortDate, monthYearLong, expenseTotal } from '@/lib/format'
import { useMonthAccordion } from '@/lib/useMonthAccordion'
import type { Transaction } from '@/lib/types'
import { sortByName } from '@/lib/transaction'
import { TransactionRow } from '@/components/transactions/TransactionRow'
import { TransactionDetailView } from '@/components/transactions/TransactionDetailView'
import { BalanceSummary } from '@/components/transactions/BalanceSummary'
import { useRouter } from 'next/navigation'
import type { TransferPrefill } from '@/components/web/TxForm'
import { useTransactionFilters } from '@/lib/useTransactionFilters'
import { FilterPanel } from '@/components/web/FilterPanel'
import { ActiveFilterChips } from '@/components/web/ActiveFilterChips'
import { hasCsvSession } from '@/lib/csv/csvImportPersistence'

const CsvImportFlow = dynamic(
  () => import('@/components/csv/CsvImportFlow').then((m) => m.CsvImportFlow),
  { ssr: false }
)

// Deferred so a mobile/iOS session never downloads the desktop composition
// (spec 022, US3). The synchronous useIsExpanded() gate still selects the branch
// before paint (no wrong-layout flash); the desktop chunk loads only when expanded.
const TransactionsDesktop = dynamic(
  () => import('@/components/web/TransactionsDesktop').then((m) => m.TransactionsDesktop),
  { ssr: false, loading: () => null }
)

export default function TransactionsPage() {
  const isExpanded = useIsExpanded()
  const router = useRouter()
  const { transactions, formatMoney, deleteTransaction, resolveUser, locale, t } = useApp()
  const f = useTransactionFilters()

  const [searchActive, setSearchActive] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [csvOpen, setCsvOpen] = useState(false)

  // Reopen the import tray after an accidental refresh if a review session was
  // persisted (post-mount so static-export hydration stays consistent).
  useEffect(() => {
    if (hasCsvSession()) setCsvOpen(true)
  }, [])

  const hasAny = transactions.length > 0

  const months = useMemo(() => groupDaysByMonth(groupByDay(f.filtered)), [f.filtered])
  const noMatches = hasAny && f.filtered.length === 0

  const { isMonthOpen, toggleMonth } = useMonthAccordion(months, f.count)

  // This component is the MOBILE tree (desktop early-returns <TransactionsDesktop/>
  // above), so add/edit navigate to their dedicated pages instead of opening the
  // in-place tray (spec 025). Copy/settle intent rides the query string.
  function openAdd() {
    router.push('/transactions/new')
  }
  function openCopy(tx: Transaction) {
    router.push(`/transactions/new?copyFrom=${encodeURIComponent(tx.id)}`)
  }
  function openSettle(prefill: TransferPrefill) {
    const q = new URLSearchParams({
      from: prefill.from,
      to: prefill.to,
      amount: String(prefill.amountCents),
    })
    router.push(`/transactions/new?${q.toString()}`)
  }

  // Desktop (≥1024px): the ledger table + detail drawer.
  if (isExpanded) return <TransactionsDesktop />

  // Mobile: full-page detail view (replaces the slide-up modal). `key` remounts
  // per transaction so the confirm-delete toggle never carries between rows.
  const detailTx = detailId ? transactions.find((tx) => tx.id === detailId) ?? null : null
  if (detailTx) {
    return (
      <TransactionDetailView
        key={detailTx.id}
        tx={detailTx}
        onBack={() => setDetailId(null)}
        onEdit={() => {
          setDetailId(null)
          router.push(`/transactions/edit?id=${encodeURIComponent(detailTx.id)}`)
        }}
        onDelete={() => {
          deleteTransaction(detailTx.id)
          setDetailId(null)
        }}
      />
    )
  }

  // Mobile / medium: single-column day-grouped list.
  return (
    <div className="mx-auto w-full max-w-[640px]">
      <PageHeader
        title={t('Transactions')}
        right={
          <>
            {hasAny && (
              <IconButton
                ariaLabel={searchActive ? t('Close search') : t('Search transactions')}
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
                <IconButton ariaLabel={f.count > 0 ? t('Filters ({0} active)', f.count) : t('Filters')} onClick={() => setFilterOpen(true)}>
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
            <IconButton ariaLabel={t('Import a CSV')} onClick={() => setCsvOpen(true)}>
              <FileSpreadsheet size={18} />
            </IconButton>
            <IconButton ariaLabel={t('Add transaction')} onClick={openAdd}>
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
            placeholder={t('Search transactions')}
            className="w-full rounded-xl bg-surface px-4 py-2.5 text-[15px] text-text outline-none placeholder:text-text-3"
          />
        </div>
      )}

      {hasAny && <ActiveFilterChips f={f} />}

      {/* Hidden while search is active — matches iOS (`!searchActive`). */}
      {!searchActive && <BalanceSummary onSettle={openSettle} />}

      {!hasAny ? (
        <EmptyState
          icon={<ArrowUpDown size={40} />}
          title={t('No transactions yet')}
          body={t('Log an expense or income to see it grouped by day here.')}
          action={
            <button
              type="button"
              onClick={openAdd}
              className="mt-2 rounded-full px-5 py-2.5 text-[15px] font-normal text-accent"
              style={{ background: 'var(--chip-bg)' }}
            >
              {t('Add transaction')}
            </button>
          }
        />
      ) : noMatches ? (
        <EmptyState
          icon={<SlidersHorizontal size={40} />}
          title={t('No transactions match your filters')}
          body={t('Try removing a filter or widening your search.')}
          action={
            <button
              type="button"
              onClick={f.clearAll}
              className="mt-2 rounded-full px-5 py-2.5 text-[15px] font-normal text-accent"
              style={{ background: 'var(--chip-bg)' }}
            >
              {t('Clear filters')}
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
                      <div className="flex items-baseline justify-between px-4 pb-1 pt-3">
                        <span className="flex items-baseline gap-2">
                          <span className="text-[13px] font-normal uppercase tracking-[0.6px] text-text-2">
                            {dayLabel(g.day, locale)}
                          </span>
                          <span className="text-[12px] text-text-3">{shortDate(g.day, locale)}</span>
                        </span>
                        <span className="text-[13px] font-normal tabular-nums text-text-3">
                          {formatMoney(expenseTotal(g.items))}
                        </span>
                      </div>
                      <div className="divide-y divide-hairline">
                        {sortByName(g.items, resolveUser, locale).map((tx) => (
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
        title={t('Filters')}
        right={
          f.count > 0 ? (
            <button type="button" onClick={f.clearAll} className="text-accent">
              {t('Clear')}
            </button>
          ) : undefined
        }
      >
        <FilterPanel f={f} />
      </Modal>

      {csvOpen && <CsvImportFlow onClose={() => setCsvOpen(false)} />}
    </div>
  )
}
