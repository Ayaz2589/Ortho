import type { Transaction } from './types'
import { isTransfer, transferParties } from './transaction'

/**
 * Net cents owed between two household members, from the VIEWER's perspective.
 * Positive ⇒ `other` owes `viewer`; negative ⇒ `viewer` owes `other`; 0 ⇒ settled.
 *
 * - **Expense** (with a payer): every owner who is NOT the payer owes the payer
 *   that owner's share. So if `viewer` paid, `other` owes their share (+); if
 *   `other` paid, `viewer` owes their share (−). The payer's own share is owed by
 *   nobody (we only read the other party's share).
 * - **Transfer** (reimbursement): `paid_by` is the sender, the single owner is the
 *   recipient, `amount_cents` is the amount. `other → viewer` reduces what `other`
 *   owes (−); `viewer → other` reduces what `viewer` owes, i.e. raises the net (+).
 *
 * Integer cents only — no rounding. Mirrored by iOS `Balances.swift` and locked by
 * `shared/test-vectors/member-balance.json`.
 */
export function balanceBetween(
  viewer: string,
  other: string,
  transactions: Transaction[]
): number {
  let net = 0
  for (const t of transactions) {
    if (t.kind === 'expense') {
      const payer = t.paid_by
      if (!payer) continue
      if (payer === viewer) net += t.shares[other] ?? 0
      else if (payer === other) net -= t.shares[viewer] ?? 0
    } else if (isTransfer(t)) {
      const { from, to } = transferParties(t)
      if (!from || !to) continue
      if (from === other && to === viewer) net -= t.amount_cents
      else if (from === viewer && to === other) net += t.amount_cents
    }
  }
  return net
}
