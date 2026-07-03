// Spec 013 US5/A4: one category source of truth. The CLI's list must BE the
// shared pickable list (transfer stays unpickable — a locked product decision),
// and the TransactionCategory union must derive from it so they cannot drift.
import { describe, it, expect } from 'vitest'
import { CATEGORY_LIST } from '../../scripts/import/engine/filters'
import { PICKABLE_CATEGORIES } from '../../lib/types'
import { CATEGORIES } from '../../lib/categories'

describe('category derivation (013/US5)', () => {
  it('the CLI list IS the shared pickable list (same reference)', () => {
    expect(CATEGORY_LIST).toBe(PICKABLE_CATEGORIES)
  })
  it('pickable = every category except transfer', () => {
    expect(PICKABLE_CATEGORIES).not.toContain('transfer')
    // Every pickable category has a label entry; the label map adds only transfer.
    const labelKeys = Object.keys(CATEGORIES).sort()
    expect(labelKeys).toEqual([...PICKABLE_CATEGORIES, 'transfer'].sort())
  })
})
