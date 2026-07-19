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
export interface TagOption {
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
  const { transactions, tags = [], resolveUser, locale } = useApp()
  const [criteria, setCriteria] = useState<FilterCriteria>(emptyCriteria)

  const ownerNames = useMemo(() => {
    const m: Record<string, string> = {}
    for (const tx of transactions) for (const id of tx.owner_ids) if (!(id in m)) m[id] = resolveUser(id).name
    return m
  }, [transactions, resolveUser])

  // tagId → name, for search-by-tag-name (spec 027).
  const tagNames = useMemo(() => {
    const m: Record<string, string> = {}
    for (const t of tags) m[t.id] = t.name
    return m
  }, [tags])

  const ctx: FilterContext = useMemo(() => ({ ownerNames, tagNames }), [ownerNames, tagNames])

  const ownerOptions: OwnerOption[] = useMemo(() => {
    const ids = new Set<string>()
    for (const tx of transactions) for (const id of tx.owner_ids) ids.add(id)
    return [...ids].map((id) => ({ id, name: ownerNames[id] ?? id })).sort((a, b) => a.name.localeCompare(b.name))
  }, [transactions, ownerNames])

  const sourceOptions = useMemo(() => availableSources(transactions), [transactions])

  // Tags present on the household's transactions (excludes orphan/absent tags,
  // FR-010), resolved to names and alphabetized (spec 027).
  const tagOptions: TagOption[] = useMemo(() => {
    const present = new Set<string>()
    for (const tx of transactions) for (const id of tx.tags ?? []) present.add(id)
    return [...present]
      .map((id) => ({ id, name: tagNames[id] ?? id }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [transactions, tagNames])

  const monthOptions: MonthOption[] = useMemo(() => {
    const set = new Set<string>()
    for (const tx of transactions) set.add(tx.date.slice(0, 7))
    const fmt = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' })
    return [...set]
      .sort((a, b) => b.localeCompare(a)) // newest first
      .map((value) => {
        const [y, m] = value.split('-').map(Number)
        return { value, label: fmt.format(new Date(y, m - 1, 1)) }
      })
  }, [transactions, locale])

  const filtered = useMemo(() => filterTransactions(transactions, criteria, ctx), [transactions, criteria, ctx])
  const count = activeFilterCount(criteria)

  // The month currently selected (derived from dateFrom), or null.
  const selectedMonth = criteria.dateFrom ? criteria.dateFrom.slice(0, 7) : null

  const patch = (p: Partial<FilterCriteria>) => setCriteria((c) => ({ ...c, ...p }))
  const toggleIn = (key: 'categories' | 'sources' | 'owners' | 'tags', v: string) =>
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
    tagOptions,
    monthOptions,
    selectedMonth,
    setQuery: (v: string) => patch({ query: v }),
    setKind: (v: FilterCriteria['kind']) => patch({ kind: v }),
    toggleCategory: (c: TransactionCategory) => toggleIn('categories', c),
    toggleSource: (s: string) => toggleIn('sources', s),
    toggleOwner: (id: string) => toggleIn('owners', id),
    toggleTag: (id: string) => toggleIn('tags', id),
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
