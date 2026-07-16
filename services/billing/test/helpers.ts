import type { EntitlementRow, NormalizedBillingEvent } from '../src/index'

export function mkRow(overrides: Partial<EntitlementRow> = {}): EntitlementRow {
  return {
    userId: 'user-1',
    status: 'trialing',
    accessExpiresAt: '2026-08-05T12:00:00Z',
    plan: null,
    source: 'trial',
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    lastEventAt: null,
    ...overrides,
  }
}

let eventSeq = 0

export function mkEvent(
  overrides: Partial<NormalizedBillingEvent> = {}
): NormalizedBillingEvent {
  eventSeq += 1
  return {
    eventId: `evt_${String(eventSeq).padStart(4, '0')}`,
    provider: 'stripe',
    type: 'payment_succeeded',
    eventCreatedAt: '2026-07-10T00:00:00Z',
    userId: 'user-1',
    ...overrides,
  }
}

/**
 * Simulates the webhook host loop: dedup by eventId first (billing_events unique insert),
 * then machine; only 'applied' outcomes replace the row.
 */
export function processStream(
  initial: EntitlementRow,
  events: NormalizedBillingEvent[],
  apply: (row: EntitlementRow, ev: NormalizedBillingEvent) => { kind: string; row?: EntitlementRow }
): EntitlementRow {
  const seen = new Set<string>()
  let row = initial
  for (const ev of events) {
    if (seen.has(ev.eventId)) continue
    seen.add(ev.eventId)
    const out = apply(row, ev)
    if (out.kind === 'applied' && out.row) row = out.row
  }
  return row
}

/** Deterministic permutations — no randomness (Constitution VI: deterministic tests). */
export function permutationsOf<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items]
  const result: T[][] = []
  items.forEach((item, i) => {
    const rest = [...items.slice(0, i), ...items.slice(i + 1)]
    for (const perm of permutationsOf(rest)) result.push([item, ...perm])
  })
  return result
}
