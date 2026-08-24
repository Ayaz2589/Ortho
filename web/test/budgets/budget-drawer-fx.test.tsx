// @vitest-environment jsdom
//
// Review 2026-08-24 (minor, FX round-trip family): BudgetDrawer prefills the
// limit (and flex cap) from stored cents via centsToDisplay and always
// re-parses on save. Under a lossy display rate (GBP 0.78) the
// cents→display→cents trip shifts by a cent, so opening a budget and saving
// WITHOUT touching the amount silently rewrote the stored limit — the exact
// drift the spec-023 B1 guard exists to prevent in TxForm/ContributionForm.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import type { Budget } from '@/lib/types'

const addOrUpdateBudget = vi.fn()

// 4002¢ → display "31.22" → re-parse 4003¢ (the drift case).
const EXISTING: Budget = {
  id: 'b1',
  household_id: 'h1',
  category: 'groceries',
  monthly_limit_cents: 4002,
  budget_type: 'flex',
  rollover_cap_cents: 4002,
  person_id: null,
  created_at: '2026-01-01T00:00:00.000Z',
}

vi.mock('@/lib/store', () => ({
  useApp: () => ({
    currency: 'gbp',
    rate: () => 0.78,
    currentHousehold: { id: 'h1', owner_id: 'u1', name: 'Home', created_at: '2026-01-01' },
    budgets: [EXISTING],
    addOrUpdateBudget,
    deleteBudget: vi.fn(),
    t: (k: string, ...a: Array<string | number>) =>
      a.length ? k.replace(/\{(\d+)\}/g, (m, i) => String(a[Number(i)] ?? m)) : k,
  }),
}))

import { BudgetDrawer } from '@/components/budgets/BudgetDrawer'

beforeEach(() => {
  addOrUpdateBudget.mockClear()
  if (!('randomUUID' in (globalThis.crypto ?? {}))) {
    // @ts-expect-error test shim
    globalThis.crypto = { ...globalThis.crypto, randomUUID: () => 'test-uuid' }
  }
})
afterEach(cleanup)

describe('BudgetDrawer FX round-trip guard', () => {
  it('an untouched save in GBP writes the stored limit and cap verbatim', () => {
    render(<BudgetDrawer category="groceries" onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(addOrUpdateBudget).toHaveBeenCalledTimes(1)
    const saved = addOrUpdateBudget.mock.calls[0][0] as Budget
    expect(saved.monthly_limit_cents).toBe(4002)
    expect(saved.rollover_cap_cents).toBe(4002)
  })
})
