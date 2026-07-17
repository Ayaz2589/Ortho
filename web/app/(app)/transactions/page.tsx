'use client'

import { useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { Search, Plus, X, ArrowUpDown, ChevronDown, SlidersHorizontal, Camera, FileText } from 'lucide-react'
import { useApp } from '@/lib/store'
import { PageHeader, IconButton, Card, EmptyState, Modal } from '@/components/ui'
import { useIsExpanded } from '@/lib/useMediaQuery'
import { groupByDay, groupDaysByMonth, dayLabel, shortDate, monthYearLong, expenseTotal } from '@/lib/format'
import { useMonthAccordion } from '@/lib/useMonthAccordion'
import type { Transaction } from '@/lib/types'
import { TransactionRow } from '@/components/transactions/TransactionRow'
import { TransactionDetailModal } from '@/components/transactions/TransactionDetailModal'
import { BalanceSummary } from '@/components/transactions/BalanceSummary'
import { TxModalWeb } from '@/components/web/TxModalWeb'
import type { TransferPrefill } from '@/components/web/TxForm'
import { useTransactionFilters } from '@/lib/useTransactionFilters'
import { useScanFlow } from '@/lib/scan/useScanFlow'
import { FilterPanel } from '@/components/web/FilterPanel'
import { ActiveFilterChips } from '@/components/web/ActiveFilterChips'

// Deferred so the scan UI (interstitial/summary) loads on demand when a scan is
// active, not on Transactions-route load (spec 022, US2). It only mounts when
// scan.state.phase !== 'idle', so the chunk is fetched at that moment.
const ScanFlow = dynamic(() => import('@/components/web/ScanFlow').then((m) => m.ScanFlow), {
  ssr: false,
})

// Deferred so a mobile/iOS session never downloads the desktop composition
// (spec 022, US3). The synchronous useIsExpanded() gate still selects the branch
// before paint (no wrong-layout flash); the desktop chunk loads only when expanded.
const TransactionsDesktop = dynamic(
  () => import('@/components/web/TransactionsDesktop').then((m) => m.TransactionsDesktop),
  { ssr: false, loading: () => null }
)

export default function TransactionsPage() {
  const isExpanded = useIsExpanded()
  const { transactions, formatMoney, deleteTransaction, locale, t } = useApp()
  const f = useTransactionFilters()

  const [searchActive, setSearchActive] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [copySource, setCopySource] = useState<Transaction | null>(null)
  const [settlePrefill, setSettlePrefill] = useState<TransferPrefill | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [scanPickerOpen, setScanPickerOpen] = useState(false)
  const scan = useScanFlow()

  const hasAny = transactions.length > 0

  const months = useMemo(() => groupDaysByMonth(groupByDay(f.filtered)), [f.filtered])
  const noMatches = hasAny && f.filtered.length === 0

  const { isMonthOpen, toggleMonth } = useMonthAccordion(months, f.count)

  function openAdd() {
    setCopySource(null)
    setSettlePrefill(null)
    setAddOpen(true)
  }
  function openCopy(tx: Transaction) {
    setCopySource(tx)
    setSettlePrefill(null)
    setAddOpen(true)
  }
  function openSettle(prefill: TransferPrefill) {
    setCopySource(null)
    setSettlePrefill(prefill)
    setAddOpen(true)
  }

  // Desktop (≥1024px): the ledger table + detail drawer.
  if (isExpanded) return <TransactionsDesktop />

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
            <IconButton ariaLabel={t('Scan a receipt or statement')} onClick={() => setScanPickerOpen(true)}>
              <Camera size={18} />
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

      {addOpen && (
        <TxModalWeb
          open
          onClose={() => {
            setAddOpen(false)
            setCopySource(null)
            setSettlePrefill(null)
          }}
          copying={copySource}
          initialTransfer={settlePrefill}
        />
      )}

      <TransactionDetailModal
        open={detailId !== null}
        txId={detailId}
        onClose={() => setDetailId(null)}
      />

      <Modal open={scanPickerOpen} onClose={() => setScanPickerOpen(false)} title={t('Scan')}>
        <div className="flex flex-col gap-1 py-2">
          <button
            type="button"
            onClick={() => {
              setScanPickerOpen(false)
              void scan.startCameraCapture()
            }}
            className="ortho-interactive flex items-center gap-3 rounded-xl px-3 py-3 text-left text-[15px] text-text"
          >
            <Camera size={20} className="text-text-2" />
            {t('Take a photo')}
          </button>
          <button
            type="button"
            onClick={() => {
              setScanPickerOpen(false)
              void scan.startFileImport()
            }}
            className="ortho-interactive flex items-center gap-3 rounded-xl px-3 py-3 text-left text-[15px] text-text"
          >
            <FileText size={20} className="text-text-2" />
            {t('Import a PDF from Files')}
          </button>
        </div>
      </Modal>

      {scan.state.phase !== 'idle' && (
        <ScanFlow
          state={scan.state}
          dispatch={scan.dispatch}
          onClose={() => scan.dispatch({ type: 'reset' })}
        />
      )}
    </div>
  )
}
