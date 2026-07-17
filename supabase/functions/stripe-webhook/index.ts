// Spec 018 — Stripe webhook receiver (contracts/billing-functions.md §1).
// Deployed with verify_jwt = false (supabase/config.toml): the Stripe signature
// IS the auth. Deno REQUIRES the async verification path — sync constructEvent()
// throws "SubtleCryptoProvider cannot be used in a synchronous context".
import Stripe from 'npm:stripe@22'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { applyBillingEvent } from '../_shared/billing/machine.ts'
import type { EntitlementRow } from '../_shared/billing/normalize.ts'
import { translateStripeEvent, type StripeEventLike } from '../_shared/billing/stripe.ts'
import { json } from '../_shared/http.ts'
import { optimisticWriteLanded, RECLAIMABLE_OUTCOMES } from './idempotency.ts'

type DbEntitlement = {
  user_id: string
  status: EntitlementRow['status']
  access_expires_at: string | null
  plan: EntitlementRow['plan']
  source: EntitlementRow['source']
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  last_event_at: string | null
}

const toRow = (db: DbEntitlement): EntitlementRow => ({
  userId: db.user_id,
  status: db.status,
  accessExpiresAt: db.access_expires_at,
  plan: db.plan,
  source: db.source,
  stripeCustomerId: db.stripe_customer_id,
  stripeSubscriptionId: db.stripe_subscription_id,
  lastEventAt: db.last_event_at,
})

const toDb = (row: EntitlementRow): Omit<DbEntitlement, 'user_id'> => ({
  status: row.status,
  access_expires_at: row.accessExpiresAt,
  plan: row.plan,
  source: row.source,
  stripe_customer_id: row.stripeCustomerId,
  stripe_subscription_id: row.stripeSubscriptionId,
  last_event_at: row.lastEventAt,
})

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' })

  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')
  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')
  const priceMonthly = Deno.env.get('STRIPE_PRICE_MONTHLY') ?? ''
  const priceYearly = Deno.env.get('STRIPE_PRICE_YEARLY') ?? ''
  if (!webhookSecret || !stripeKey) return json(500, { error: 'not_configured' })

  // Pin the API version the translator's fixtures model (review 018): payload
  // shapes are version-dependent, and an unpinned client would drift under a
  // future npm:stripe bump. Keep in lockstep with the webhook ENDPOINT's pinned
  // version (quickstart.md §2.5) and the fixtures in services/billing/test.
  const stripe = new Stripe(stripeKey, { apiVersion: '2026-06-24.dahlia' })
  const cryptoProvider = Stripe.createSubtleCryptoProvider()

  // Signature verification on the RAW body — never parse first.
  const signature = req.headers.get('stripe-signature')
  const rawBody = await req.text()
  if (!signature) return json(400, { error: 'missing_signature' })

  let event: Stripe.Event
  try {
    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      signature,
      webhookSecret,
      undefined,
      cryptoProvider
    )
  } catch {
    // Unverifiable payloads are not audit data — nothing is logged (contract).
    return json(400, { error: 'invalid_signature' })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // Idempotency guard, FAILURE-AWARE (review 018): claim the event by unique
  // event_id. A conflict is only a genuine duplicate if the prior attempt
  // COMPLETED — rows still at 'received' (crashed mid-flight) or 'failed'
  // (500'd) are re-claimable, so Stripe's retry actually retries instead of
  // being dedup-swallowed forever. Terminal outcomes never re-claim.
  const { data: inserted, error: insertError } = await supabase
    .from('billing_events')
    .upsert(
      {
        provider: 'stripe',
        event_id: event.id,
        event_type: event.type,
        event_created_at: new Date(event.created * 1000).toISOString(),
        outcome: 'received',
        payload: JSON.parse(rawBody),
      },
      { onConflict: 'event_id', ignoreDuplicates: true }
    )
    .select('id')
  if (insertError) return json(500, { error: 'event_log_write_failed' })

  let eventRowId: unknown = inserted?.[0]?.id
  if (eventRowId === undefined) {
    const { data: reclaimed, error: reclaimError } = await supabase
      .from('billing_events')
      .update({ outcome: 'received' })
      .eq('event_id', event.id)
      .in('outcome', [...RECLAIMABLE_OUTCOMES])
      .select('id')
    if (reclaimError) return json(500, { error: 'event_log_write_failed' })
    if (!reclaimed || reclaimed.length === 0) {
      return json(200, { received: true, outcome: 'noop' }) // genuinely processed before
    }
    eventRowId = reclaimed[0].id
  }

  const finish = async (outcome: string, userId: string | null) => {
    await supabase
      .from('billing_events')
      .update({ outcome, user_id: userId })
      .eq('id', eventRowId)
    return json(200, { received: true, outcome })
  }

  // Every 500 must leave the event row re-claimable so the retry can succeed.
  const fail = async (reason: string) => {
    await supabase.from('billing_events').update({ outcome: 'failed' }).eq('id', eventRowId)
    return json(500, { error: reason })
  }

  try {
    // The one API fetch: checkout sessions don't carry the period end.
    let supplements: { subscription?: unknown } = {}
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session
      if (typeof session.subscription === 'string') {
        supplements = {
          subscription: await stripe.subscriptions.retrieve(session.subscription),
        }
      }
    }

    const normalized = translateStripeEvent(
      event as unknown as StripeEventLike,
      { priceMonthly, priceYearly },
      supplements
    )

    // Resolve the target user: adapter metadata first, then customer-id lookup.
    // Read errors are INFRASTRUCTURE failures → 500 + re-claimable (review 018:
    // supabase-js doesn't throw; an unchecked error here would masquerade as
    // skipped_unmatched and stop Stripe's retries on a real money event).
    let userId = normalized.userId
    if (userId === null && normalized.stripeCustomerId) {
      const { data, error: lookupError } = await supabase
        .from('entitlements')
        .select('user_id')
        .eq('stripe_customer_id', normalized.stripeCustomerId)
        .maybeSingle()
      if (lookupError) return await fail('entitlement_read_failed')
      userId = data?.user_id ?? null
    }
    if (userId === null) return await finish('skipped_unmatched', null)

    let { data: dbRow, error: rowError } = await supabase
      .from('entitlements')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()
    if (rowError) return await fail('entitlement_read_failed')

    // Paid-before-row heal (review 018): a resolved user with no entitlements
    // row (ensure_entitlement never ran, or raced) must NOT drop a money event.
    // Seed the row exactly like the RPC would, then apply the event to it.
    if (!dbRow) {
      const { error: seedError } = await supabase.from('entitlements').upsert(
        {
          user_id: userId,
          status: 'trialing',
          access_expires_at: new Date(Date.now() + 31 * 86_400_000).toISOString(),
          source: 'trial',
        },
        { onConflict: 'user_id', ignoreDuplicates: true }
      )
      if (seedError) return await fail('entitlement_seed_failed')
      const refetched = await supabase
        .from('entitlements')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle()
      if (refetched.error || !refetched.data) return await fail('entitlement_read_failed')
      dbRow = refetched.data
    }

    const outcome = applyBillingEvent(toRow(dbRow as DbEntitlement), {
      ...normalized,
      userId,
    })

    if (outcome.kind === 'applied') {
      // OPTIMISTIC write (merge review): the staleness shield in the machine
      // was evaluated against the snapshot read above, but concurrent
      // deliveries (Stripe redelivery racing a newer event; the reclaim path
      // deliberately lets both proceed) could interleave read-modify-write and
      // let an OLDER event overwrite a NEWER row. Guard the update on the
      // snapshot's last_event_at; zero rows updated ⇒ someone else won ⇒ fail
      // (500, re-claimable) so Stripe's retry re-reads the fresh row and the
      // machine re-runs — the stale event then lands as skipped_stale.
      const snapshotEventAt = (dbRow as DbEntitlement).last_event_at
      let update = supabase.from('entitlements').update(toDb(outcome.row)).eq('user_id', userId)
      update =
        snapshotEventAt === null
          ? update.is('last_event_at', null)
          : update.eq('last_event_at', snapshotEventAt)
      const { data: updated, error: updateError } = await update.select('user_id')
      if (updateError) return await fail('entitlement_write_failed')
      if (!optimisticWriteLanded(updated?.length ?? 0)) return await fail('entitlement_write_conflict')
      return await finish('applied', userId)
    }
    const detail = outcome.kind === 'noop' ? `noop:${outcome.reason}` : outcome.kind
    return await finish(detail, userId)
  } catch {
    // Genuine processing failure — mark re-claimable + 500 so Stripe's retry
    // is a real retry (review 018), not a dedup-swallowed no-op.
    return await fail('processing_failed')
  }
})
