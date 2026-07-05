import { describe, expect, it } from 'vitest'
import { applyBillingEvent } from '../src/index'
import { mkEvent, mkRow } from './helpers'

describe('guard order', () => {
  it('unmatched: null row → skipped_unmatched', () => {
    expect(applyBillingEvent(null, mkEvent()).kind).toBe('skipped_unmatched')
  })

  it('unmatched: event with null userId → skipped_unmatched even with a row', () => {
    expect(applyBillingEvent(mkRow(), mkEvent({ userId: null })).kind).toBe('skipped_unmatched')
  })

  it('stale: eventCreatedAt strictly older than lastEventAt → skipped_stale', () => {
    const row = mkRow({ lastEventAt: '2026-07-10T00:00:00Z' })
    const out = applyBillingEvent(row, mkEvent({ eventCreatedAt: '2026-07-09T23:59:59Z' }))
    expect(out.kind).toBe('skipped_stale')
  })

  it('stale: eventCreatedAt equal to lastEventAt → skipped_stale (documented <= edge)', () => {
    const row = mkRow({ lastEventAt: '2026-07-10T00:00:00Z' })
    const out = applyBillingEvent(row, mkEvent({ eventCreatedAt: '2026-07-10T00:00:00Z' }))
    expect(out.kind).toBe('skipped_stale')
  })

  it('admin-wins: status/expiry/plan untouched; only reference ids + lastEventAt update', () => {
    const row = mkRow({
      status: 'admin',
      accessExpiresAt: null,
      plan: null,
      source: 'operator',
    })
    const out = applyBillingEvent(
      row,
      mkEvent({
        type: 'subscription_updated',
        status: 'canceled',
        periodEndsAt: '2026-09-01T00:00:00Z',
        plan: 'yearly',
        stripeCustomerId: 'cus_1',
        stripeSubscriptionId: 'sub_1',
        eventCreatedAt: '2026-07-11T00:00:00Z',
      })
    )
    expect(out.kind).toBe('applied')
    if (out.kind !== 'applied') return
    expect(out.row.status).toBe('admin')
    expect(out.row.accessExpiresAt).toBeNull()
    expect(out.row.plan).toBeNull()
    expect(out.row.source).toBe('operator')
    expect(out.row.stripeCustomerId).toBe('cus_1')
    expect(out.row.stripeSubscriptionId).toBe('sub_1')
    expect(out.row.lastEventAt).toBe('2026-07-11T00:00:00Z')
  })
})

describe('transitions', () => {
  it('checkout_completed: trialing → active with period end, plan, ids, source=stripe', () => {
    const out = applyBillingEvent(
      mkRow(),
      mkEvent({
        type: 'checkout_completed',
        periodEndsAt: '2026-08-10T00:00:00Z',
        plan: 'monthly',
        stripeCustomerId: 'cus_1',
        stripeSubscriptionId: 'sub_1',
        eventCreatedAt: '2026-07-10T00:00:00Z',
      })
    )
    expect(out.kind).toBe('applied')
    if (out.kind !== 'applied') return
    expect(out.row).toMatchObject({
      status: 'active',
      accessExpiresAt: '2026-08-10T00:00:00Z',
      plan: 'monthly',
      source: 'stripe',
      stripeCustomerId: 'cus_1',
      stripeSubscriptionId: 'sub_1',
      lastEventAt: '2026-07-10T00:00:00Z',
    })
  })

  it('checkout_completed without a period end → noop (defensive)', () => {
    const out = applyBillingEvent(mkRow(), mkEvent({ type: 'checkout_completed' }))
    expect(out.kind).toBe('noop')
  })

  it('payment_succeeded: extends expiry, sets active, heals past_due', () => {
    const row = mkRow({ status: 'past_due', accessExpiresAt: '2026-07-01T00:00:00Z', source: 'stripe' })
    const out = applyBillingEvent(
      row,
      mkEvent({ type: 'payment_succeeded', periodEndsAt: '2026-08-01T00:00:00Z' })
    )
    expect(out.kind).toBe('applied')
    if (out.kind !== 'applied') return
    expect(out.row.status).toBe('active')
    expect(out.row.accessExpiresAt).toBe('2026-08-01T00:00:00Z')
  })

  it('payment_succeeded heals canceled (resubscribe) and fills ids/plan when present', () => {
    const row = mkRow({ status: 'canceled', source: 'stripe' })
    const out = applyBillingEvent(
      row,
      mkEvent({
        type: 'payment_succeeded',
        periodEndsAt: '2026-08-01T00:00:00Z',
        plan: 'yearly',
        stripeCustomerId: 'cus_9',
        stripeSubscriptionId: 'sub_9',
      })
    )
    expect(out.kind).toBe('applied')
    if (out.kind !== 'applied') return
    expect(out.row).toMatchObject({ status: 'active', plan: 'yearly', stripeSubscriptionId: 'sub_9' })
  })

  it('payment_succeeded without period end → noop (defensive)', () => {
    expect(applyBillingEvent(mkRow(), mkEvent({ type: 'payment_succeeded' })).kind).toBe('noop')
  })

  it('payment_failed: active → past_due, expiry untouched (FR-020)', () => {
    const row = mkRow({ status: 'active', accessExpiresAt: '2026-07-20T00:00:00Z', source: 'stripe' })
    const out = applyBillingEvent(row, mkEvent({ type: 'payment_failed' }))
    expect(out.kind).toBe('applied')
    if (out.kind !== 'applied') return
    expect(out.row.status).toBe('past_due')
    expect(out.row.accessExpiresAt).toBe('2026-07-20T00:00:00Z')
  })

  it('payment_failed: past_due stays past_due (retry events keep arriving)', () => {
    const row = mkRow({ status: 'past_due', source: 'stripe' })
    expect(applyBillingEvent(row, mkEvent({ type: 'payment_failed' })).kind).toBe('applied')
  })

  it('payment_failed on trialing/canceled/paused/unpaid → noop (never lapses anyone by itself)', () => {
    for (const status of ['trialing', 'canceled', 'paused', 'unpaid'] as const) {
      const out = applyBillingEvent(mkRow({ status }), mkEvent({ type: 'payment_failed' }))
      expect(out.kind, `status=${status}`).toBe('noop')
    }
  })

  it('subscription_updated: overwrites status/expiry/plan (portal plan switch lands here)', () => {
    const row = mkRow({ status: 'active', plan: 'monthly', source: 'stripe' })
    const out = applyBillingEvent(
      row,
      mkEvent({
        type: 'subscription_updated',
        status: 'active',
        periodEndsAt: '2027-07-10T00:00:00Z',
        plan: 'yearly',
      })
    )
    expect(out.kind).toBe('applied')
    if (out.kind !== 'applied') return
    expect(out.row.plan).toBe('yearly')
    expect(out.row.accessExpiresAt).toBe('2027-07-10T00:00:00Z')
  })

  it('subscription_updated without a mapped status → noop (incomplete* filtered upstream)', () => {
    expect(applyBillingEvent(mkRow(), mkEvent({ type: 'subscription_updated' })).kind).toBe('noop')
  })

  it('subscription_deleted without periodEndsAt: → canceled, expiry UNCHANGED (paid-through governs)', () => {
    const row = mkRow({ status: 'active', accessExpiresAt: '2026-08-01T00:00:00Z', source: 'stripe' })
    const out = applyBillingEvent(row, mkEvent({ type: 'subscription_deleted' }))
    expect(out.kind).toBe('applied')
    if (out.kind !== 'applied') return
    expect(out.row.status).toBe('canceled')
    expect(out.row.accessExpiresAt).toBe('2026-08-01T00:00:00Z')
  })

  it('subscription_deleted WITH periodEndsAt: → canceled at the carried paid-through instant', () => {
    const row = mkRow({ status: 'active', accessExpiresAt: '2026-08-01T00:00:00Z', source: 'stripe' })
    const out = applyBillingEvent(
      row,
      mkEvent({ type: 'subscription_deleted', periodEndsAt: '2026-08-15T00:00:00Z', plan: 'monthly' })
    )
    expect(out.kind).toBe('applied')
    if (out.kind !== 'applied') return
    expect(out.row.status).toBe('canceled')
    expect(out.row.accessExpiresAt).toBe('2026-08-15T00:00:00Z')
    expect(out.row.plan).toBe('monthly')
  })

  it('subscription_paused: → paused, expiry unchanged', () => {
    const out = applyBillingEvent(mkRow({ status: 'active' }), mkEvent({ type: 'subscription_paused' }))
    expect(out.kind).toBe('applied')
    if (out.kind !== 'applied') return
    expect(out.row.status).toBe('paused')
  })

  it('trial_will_end and unrecognized → noop', () => {
    expect(applyBillingEvent(mkRow(), mkEvent({ type: 'trial_will_end' })).kind).toBe('noop')
    expect(applyBillingEvent(mkRow(), mkEvent({ type: 'unrecognized' })).kind).toBe('noop')
  })

  it('noop and skipped outcomes never mutate the input row (purity)', () => {
    const row = mkRow()
    const before = JSON.stringify(row)
    applyBillingEvent(row, mkEvent({ type: 'trial_will_end' }))
    applyBillingEvent(row, mkEvent({ userId: null }))
    applyBillingEvent(row, mkEvent({ type: 'checkout_completed' }))
    expect(JSON.stringify(row)).toBe(before)
  })

  it('applied outcome returns a NEW row object (input untouched)', () => {
    const row = mkRow({ status: 'active', source: 'stripe' })
    const out = applyBillingEvent(row, mkEvent({ type: 'payment_failed' }))
    expect(out.kind).toBe('applied')
    if (out.kind !== 'applied') return
    expect(out.row).not.toBe(row)
    expect(row.status).toBe('active')
  })
})
