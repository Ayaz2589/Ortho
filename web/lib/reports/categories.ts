import type { CategoryTotalRow } from '@/lib/api/aggregates'
import type { TransactionCategory } from '@/lib/types'

/** One category's total spend and its share of the window's total (spec 027). */
export interface RankedCategory {
  category: TransactionCategory
  cents: number
  /** cents / total, in [0, 1]. */
  share: number
}

/**
 * Rank category totals for the deep-dive: drop non-positive spend, sort by amount
 * descending, and compute each entry's share of the summed total. Returns `[]` for
 * empty or all-zero input (the view then shows a plainspoken empty line rather than
 * an empty chart).
 */
export function rankCategories(rows: CategoryTotalRow[]): RankedCategory[] {
  const positive = rows.filter((r) => r.cents > 0)
  const total = positive.reduce((s, r) => s + r.cents, 0)
  if (total <= 0) return []
  return positive
    .slice()
    .sort((a, b) => b.cents - a.cents)
    .map((r) => ({ category: r.category, cents: r.cents, share: r.cents / total }))
}
