'use client'

import { useMemo, useState } from 'react'
import { useApp } from './store'
import {
  emptyCriteria,
  filterTransactions,
  activeFilterCount,
  availableSources,
  monthBounds,
  type FilterCriteria,
  type FilterContext,
} from './transactionFilters'
import type { Transaction, TransactionCategory } from './types'

export interface OwnerOption {
  id: string
  name: string
}
export interface MonthOption {
  /** "YYYY-MM" */
  value: string
  /** "May 2026" */
  label: string
}

/** Single source of filter state + the filtered/derived data, shared by the
 *  compact page and the desktop view. The pure `filterTransactions` does the work. */
export function useTransactionFilters() {
  const { transactions, currentHousehold, resolveUser } = useApp()
  const [criteria, setCriteria] = useState<FilterCriteria>(emptyCriteria)

  const ownerNames = useMemo(() => {
    const m: Record<string, string> = {}
    for (const tx of transactions) for (const id of tx.owner_ids) if (!(id in m)) m[id] = resolveUser(id).name
    return m
  }, [transactions, resolveUser])

  const ctx: FilterContext = useMemo(
    () => ({ householdId: currentHousehold?.id ?? null, ownerNames }),
    [currentHousehold, ownerNames]
  )

  const ownerOptions: OwnerOption[] = useMemo(() => {
    const ids = new Set<string>()
    for (const tx of transactions) for (const id of tx.owner_ids) ids.add(id)
    return [...ids].map((id) => ({ id, name: ownerNames[id] ?? id })).sort((a, b) => a.name.localeCompare(b.name))
  }, [transactions, ownerNames])

  const sourceOptions = useMemo(() => availableSources(transactions), [transactions])

  const monthOptions: MonthOption[] = useMemo(() => {
    const set = new Set<string>()
    for (const tx of transactions) set.add(tx.date.slice(0, 7))
    return [...set]
      .sort((a, b) => b.localeCompare(a)) // newest first
      .map((value) => {
        const [y, m] = value.split('-').map(Number)
        return { value, label: new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) }
      })
  }, [transactions])

  const filtered = useMemo(() => filterTransactions(transactions, criteria, ctx), [transactions, criteria, ctx])
  const count = activeFilterCount(criteria)

  // The month currently selected (derived from dateFrom), or null.
  const selectedMonth = criteria.dateFrom ? criteria.dateFrom.slice(0, 7) : null

  const patch = (p: Partial<FilterCriteria>) => setCriteria((c) => ({ ...c, ...p }))
  const toggleIn = (key: 'categories' | 'sources' | 'owners', v: string) =>
    setCriteria((c) => {
      const arr = c[key] as string[]
      return { ...c, [key]: arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v] }
    })

  return {
    criteria,
    filtered,
    count,
    ctx,
    sourceOptions,
    ownerOptions,
    monthOptions,
    selectedMonth,
    setScope: (v: FilterCriteria['scope']) => patch({ scope: v }),
    setQuery: (v: string) => patch({ query: v }),
    setKind: (v: FilterCriteria['kind']) => patch({ kind: v }),
    toggleCategory: (c: TransactionCategory) => toggleIn('categories', c),
    toggleSource: (s: string) => toggleIn('sources', s),
    toggleOwner: (id: string) => toggleIn('owners', id),
    setMonth: (yyyymm: string | null) =>
      patch(yyyymm ? monthBounds(yyyymm) : { dateFrom: null, dateTo: null }),
    clearDate: () => patch({ dateFrom: null, dateTo: null }),
    clearAll: () => setCriteria(emptyCriteria()),
  }
}

export type TxFilters = ReturnType<typeof useTransactionFilters>

/** A filtered transaction's owner-id list resolved to names — for active chips. */
export function ownerLabel(ids: string[], names: Record<string, string>): string {
  return ids.map((id) => names[id] ?? id).join(', ')
}

export type { Transaction }
