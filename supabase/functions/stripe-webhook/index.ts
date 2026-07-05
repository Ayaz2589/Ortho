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

  const stripe = new Stripe(stripeKey)
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

  // Idempotency guard: unique event_id insert-first; conflict ⇒ already processed.
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
  if (!inserted || inserted.length === 0) {
    return json(200, { received: true, outcome: 'noop' }) // duplicate delivery
  }
  const eventRowId = inserted[0].id

  const finish = async (outcome: string, userId: string | null) => {
    await supabase
      .from('billing_events')
      .update({ outcome, user_id: userId })
      .eq('id', eventRowId)
    return json(200, { received: true, outcome })
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
    let userId = normalized.userId
    if (userId === null && normalized.stripeCustomerId) {
      const { data } = await supabase
        .from('entitlements')
        .select('user_id')
        .eq('stripe_customer_id', normalized.stripeCustomerId)
        .maybeSingle()
      userId = data?.user_id ?? null
    }
    if (userId === null) return await finish('skipped_unmatched', null)

    const { data: dbRow } = await supabase
      .from('entitlements')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()
    if (!dbRow) return await finish('skipped_unmatched', userId)

    const outcome = applyBillingEvent(toRow(dbRow as DbEntitlement), {
      ...normalized,
      userId,
    })

    if (outcome.kind === 'applied') {
      const { error: updateError } = await supabase
        .from('entitlements')
        .update(toDb(outcome.row))
        .eq('user_id', userId)
      if (updateError) return json(500, { error: 'entitlement_write_failed' })
      return await finish('applied', userId)
    }
    const detail = outcome.kind === 'noop' ? `noop:${outcome.reason}` : outcome.kind
    return await finish(detail, userId)
  } catch {
    // Genuine processing failure — 500 so Stripe retries (dedup makes that safe).
    return json(500, { error: 'processing_failed' })
  }
})
