// Spec 018 — create a Stripe Customer Portal session (contracts/billing-functions.md §3).
import Stripe from 'npm:stripe@22'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { errorResponse, json, preflight, requiredEnv } from '../_shared/http.ts'

Deno.serve(async (req) => {
  const pre = preflight(req)
  if (pre) return pre
  if (req.method !== 'POST') return errorResponse('invalid_request')

  const env = requiredEnv(
    'STRIPE_SECRET_KEY',
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

  const service = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
  const { data: row } = await service
    .from('entitlements')
    .select('stripe_customer_id')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!row?.stripe_customer_id) return errorResponse('no_billing_account')

  try {
    const stripe = new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: '2026-06-24.dahlia' })
    const session = await stripe.billingPortal.sessions.create({
      customer: row.stripe_customer_id,
      return_url: `${env.APP_BASE_URL}/settings`,
    })
    return json(200, { url: session.url })
  } catch {
    return errorResponse('provider_error')
  }
})
