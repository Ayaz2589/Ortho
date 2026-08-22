// spec 043 US2 — pure per-person aggregation for the dashboard individual-member
// view. Reuses the golden-locked split math (`effectiveShares`) for a person's
// portion of shared purchases and the transfer helpers for money moved between
// members. All integer cents; pure and deterministic over a half-open [start,end)
// window (matching NetSummaryHero / SavingsTrendsBody bucketing).

import type { Transaction } from '@/lib/types'
import { effectiveShares } from '@/lib/format'
import { isTransfer, transferParties } from '@/lib/transaction'

export interface PersonSummary {
  /** Cents of income attributed to the person over the period. */
  income: number
  /** Cents = the person's share of expense splits over the period (their portion, not the full amount). */
  expenses: number
  /** Cents received as transfers over the period. */
  transfersReceived: number
  /** Cents sent as transfers over the period. */
  transfersSent: number
  /** income − expenses + transfersReceived − transfersSent. */
  net: number
}

/**
 * Aggregate one household member's money picture over `[start, end)`:
 * their income share, their share of shared expenses, and net transfers.
 */
export function personSummary(
  transactions: Transaction[],
  personId: string,
  start: Date,
  end: Date
): PersonSummary {
  const startMs = start.getTime()
  const endMs = end.getTime()
  let income = 0
  let expenses = 0
  let transfersReceived = 0
  let transfersSent = 0

  for (const tx of transactions) {
    const ms = new Date(tx.date).getTime()
    if (ms < startMs || ms >= endMs) continue

    if (tx.kind === 'income') {
      if (tx.owner_ids.includes(personId)) income += effectiveShares(tx)[personId] ?? 0
    } else if (tx.kind === 'expense') {
      if (tx.owner_ids.includes(personId)) expenses += effectiveShares(tx)[personId] ?? 0
    } else if (isTransfer(tx)) {
      const { from, to } = transferParties(tx)
      if (to === personId) transfersReceived += tx.amount_cents
      if (from === personId) transfersSent += tx.amount_cents
    }
  }

  const net = income - expenses + transfersReceived - transfersSent
  return { income, expenses, transfersReceived, transfersSent, net }
}
