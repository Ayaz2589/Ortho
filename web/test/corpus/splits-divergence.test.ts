import { describe, it, expect } from 'vitest'
import { computeShares } from '@/lib/splits'
import { generateCorpus } from './generate'
import { byCanonical, bySortOrder } from './ordering'
import type { Person } from '@/lib/types'

// A4 reproduction (spec 026, FR-007 / SC-005). The import CLI orders split owners
// by household_people.sort_order (import/db/lookups.ts `.order('sort_order')`),
// while the app canonicalizes by lexical id (orderedOwnerIds). computeShares hands
// the leftover cent to owners[0], so when the two orderings disagree the leftover
// cent lands on a DIFFERENT person for imported vs app-created splits. This test
// makes that divergence observable; the fix (unify on one order) is §9.4.

const corpus = generateCorpus()

/** The owner who received the odd leftover cent = the max share for an even split. */
function leftoverRecipient(shares: Record<string, number>): string {
  return Object.entries(shares).sort((a, b) => b[1] - a[1])[0][0]
}

describe('A4 — split leftover-cent divergence (sort_order vs lexical id)', () => {
  const scenario = corpus.scenarios.find((s) => s.label === 'order-mismatch-a4')!
  const gt = scenario.transactions.find((t) => t.intent.includes('leftover-cent'))!
  const ownerIds = gt.transaction.owner_ids
  const people = scenario.people.filter((p) => ownerIds.includes(p.id))

  it('the two orderings actually disagree for this household', () => {
    expect(byCanonical(ownerIds)).not.toEqual(bySortOrder(people))
  })

  it('the leftover cent lands on a DIFFERENT person under the CLI ordering', () => {
    const amount = gt.transaction.amount_cents
    expect(amount % 2).toBe(1) // odd → exactly one leftover cent across 2 owners

    const appShares = computeShares(amount, byCanonical(ownerIds), { method: 'even' })
    const cliShares = computeShares(amount, bySortOrder(people), { method: 'even' })

    const appRecipient = leftoverRecipient(appShares)
    const cliRecipient = leftoverRecipient(cliShares)

    expect(appRecipient).not.toBe(cliRecipient) // ← the divergence (A4)

    // The stored corpus row uses the app-canonical ordering (faithful to the app).
    expect(gt.transaction.owner_ids).toEqual(byCanonical(ownerIds))
    expect(leftoverRecipient(gt.transaction.shares)).toBe(appRecipient)
  })
})

describe('A4 — control: an aligned-order household does NOT diverge', () => {
  // A household whose sort_order matches lexical id order: both orderings agree,
  // so the leftover-cent recipient is identical — proving the divergence is
  // specific to the mismatched household, not universal.
  const aligned = corpus.scenarios.find(
    (s) => s.label === 'joint-even-usd'
  )!
  const people: Person[] = aligned.people
  const ids = people.map((p) => p.id)

  it('sort_order order equals lexical order for the aligned household', () => {
    expect(bySortOrder(people)).toEqual(byCanonical(ids))
  })

  it('leftover-cent recipient is the same under both orderings', () => {
    const amount = 1001 // odd leftover across 2 owners
    const appShares = computeShares(amount, byCanonical(ids), { method: 'even' })
    const cliShares = computeShares(amount, bySortOrder(people), { method: 'even' })
    expect(leftoverRecipient(appShares)).toBe(leftoverRecipient(cliShares))
  })
})
