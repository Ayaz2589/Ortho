// Spec 018 — live plan/price lookup for the paywalls (contracts/billing-functions.md §4).
// Prices exist ONLY in Stripe (FR-011/SC-008): this function is how the apps learn
// the operator-configured amounts. Short in-function cache keeps the paywall snappy.
import Stripe from 'npm:stripe@22.4.0'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { errorResponse, json, preflight, requiredEnv } from '../_shared/http.ts'

type PlanInfo = { amountCents: number; currency: string; interval: string }
type PlansBody = { plans: { monthly: PlanInfo; yearly: PlanInfo } }

const CACHE_MS = 60_000
let cached: { at: number; body: PlansBody } | null = null

function planInfo(price: Stripe.Price): PlanInfo | null {
  if (typeof price.unit_amount !== 'number' || !price.recurring) return null
  return {
    amountCents: price.unit_amount,
    currency: price.currency,
    interval: price.recurring.interval,
  }
}

Deno.serve(async (req) => {
  const pre = preflight(req)
  if (pre) return pre
  if (req.method !== 'GET' && req.method !== 'POST') return errorResponse('invalid_request')

  const env = requiredEnv(
    'STRIPE_SECRET_KEY',
    'STRIPE_PRICE_MONTHLY',
    'STRIPE_PRICE_YEARLY',
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY'
  )
  if (!env) return errorResponse('not_configured')

  // Authenticated callers only (paywall renders post-sign-in).
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return errorResponse('unauthenticated')
  const authed = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })
  const {
    data: { user },
  } = await authed.auth.getUser()
  if (!user) return errorResponse('unauthenticated')

  if (cached && Date.now() - cached.at < CACHE_MS) return json(200, cached.body)

  try {
    const stripe = new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: '2026-07-29.dahlia' })
    const [monthlyPrice, yearlyPrice] = await Promise.all([
      stripe.prices.retrieve(env.STRIPE_PRICE_MONTHLY),
      stripe.prices.retrieve(env.STRIPE_PRICE_YEARLY),
    ])
    const monthly = planInfo(monthlyPrice)
    const yearly = planInfo(yearlyPrice)
    if (!monthly || !yearly) return errorResponse('not_configured')

    const body: PlansBody = { plans: { monthly, yearly } }
    cached = { at: Date.now(), body }
    return json(200, body)
  } catch {
    return errorResponse('provider_error')
  }
})
