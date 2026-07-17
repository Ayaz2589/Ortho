// Pure idempotency / ordering seams for the webhook host glue, extracted so the
// security-critical dedup predicate and the optimistic-write conflict rule are
// named, documented, and regression-locked (review 018 + full-review coverage
// finding). The host wiring around them still needs a Deno+DB integration test to
// cover fully, but these two decisions are where a silent double-apply or a
// permanently-dropped money event would be reintroduced by a careless refactor.

/**
 * The outcomes a conflicting `billing_events` row may be RE-CLAIMED from on a
 * Stripe retry: 'received' (a prior attempt crashed mid-flight) or 'failed' (it
 * 500'd). Any TERMINAL outcome — applied / skipped_stale / skipped_unmatched /
 * noop — must NOT re-claim, or a genuine duplicate delivery would be reprocessed
 * and could double-apply a money event.
 */
export const RECLAIMABLE_OUTCOMES = ['received', 'failed'] as const

export function isReclaimableOutcome(outcome: string): boolean {
  return (RECLAIMABLE_OUTCOMES as readonly string[]).includes(outcome)
}

/**
 * Interpret the optimistic guarded UPDATE (`… where last_event_at = snapshot`).
 * Zero rows updated ⇒ a concurrent delivery won the read-modify-write race ⇒ this
 * write must NOT count as applied; the caller returns a conflict (500,
 * re-claimable) so Stripe's retry re-reads the fresh row and the stale event then
 * lands as skipped_stale. Any positive count means our snapshot was still current
 * and the write landed.
 */
export function optimisticWriteLanded(rowsAffected: number): boolean {
  return rowsAffected > 0
}
