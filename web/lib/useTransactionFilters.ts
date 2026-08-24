'use client'

import { useEffect, useMemo, useState } from 'react'
import { useApp } from './store'
import { CATEGORIES } from './categories'
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

/** Per-tab persistence for the active criteria. On mobile, editing navigates to
 *  a dedicated route and back, remounting the list page — without this every
 *  active filter and the search query were silently discarded on the round
 *  trip (review 2026-08-24). Session-scoped on purpose: a fresh visit starts
 *  unfiltered. */
const STORAGE_KEY = 'ortho.txFilters'

const stringArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []

/** Stored state merged over `emptyCriteria()`, field-by-field validated so a
 *  corrupt or stale-shape payload degrades to the default, never throws. */
function readStoredCriteria(): FilterCriteria {
  const out = emptyCriteria()
  if (typeof window === 'undefined') return out
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return out
    const parsed: unknown = JSON.parse(raw)
    if (parsed == null || typeof parsed !== 'object') return out
    const p = parsed as Record<string, unknown>
    if (typeof p.query === 'string') out.query = p.query
    out.categories = stringArray(p.categories) as FilterCriteria['categories']
    if (p.kind === 'expense' || p.kind === 'income' || p.kind === 'transfer') out.kind = p.kind
    out.sources = stringArray(p.sources)
    out.owners = stringArray(p.owners)
    out.tags = stringArray(p.tags)
    if (typeof p.dateFrom === 'string') out.dateFrom = p.dateFrom
    if (typeof p.dateTo === 'string') out.dateTo = p.dateTo
    return out
  } catch {
    return emptyCriteria()
  }
}

/** Single source of filter state + the filtered/derived data, shared by the
 *  compact page and the desktop view. The pure `filterTransactions` does the work. */
export function useTransactionFilters() {
  const { transactions, tags = [], resolveUser, locale, t } = useApp()
  const [criteria, setCriteria] = useState<FilterCriteria>(readStoredCriteria)

  useEffect(() => {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(criteria))
    } catch {
      // Storage full or unavailable — filtering still works for this mount.
    }
  }, [criteria])

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

  // Displayed (localized) category labels, so search finds 'Fast Food' as the
  // chips/pickers render it — not only the internal 'fast_food' key
  // (review 2026-08-24).
  const categoryLabels = useMemo(() => {
    const m: Record<string, string> = {}
    for (const key of Object.keys(CATEGORIES)) m[key] = t(CATEGORIES[key as TransactionCategory].label)
    return m
  }, [t])

  const ctx: FilterContext = useMemo(
    () => ({ ownerNames, tagNames, categoryLabels }),
    [ownerNames, tagNames, categoryLabels]
  )

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
