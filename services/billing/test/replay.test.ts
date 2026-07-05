// SC-007 — the precise convergence properties from contracts/stripe-events.md:
//   P1 duplicates always converge; P2 status-carrying streams converge under ANY reordering;
//   P3 payment_failed early-arrival degrades fail-safe (noop) and the redundant
//      subscription_updated(past_due) corrects state.
import { describe, expect, it } from 'vitest'
import { applyBillingEvent, type NormalizedBillingEvent } from '../src/index'
import { mkEvent, mkRow, permutationsOf, processStream } from './helpers'

const t = (n: number) => `2026-07-${String(10 + n).padStart(2, '0')}T00:00:00Z`

// A realistic subscribe → renew → cancel life, all status-carrying (P2 set).
function statusCarryingStream(): NormalizedBillingEvent[] {
  return [
    mkEvent({
      eventId: 'evt_a1',
      type: 'checkout_completed',
      eventCreatedAt: t(0),
      periodEndsAt: '2026-08-10T00:00:00Z',
      plan: 'monthly',
      stripeCustomerId: 'cus_1',
      stripeSubscriptionId: 'sub_1',
    }),
    mkEvent({ eventId: 'evt_a2', type: 'payment_succeeded', eventCreatedAt: t(1), periodEndsAt: '2026-08-10T00:00:00Z', plan: 'monthly', stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_1' }),
    mkEvent({ eventId: 'evt_a3', type: 'subscription_updated', eventCreatedAt: t(2), status: 'active', periodEndsAt: '2027-07-12T00:00:00Z', plan: 'yearly', stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_1' }),
    // Deleted events carry the full subscription object — period end, price, ids (contract).
    mkEvent({ eventId: 'evt_a4', type: 'subscription_deleted', eventCreatedAt: t(3), periodEndsAt: '2027-07-12T00:00:00Z', plan: 'yearly', stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_1' }),
  ]
}

describe('P1 — duplicates always converge', () => {
  it('the machine itself is a second dedup layer: re-applying an applied event is stale-skipped', () => {
    // The host loop dedups by eventId (tested below); this pins the machine's own
    // guard so a dedup bypass (e.g. a re-claimed event row) still cannot double-apply.
    const paid = mkEvent({ eventId: 'evt_direct', type: 'payment_succeeded', eventCreatedAt: t(1), periodEndsAt: '2026-08-10T00:00:00Z' })
    const first = applyBillingEvent(mkRow(), paid)
    expect(first.kind).toBe('applied')
    if (first.kind !== 'applied') return
    const second = applyBillingEvent(first.row, { ...paid })
    expect(second.kind).toBe('skipped_stale')
  })

  it('duplicate invoice.paid is a dedup no-op (same eventId)', () => {
    const paid = mkEvent({ eventId: 'evt_dup', type: 'payment_succeeded', eventCreatedAt: t(1), periodEndsAt: '2026-08-10T00:00:00Z' })
    const clean = processStream(mkRow(), [paid], applyBillingEvent)
    const doubled = processStream(mkRow(), [paid, { ...paid }], applyBillingEvent)
    expect(doubled).toEqual(clean)
  })

  it('replayed checkout.session.completed converges', () => {
    const stream = statusCarryingStream()
    const clean = processStream(mkRow(), stream, applyBillingEvent)
    const replayed = processStream(
      mkRow(),
      [...stream, { ...stream[0]! }, { ...stream[2]! }],
      applyBillingEvent
    )
    expect(replayed).toEqual(clean)
  })
})

describe('P2 — status-carrying streams converge under every permutation', () => {
  const stream = statusCarryingStream()
  const clean = processStream(mkRow(), stream, applyBillingEvent)

  it('clean order ends canceled with the yearly period preserved (paid-through)', () => {
    expect(clean.status).toBe('canceled')
    expect(clean.accessExpiresAt).toBe('2027-07-12T00:00:00Z')
    expect(clean.plan).toBe('yearly')
    expect(clean.lastEventAt).toBe(t(3))
  })

  for (const [i, perm] of permutationsOf(stream).entries()) {
    it(`permutation ${i} converges`, () => {
      expect(processStream(mkRow(), perm, applyBillingEvent)).toEqual(clean)
    })
  }
})

describe('P2 fixtures mandated by the contract', () => {
  it('payment_failed AFTER the healing invoice.paid is stale-skipped', () => {
    const failed = mkEvent({ eventId: 'evt_f', type: 'payment_failed', eventCreatedAt: t(1) })
    const paid = mkEvent({ eventId: 'evt_p', type: 'payment_succeeded', eventCreatedAt: t(2), periodEndsAt: '2026-08-10T00:00:00Z' })
    const base = mkRow({ status: 'active', source: 'stripe', accessExpiresAt: '2026-07-10T00:00:00Z' })
    const clean = processStream(base, [failed, paid], applyBillingEvent)
    const reordered = processStream(base, [paid, failed], applyBillingEvent)
    expect(clean.status).toBe('active')
    expect(reordered).toEqual(clean)
  })

  it('subscription_deleted before a LATE subscription_updated: newest created wins either way', () => {
    const updated = mkEvent({ eventId: 'evt_u', type: 'subscription_updated', eventCreatedAt: t(1), status: 'active', periodEndsAt: '2026-08-10T00:00:00Z', plan: 'monthly', stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_1' })
    const deleted = mkEvent({ eventId: 'evt_d', type: 'subscription_deleted', eventCreatedAt: t(2), periodEndsAt: '2026-08-10T00:00:00Z', plan: 'monthly', stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_1' })
    const base = mkRow({ status: 'active', source: 'stripe' })
    const clean = processStream(base, [updated, deleted], applyBillingEvent)
    const reordered = processStream(base, [deleted, updated], applyBillingEvent)
    expect(clean.status).toBe('canceled')
    expect(reordered).toEqual(clean)
  })

  it('admin row through the full subscribe-fail-cancel stream: only reference ids move', () => {
    const admin = mkRow({ status: 'admin', accessExpiresAt: null, source: 'operator' })
    const stream = [
      ...statusCarryingStream(),
      mkEvent({ eventId: 'evt_a5', type: 'payment_failed', eventCreatedAt: t(4) }),
    ]
    const final = processStream(admin, stream, applyBillingEvent)
    expect(final.status).toBe('admin')
    expect(final.accessExpiresAt).toBeNull()
    expect(final.plan).toBeNull()
    expect(final.source).toBe('operator')
    expect(final.stripeCustomerId).toBe('cus_1')
    expect(final.stripeSubscriptionId).toBe('sub_1')
  })
})

describe('P3 — payment_failed early arrival is fail-safe and corrected', () => {
  it('early failure noops (user keeps access), redundant subscription_updated(past_due) corrects', () => {
    const failed = mkEvent({ eventId: 'evt_pf', type: 'payment_failed', eventCreatedAt: t(3) })
    const checkout = mkEvent({
      eventId: 'evt_co',
      type: 'checkout_completed',
      eventCreatedAt: t(0),
      periodEndsAt: '2026-08-10T00:00:00Z',
      plan: 'monthly',
      stripeCustomerId: 'cus_1',
      stripeSubscriptionId: 'sub_1',
    })
    const authoritative = mkEvent({ eventId: 'evt_su', type: 'subscription_updated', eventCreatedAt: t(4), status: 'past_due', periodEndsAt: '2026-08-10T00:00:00Z', plan: 'monthly' })

    // Worst-case arrival order: failure first, against a fresh trialing row.
    const out1 = applyBillingEvent(mkRow(), failed)
    expect(out1.kind).toBe('noop') // fail-safe: no lapse, no state invented

    const final = processStream(mkRow(), [failed, checkout, authoritative], applyBillingEvent)
    expect(final.status).toBe('past_due') // corrected by the authoritative carrier
    expect(final.accessExpiresAt).toBe('2026-08-10T00:00:00Z')
  })
})
