'use client'

import { useMemo, useState } from 'react'
import { Search, Plus, X, ArrowUpDown } from 'lucide-react'
import { useApp } from '@/lib/store'
import { PageHeader, IconButton, Card, Segmented, EmptyState } from '@/components/ui'
import { useIsExpanded } from '@/lib/useMediaQuery'
import { groupByDay, dayLabel, expenseTotal } from '@/lib/format'
import type { Transaction } from '@/lib/types'
import { TransactionRow } from '@/components/transactions/TransactionRow'
import { TransactionDetailModal } from '@/components/transactions/TransactionDetailModal'
import { TransactionsDesktop } from '@/components/web/TransactionsDesktop'
import { TxModalWeb } from '@/components/web/TxModalWeb'

type ScopeFilter = 'all' | 'shared' | 'personal'

export default function TransactionsPage() {
  const isExpanded = useIsExpanded()
  const {
    transactions,
    currentHousehold,
    resolveUser,
    formatMoney,
    deleteTransaction,
    locale,
  } = useApp()

  const [searchActive, setSearchActive] = useState(false)
  const [query, setQuery] = useState('')
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>('all')
  const [addOpen, setAddOpen] = useState(false)
  const [copySource, setCopySource] = useState<Transaction | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)

  const hasAny = transactions.length > 0

  function inScope(tx: Transaction): boolean {
    const isShared = tx.household_id !== null && tx.household_id === currentHousehold?.id
    const isPersonal = tx.household_id === null
    if (scopeFilter === 'shared') return isShared
    if (scopeFilter === 'personal') return isPersonal
    return isShared || isPersonal
  }

  function matches(tx: Transaction, q: string): boolean {
    if (tx.merchant.toLowerCase().includes(q)) return true
    if (tx.source.toLowerCase().includes(q)) return true
    if (tx.category.toLowerCase().includes(q)) return true
    for (const id of tx.owner_ids) {
      if (resolveUser(id).name.toLowerCase().includes(q)) return true
    }
    return false
  }

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    return groupByDay(transactions)
      .map((g) => ({
        day: g.day,
        items: g.items.filter((tx) => {
          if (!inScope(tx)) return false
          if (q === '') return true
          return matches(tx, q)
        }),
      }))
      .filter((g) => g.items.length > 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactions, query, scopeFilter, currentHousehold])

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
                    setQuery('')
                    setSearchActive(false)
                  } else {
                    setSearchActive(true)
                  }
                }}
              >
                {searchActive ? <X size={18} /> : <Search size={18} />}
              </IconButton>
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
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search transactions"
            className="w-full rounded-xl bg-surface px-4 py-2.5 text-[15px] text-text outline-none placeholder:text-text-3"
          />
          <Segmented<ScopeFilter>
            options={[
              { value: 'all', label: 'All' },
              { value: 'shared', label: 'Shared' },
              { value: 'personal', label: 'Personal' },
            ]}
            value={scopeFilter}
            onChange={setScopeFilter}
          />
        </div>
      )}

      {!hasAny ? (
        <EmptyState
          icon={<ArrowUpDown size={40} />}
          title="No transactions yet"
          body="Log an expense or income to see it grouped by day here."
          action={
            <button
              type="button"
              onClick={openAdd}
              className="mt-2 rounded-full px-5 py-2.5 text-[15px] font-semibold text-accent"
              style={{ background: 'rgba(0,0,0,0.05)' }}
            >
              Add transaction
            </button>
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          {groups.map((g) => (
            <Card key={g.day.getTime()} className="overflow-hidden">
              <div className="flex items-center justify-between px-4 pb-1 pt-3">
                <span className="text-[13px] font-semibold uppercase tracking-[0.6px] text-text-2">
                  {dayLabel(g.day, locale)}
                </span>
                <span className="text-[13px] font-semibold tabular-nums text-text-3">
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
          {groups.length === 0 && (
            <p className="py-12 text-center text-sm text-text-3">No matching transactions.</p>
          )}
        </div>
      )}

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
