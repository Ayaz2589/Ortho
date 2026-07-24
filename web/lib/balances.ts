import type { Transaction, Person } from './types'
import { isTransfer, transferParties } from './transaction'

/** One canonical balance entry for an unordered pair in a multi-member household.
 *  `a < b` lexicographically by person ID.
 *  `netCents > 0` → b owes a; `netCents < 0` → a owes b. */
export interface PairBalance {
  a: string
  b: string
  netCents: number
}

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
    } else if (t.kind === 'income') {
      // Income with a designated recipient and multiple owners creates balances
      // identical in sign to expenses: the recipient holds money on behalf of
      // all owners, so non-recipients owe the recipient their share.
      const recipient = t.paid_by
      if (!recipient || t.owner_ids.length < 2) continue
      if (recipient === viewer) net += t.shares[other] ?? 0
      else if (recipient === other) net -= t.shares[viewer] ?? 0
    } else if (isTransfer(t)) {
      const { from, to } = transferParties(t)
      if (!from || !to) continue
      if (from === other && to === viewer) net -= t.amount_cents
      else if (from === viewer && to === other) net += t.amount_cents
    }
  }
  return net
}

/** All non-zero pairwise balances for a household.
 *  Each pair appears once with `a < b` (lexicographic ID order).
 *  Suitable for dashboard display: iterate pairs, display from each member's perspective. */
export function allPairBalances(people: Person[], transactions: Transaction[]): PairBalance[] {
  if (people.length < 2) return []
  const result: PairBalance[] = []
  for (let i = 0; i < people.length; i++) {
    for (let j = i + 1; j < people.length; j++) {
      const [lo, hi] = people[i].id < people[j].id ? [people[i], people[j]] : [people[j], people[i]]
      const net = balanceBetween(lo.id, hi.id, transactions)
      if (net !== 0) result.push({ a: lo.id, b: hi.id, netCents: net })
    }
  }
  return result
}

/** Minimum set of directed transfers that clears all debts in the household.
 *  Uses a greedy creditor/debtor matching (Splitwise algorithm), O(n²).
 *  Only meaningful for 3+ person households; two-person result equals the input pair. */
export function simplifyDebts(
  pairs: PairBalance[],
  people: Person[]
): Array<{ from: string; to: string; amountCents: number }> {
  if (pairs.length === 0) return []

  // Compute net balance per person: positive = net creditor, negative = net debtor.
  const net = new Map<string, number>()
  for (const p of people) net.set(p.id, 0)
  for (const pair of pairs) {
    // pair.netCents > 0 → b owes a → a is +, b is -
    net.set(pair.a, (net.get(pair.a) ?? 0) + pair.netCents)
    net.set(pair.b, (net.get(pair.b) ?? 0) - pair.netCents)
  }

  // Split into creditors (net > 0) and debtors (net < 0), sorted by ID for determinism.
  const creditors = [...net.entries()].filter(([, v]) => v > 0).sort((a, b) => a[0].localeCompare(b[0]))
  const debtors = [...net.entries()].filter(([, v]) => v < 0).sort((a, b) => a[0].localeCompare(b[0]))

  const result: Array<{ from: string; to: string; amountCents: number }> = []
  let ci = 0
  let di = 0
  while (ci < creditors.length && di < debtors.length) {
    const [credId, credAmt] = creditors[ci]
    const [debtId, debtAmt] = debtors[di]
    const amount = Math.min(credAmt, -debtAmt)
    result.push({ from: debtId, to: credId, amountCents: amount })
    creditors[ci] = [credId, credAmt - amount]
    debtors[di] = [debtId, debtAmt + amount]
    if (creditors[ci][1] === 0) ci++
    if (debtors[di][1] === 0) di++
  }
  return result
}
