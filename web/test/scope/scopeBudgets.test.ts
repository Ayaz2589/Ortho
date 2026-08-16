import { describe, it, expect } from 'vitest'
import type { Budget } from '@/lib/types'
import { HOUSEHOLD_SCOPE, personScope, scopeBudgets } from '@/lib/scope/moneyScope'

// spec 054 — budget LIMITS gain the PEOPLE axis that spec 051 gave to spend.
// `person_id === null` is a household budget; a person id makes it that person's.

const A = 'aaaaaaaa-0000-0000-0000-000000000001'
const B = 'bbbbbbbb-0000-0000-0000-000000000002'

function budget(over: Partial<Budget> = {}): Budget {
  return {
    id: 'b-1',
    household_id: 'hh',
    category: 'dining',
    monthly_limit_cents: 60_000,
    budget_type: 'fixed',
    rollover_cap_cents: null,
    person_id: null,
    ...over,
  }
}

describe('scopeBudgets — household scope', () => {
  it('returns the very same array reference when no budget has an owner', () => {
    const budgets = [budget(), budget({ id: 'b-2', category: 'groceries' })]
    expect(scopeBudgets(budgets, HOUSEHOLD_SCOPE)).toBe(budgets)
  })

  it('leaves an empty list alone', () => {
    const budgets: Budget[] = []
    expect(scopeBudgets(budgets, HOUSEHOLD_SCOPE)).toBe(budgets)
  })

  it('drops personal budgets so they never enter a household total', () => {
    const shared = budget({ id: 'b-shared' })
    const mine = budget({ id: 'b-mine', person_id: A })
    expect(scopeBudgets([shared, mine], HOUSEHOLD_SCOPE)).toEqual([shared])
  })
})

describe('scopeBudgets — person scope', () => {
  it('keeps only that person’s budgets', () => {
    const shared = budget({ id: 'b-shared' })
    const mine = budget({ id: 'b-mine', person_id: A })
    const theirs = budget({ id: 'b-theirs', person_id: B })
    expect(scopeBudgets([shared, mine, theirs], personScope(A))).toEqual([mine])
  })

  it('never falls back to the household limit (FR-003)', () => {
    // The whole point: a household dining allowance is sized for everyone, so
    // measuring one person's share against it repeats the spec-052 error.
    const shared = budget({ id: 'b-shared', monthly_limit_cents: 60_000 })
    expect(scopeBudgets([shared], personScope(A))).toEqual([])
  })

  it('returns a new array, never the input reference', () => {
    const budgets = [budget({ person_id: A })]
    expect(scopeBudgets(budgets, personScope(A))).not.toBe(budgets)
  })

  it('treats a missing person_id as household-owned', () => {
    // Row-boundary tolerance: a pre-migration read has no person_id column at all.
    const legacy = { ...budget(), person_id: undefined } as unknown as Budget
    expect(scopeBudgets([legacy], personScope(A))).toEqual([])
    expect(scopeBudgets([legacy], HOUSEHOLD_SCOPE)).toEqual([legacy])
  })
})
