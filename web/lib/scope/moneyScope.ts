// MoneyScope (spec 051) — the PEOPLE axis, sibling to the existing time axis
// (`DashboardScopeContext`). Pure, deterministic, side-effect free; no React, no DB,
// integer USD cents throughout — same contract as lib/finance/*.
//
// The attribution rule itself is not new: personSummary.ts (spec 043) already narrows a
// shared transaction to one person's stored share. This module generalizes that loop into
// a reusable projection so budgets, planning, insights and financial health can all ask
// "whose money is this?" the same way.
//
// Contract: specs/051-person-scoped-engines/spec.md.

import type { Transaction } from '../types'
import { effectiveShares } from '../format'
import { isTransfer, transferParties } from '../transaction'

export type MoneyScope =
  | { kind: 'household' }
  | { kind: 'person'; personId: string }

/** The whole household — the app's default and a strict no-op for projection. */
export const HOUSEHOLD_SCOPE: MoneyScope = { kind: 'household' }

/** Scope to exactly one household person. */
export function personScope(personId: string): MoneyScope {
  return { kind: 'person', personId }
}

export function isHouseholdScope(scope: MoneyScope): boolean {
  return scope.kind === 'household'
}

/**
 * Project one transaction into a person's view, or `null` when it isn't theirs.
 *
 * - `expense` / `income` — included only if the person owns a share; the amount becomes
 *   their STORED share cents (never a recomputed split, so an uneven split survives).
 * - `transfer` — directional, never co-owned: included at its FULL amount when the person
 *   is the sender or the recipient, and dropped otherwise.
 */
function projectForPerson(tx: Transaction, personId: string): Transaction | null {
  if (isTransfer(tx)) {
    const { from, to } = transferParties(tx)
    return from === personId || to === personId ? tx : null
  }

  if (!tx.owner_ids.includes(personId)) return null
  const share = effectiveShares(tx)[personId]
  if (share == null) return null

  // A new object every time — callers (and React memos) must never observe a mutated input.
  return {
    ...tx,
    amount_cents: share,
    owner_ids: [personId],
    shares: { [personId]: share },
  }
}

/**
 * Narrow a ledger to a scope.
 *
 * Household scope returns the SAME array reference — both so the no-op is free and so
 * consumers can cheaply detect it. That identity is asserted by test/scope/moneyScope.test.ts
 * and is what keeps every existing golden vector byte-identical (FR-006).
 */
export function scopeTransactions(txs: Transaction[], scope: MoneyScope): Transaction[] {
  if (scope.kind === 'household') return txs
  const out: Transaction[] = []
  for (const tx of txs) {
    const projected = projectForPerson(tx, scope.personId)
    if (projected) out.push(projected)
  }
  return out
}

/**
 * Resolve a possibly-stale scope against the current roster. A scope pointing at a removed
 * or unknown person falls back to the household rather than emptying the app (FR-012).
 */
export function resolveScope(scope: MoneyScope, activePersonIds: readonly string[]): MoneyScope {
  if (scope.kind === 'household') return HOUSEHOLD_SCOPE
  return activePersonIds.includes(scope.personId) ? scope : HOUSEHOLD_SCOPE
}
