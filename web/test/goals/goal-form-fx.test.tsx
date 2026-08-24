// @vitest-environment jsdom
//
// Review 2026-08-24 (minor, FX round-trip family): GoalForm prefills the
// target from stored cents and always re-parses on save, so renaming a goal
// (or any non-amount edit) under a lossy display rate silently shifted
// target_cents by a cent. Same guard class as ContributionForm's.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import type { Goal } from '@/lib/types'

const updateGoal = vi.fn()

// 4002¢ → "31.22" → re-parse 4003¢.
const GOAL: Goal = {
  id: 'g1',
  household_id: 'h1',
  name: 'Emergency fund',
  kind: 'savings',
  target_cents: 4002,
  target_date: null,
  linked_account_id: null,
  linked_category: null,
  created_by: 'u1',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
}

vi.mock('@/lib/store', () => ({
  useApp: () => ({
    currency: 'gbp',
    rate: () => 0.78,
    currentHousehold: { id: 'h1', owner_id: 'u1', name: 'Home', created_at: '2026-01-01' },
    currentUserId: 'u1',
    linkedAccounts: [],
    addGoal: vi.fn(),
    updateGoal,
    t: (k: string, ...a: Array<string | number>) =>
      a.length ? k.replace(/\{(\d+)\}/g, (m, i) => String(a[Number(i)] ?? m)) : k,
  }),
}))

import { GoalForm } from '@/components/goals/GoalForm'

beforeEach(() => {
  updateGoal.mockClear()
  if (!('randomUUID' in (globalThis.crypto ?? {}))) {
    // @ts-expect-error test shim
    globalThis.crypto = { ...globalThis.crypto, randomUUID: () => 'test-uuid' }
  }
})
afterEach(cleanup)

describe('GoalForm FX round-trip guard', () => {
  it('an untouched-amount save in GBP writes the stored target verbatim', () => {
    render(<GoalForm open editing={GOAL} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(updateGoal).toHaveBeenCalledTimes(1)
    expect((updateGoal.mock.calls[0][0] as Goal).target_cents).toBe(4002)
  })
})
