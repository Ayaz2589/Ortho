import { describe, it, expect } from 'vitest'
import { rankCategories } from '@/lib/reports/categories'
import type { CategoryTotalRow } from '@/lib/api/aggregates'

// Category deep-dive ranking for the reports surface (spec 027).
// Drops non-positive spend, sorts by cents desc, computes share of the window total.

describe('rankCategories', () => {
  it('sorts by cents descending and computes each share of the total', () => {
    const rows: CategoryTotalRow[] = [
      { category: 'dining', cents: 3000 },
      { category: 'groceries', cents: 6000 },
      { category: 'coffee', cents: 1000 },
    ]
    const ranked = rankCategories(rows)
    expect(ranked.map((r) => r.category)).toEqual(['groceries', 'dining', 'coffee'])
    expect(ranked[0].share).toBeCloseTo(0.6, 6)
    expect(ranked[1].share).toBeCloseTo(0.3, 6)
    expect(ranked[2].share).toBeCloseTo(0.1, 6)
  })

  it('drops non-positive spend', () => {
    const rows: CategoryTotalRow[] = [
      { category: 'dining', cents: 3000 },
      { category: 'coffee', cents: 0 },
      { category: 'fuel', cents: -500 },
    ]
    const ranked = rankCategories(rows)
    expect(ranked.map((r) => r.category)).toEqual(['dining'])
    expect(ranked[0].share).toBeCloseTo(1, 6)
  })

  it('returns [] for empty or all-zero input', () => {
    expect(rankCategories([])).toEqual([])
    expect(rankCategories([{ category: 'dining', cents: 0 }])).toEqual([])
  })

  it('shares sum to 1.0 (± rounding) for non-empty input', () => {
    const rows: CategoryTotalRow[] = [
      { category: 'dining', cents: 3333 },
      { category: 'groceries', cents: 3333 },
      { category: 'coffee', cents: 3334 },
    ]
    const total = rankCategories(rows).reduce((s, r) => s + r.share, 0)
    expect(total).toBeCloseTo(1, 6)
  })
})
