// Household balances (spec 053) — who owes whom, for THREE OR MORE people.
//
// Migration 20260618120000 added `paid_by` and the `transfer` kind for exactly this:
// "so a running 'who owes whom' balance is computable and settle-up reimbursements can be
// logged." Spec 043 then deleted the calculation as broken. The reason it was broken is
// worth not repeating: the old `balanceBetween(viewer, other, …)` was VIEWER-ANCHORED, so in
// a three-adult household what one roommate owed another was invisible to the third —
// correct for two people, wrong for Ortho's target household of 2–4 adults.
//
// This rebuild keeps the pairwise rules byte-identical (locked by the restored nine cases in
// shared/test-vectors/member-balance.json) and adds the matrix the old version could not
// express, plus income balance effects.
//
// Pure, deterministic, side-effect free; integer USD cents, no rounding anywhere. Balances
// span ALL transactions — they are a standing position, not a monthly figure, and are never
// narrowed by the dashboard's time scope.

import type { Transaction } from '../types'
import { isTransfer, transferParties } from '../transaction'

export interface PairBalance {
  /** The creditor — owed money. */
  fromId: string
  /** The debtor — owes money. */
  toId: string
  /** Always POSITIVE: what `toId` owes `fromId`, in integer cents. */
  amountCents: number
}

/**
 * Net integer cents between an ordered pair, from `a`'s perspective.
 * Positive ⇒ `b` owes `a`. Negative ⇒ `a` owes `b`. Zero ⇒ settled.
 *
 * - **Expense** — every owner who is not the payer owes the payer that owner's share. The
 *   payer's own share is owed by nobody (we only ever read the OTHER party's share), which
 *   is also why a payer who owns nothing is still owed in full.
 * - **Income** (spec 053 FR-011) — the mirror. When one person RECEIVES money that is
 *   co-owned, the recipient owes each co-owner their share. `paid_by` carries the recipient
 *   for income, exactly as it carries the payer for an expense.
 * - **Transfer** — a settlement. `paid_by` is the sender, `owner_ids[0]` the recipient.
 * - **No payer** — contributes nothing. Historical rows predate payer capture, and inventing
 *   a payer for them would fabricate debts (FR-012).
 */
export function balanceBetween(a: string, b: string, transactions: Transaction[]): number {
  let net = 0
  for (const t of transactions) {
    if (t.kind === 'expense') {
      const payer = t.paid_by
      if (!payer) continue
      if (payer === a) net += t.shares[b] ?? 0
      else if (payer === b) net -= t.shares[a] ?? 0
    } else if (t.kind === 'income') {
      // Sign is inverted against the expense case: receiving co-owned money creates a debt
      // TO the co-owners rather than a claim on them.
      const recipient = t.paid_by
      if (!recipient) continue
      if (recipient === a) net -= t.shares[b] ?? 0
      else if (recipient === b) net += t.shares[a] ?? 0
    } else if (isTransfer(t)) {
      const { from, to } = transferParties(t)
      if (!from || !to) continue
      if (from === b && to === a) net -= t.amount_cents
      else if (from === a && to === b) net += t.amount_cents
    }
  }
  return net
}

/**
 * Every ordered pair's net position. `matrix.get(a)!.get(b)` is what `b` owes `a`.
 *
 * Antisymmetric by construction — each unordered pair is computed once and negated for the
 * mirror, so `matrix[a][b] === -matrix[b][a]` can never drift (FR-008).
 */
export function allPairBalances(
  personIds: readonly string[],
  transactions: Transaction[]
): Map<string, Map<string, number>> {
  const ids = [...new Set(personIds)]
  const matrix = new Map<string, Map<string, number>>()
  for (const id of ids) matrix.set(id, new Map())

  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = ids[i]
      const b = ids[j]
      const net = balanceBetween(a, b, transactions)
      matrix.get(a)!.set(b, net)
      matrix.get(b)!.set(a, -net)
    }
  }
  return matrix
}

/**
 * Every person referenced anywhere in the ledger — as an owner, a payer, or a transfer
 * party. Deliberately NOT limited to active people: a removed member's outstanding balance
 * must stay visible so it can still be settled (FR-015).
 */
export function peopleInLedger(transactions: readonly Transaction[]): string[] {
  const ids = new Set<string>()
  for (const t of transactions) {
    for (const id of t.owner_ids) ids.add(id)
    if (t.paid_by) ids.add(t.paid_by)
  }
  return [...ids]
}

/**
 * The non-zero balances, one row per unordered pair, creditor first.
 *
 * Sorted by amount descending then by id, so the list is stable across renders and the
 * largest outstanding debt reads first. Every household member sees the same list — including
 * pairs they are not part of, which is the whole point of the rebuild (FR-013).
 */
export function outstandingBalances(
  personIds: readonly string[],
  transactions: Transaction[]
): PairBalance[] {
  const ids = [...new Set(personIds)]
  const out: PairBalance[] = []

  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = ids[i]
      const b = ids[j]
      const net = balanceBetween(a, b, transactions)
      if (net === 0) continue
      // Normalize to a positive amount so the row always reads "{debtor} owes {creditor}".
      out.push(
        net > 0
          ? { fromId: a, toId: b, amountCents: net }
          : { fromId: b, toId: a, amountCents: -net }
      )
    }
  }

  return out.sort(
    (x, y) =>
      y.amountCents - x.amountCents ||
      x.fromId.localeCompare(y.fromId) ||
      x.toId.localeCompare(y.toId)
  )
}
