// Spec 018 — create a Stripe Checkout session (contracts/billing-functions.md §2).
// verify_jwt stays ON; the function additionally resolves the caller via getUser()
// and acts ONLY for that user — the user id NEVER comes from the request body.
import Stripe from 'npm:stripe@22'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { errorResponse, json, preflight, requiredEnv } from '../_shared/http.ts'

Deno.serve(async (req) => {
  const pre = preflight(req)
  if (pre) return pre
  if (req.method !== 'POST') return errorResponse('invalid_request')

  const env = requiredEnv(
    'STRIPE_SECRET_KEY',
    'STRIPE_PRICE_MONTHLY',
    'STRIPE_PRICE_YEARLY',
    'APP_BASE_URL',
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY'
  )
  if (!env) return errorResponse('not_configured')

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return errorResponse('unauthenticated')
  const authed = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })
  const {
    data: { user },
  } = await authed.auth.getUser()
  if (!user) return errorResponse('unauthenticated')

  let plan: unknown
  try {
    plan = (await req.json())?.plan
  } catch {
    return errorResponse('invalid_request')
  }
  if (plan !== 'monthly' && plan !== 'yearly') return errorResponse('invalid_request')
  const price = plan === 'monthly' ? env.STRIPE_PRICE_MONTHLY : env.STRIPE_PRICE_YEARLY

  // Make sure the entitlement row exists BEFORE creating any Stripe objects —
  // and fail loudly if it can't (review 018): a checkout whose webhook events
  // later find no row would depend entirely on the webhook's seed path.
  const { error: ensureError } = await authed.rpc('ensure_entitlement')
  if (ensureError) return errorResponse('provider_error')

  const service = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
  // Pinned in lockstep with the webhook + translator fixtures (review 018).
  const stripe = new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: '2026-06-24.dahlia' })

  try {
    // Get-or-create the Stripe customer; store the mapping only if still unset
    // (guarded update — never clobber an existing mapping on a race).
    const { data: row } = await service
      .from('entitlements')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .maybeSingle()

    let customerId = row?.stripe_customer_id as string | null | undefined
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        metadata: { user_id: user.id },
      })
      customerId = customer.id
      await service
        .from('entitlements')
        .update({ stripe_customer_id: customerId })
        .eq('user_id', user.id)
        .is('stripe_customer_id', null)
      // If a concurrent request won the race, prefer the stored mapping.
      const { data: fresh } = await service
        .from('entitlements')
        .select('stripe_customer_id')
        .eq('user_id', user.id)
        .maybeSingle()
      if (fresh?.stripe_customer_id) customerId = fresh.stripe_customer_id
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price, quantity: 1 }],
      client_reference_id: user.id,
      // user_id metadata on BOTH the session and the subscription: these are the
      // only user-resolution paths the translator trusts (client_reference_id is
      // deliberately untrusted — review 018 security).
      metadata: { user_id: user.id },
      subscription_data: { metadata: { user_id: user.id } },
      success_url: `${env.APP_BASE_URL}/settings?checkout=success`,
      cancel_url: `${env.APP_BASE_URL}/settings?checkout=cancelled`,
      allow_promotion_codes: true,
    })

    if (!session.url) return errorResponse('provider_error')
    return json(200, { url: session.url })
  } catch {
    return errorResponse('provider_error')
  }
})
