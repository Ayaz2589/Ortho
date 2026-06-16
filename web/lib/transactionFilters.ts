// Pure, cross-platform transaction filtering. Mirrored in Swift
// (iOS/.../TransactionFilters.swift) and locked by shared golden vectors
// (shared/test-vectors/transaction-filters.json) so the two clients can't drift.
// See specs/006-transaction-filters.
import type { Transaction, TransactionCategory } from './types'

export interface FilterCriteria {
  query: string
  categories: TransactionCategory[]
  kind: 'all' | 'expense' | 'income'
  sources: string[]
  owners: string[]
  /** Inclusive ISO lower bound (`date >= from`). */
  dateFrom: string | null
  /** Exclusive ISO upper bound (`date < to`). Half-open `[from, to)`. */
  dateTo: string | null
}

export interface FilterContext {
  /** ownerId → display name, for search-by-owner-name. */
  ownerNames: Record<string, string>
}

export function emptyCriteria(): FilterCriteria {
  return { query: '', categories: [], kind: 'all', sources: [], owners: [], dateFrom: null, dateTo: null }
}

function matchesQuery(tx: Transaction, q: string, ownerNames: Record<string, string>): boolean {
  if (q === '') return true
  if (tx.merchant.toLowerCase().includes(q)) return true
  if (tx.source.toLowerCase().includes(q)) return true
  if (tx.category.toLowerCase().includes(q)) return true
  for (const id of tx.owner_ids) {
    const name = ownerNames[id]
    if (name && name.toLowerCase().includes(q)) return true
  }
  return false
}

/** Subset of `txs` passing ALL dimensions (OR within a multi-select). Order preserved. */
export function filterTransactions(txs: Transaction[], c: FilterCriteria, ctx: FilterContext): Transaction[] {
  const q = c.query.trim().toLowerCase()
  const fromT = c.dateFrom ? new Date(c.dateFrom).getTime() : null
  const toT = c.dateTo ? new Date(c.dateTo).getTime() : null
  return txs.filter((tx) => {
    if (!matchesQuery(tx, q, ctx.ownerNames)) return false
    if (c.categories.length > 0 && !c.categories.includes(tx.category)) return false
    if (c.kind !== 'all' && tx.kind !== c.kind) return false
    if (c.sources.length > 0 && !c.sources.includes(tx.source)) return false
    if (c.owners.length > 0 && !tx.owner_ids.some((id) => c.owners.includes(id))) return false
    if (fromT !== null || toT !== null) {
      const t = new Date(tx.date).getTime()
      if (fromT !== null && t < fromT) return false
      if (toT !== null && t >= toT) return false
    }
    return true
  })
}

/** Count of non-default dimensions (for the "N filters active" badge). */
export function activeFilterCount(c: FilterCriteria): number {
  let n = 0
  if (c.query.trim() !== '') n++
  if (c.categories.length > 0) n++
  if (c.kind !== 'all') n++
  if (c.sources.length > 0) n++
  if (c.owners.length > 0) n++
  if (c.dateFrom !== null || c.dateTo !== null) n++
  return n
}

/** Distinct non-empty sources present in the transactions, alphabetized. */
export function availableSources(txs: Transaction[]): string[] {
  const set = new Set<string>()
  for (const tx of txs) {
    const s = tx.source.trim()
    if (s) set.add(s)
  }
  return [...set].sort((a, b) => a.localeCompare(b))
}

const pad = (n: number) => String(n).padStart(2, '0')

/** "2026-05" → half-open UTC month window. Timezone-stable. */
export function monthBounds(yyyymm: string): { dateFrom: string; dateTo: string } {
  const m = yyyymm.match(/^(\d{4})-(\d{2})$/)
  if (!m) throw new Error(`INVALID_MONTH: ${JSON.stringify(yyyymm)}`)
  const y = Number(m[1])
  const mo = Number(m[2])
  if (mo < 1 || mo > 12) throw new Error(`INVALID_MONTH: ${yyyymm}`)
  const ny = mo === 12 ? y + 1 : y
  const nm = mo === 12 ? 1 : mo + 1
  return { dateFrom: `${y}-${pad(mo)}-01T00:00:00.000Z`, dateTo: `${ny}-${pad(nm)}-01T00:00:00.000Z` }
}
