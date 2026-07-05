/**
 * Client wrappers for the billing edge functions (spec 018,
 * contracts/billing-functions.md). The apps never talk to Stripe directly and
 * never write entitlement state; these calls only mint hosted-page URLs and
 * read operator-configured prices. Callers localize failures by `code`.
 */
import { createClient } from './supabase/client'

export type PlanKey = 'monthly' | 'yearly'

export type PlanInfo = { amountCents: number; currency: string; interval: string }
export type PlansInfo = { monthly: PlanInfo; yearly: PlanInfo }

export type BillingResult<T> = { ok: true; value: T } | { ok: false; code: string }

type InvokeCapable = {
  functions?: {
    invoke: (name: string, opts?: { body?: unknown }) => Promise<{ data: unknown; error: unknown }>
  }
}

async function invokeBilling<T>(name: string, body?: unknown): Promise<BillingResult<T>> {
  const client = createClient() as unknown as InvokeCapable
  // Test-data/memory client has no functions surface — behave as unconfigured.
  if (!client.functions) return { ok: false, code: 'not_configured' }
  try {
    const { data, error } = await client.functions.invoke(name, body === undefined ? {} : { body })
    if (!error) return { ok: true, value: data as T }
    // FunctionsHttpError carries the contract envelope in its Response context.
    let code = 'provider_error'
    const context = (error as { context?: { clone?: () => { json: () => Promise<unknown> } } }).context
    if (context?.clone) {
      try {
        const parsed = (await context.clone().json()) as { error?: { code?: string } }
        code = parsed?.error?.code ?? code
      } catch {
        // Unparseable body — keep the generic code.
      }
    }
    return { ok: false, code }
  } catch {
    return { ok: false, code: 'provider_error' }
  }
}

function isPlanInfo(v: unknown): v is PlanInfo {
  const r = v as PlanInfo | null
  return (
    typeof r === 'object' && r !== null &&
    typeof r.amountCents === 'number' && Number.isFinite(r.amountCents) &&
    typeof r.currency === 'string' && typeof r.interval === 'string'
  )
}

/** Operator-configured plan prices for the paywall (never hardcoded — FR-011).
 *  The payload shape is validated: a malformed 200 must surface as a calm
 *  retryable failure, never a crash or a stuck loading state (review 018 [8]). */
export function fetchPlans(): Promise<BillingResult<PlansInfo>> {
  return invokeBilling<{ plans: PlansInfo }>('billing-plans').then((r) => {
    if (!r.ok) return r
    const plans = r.value?.plans
    if (!plans || !isPlanInfo(plans.monthly) || !isPlanInfo(plans.yearly)) {
      return { ok: false, code: 'provider_error' }
    }
    return { ok: true, value: plans }
  })
}

/** Mint a Stripe Checkout URL for the chosen plan. Never auto-retried
 *  (duplicate sessions); the caller navigates on success. */
export function startCheckout(plan: PlanKey): Promise<BillingResult<{ url: string }>> {
  return invokeBilling<{ url: string }>('billing-checkout', { plan })
}

/** Mint a Stripe Customer Portal URL (active subscribers manage billing there). */
export function openPortal(): Promise<BillingResult<{ url: string }>> {
  return invokeBilling<{ url: string }>('billing-portal')
}

/** Plain tabular price text: integer cents → "$X.XX" (subscription prices are
 *  USD and deliberately NOT run through the display-currency converter — the
 *  paywall shows exactly what Stripe will charge). */
export function formatPlanAmount(amountCents: number): string {
  return `$${(amountCents / 100).toFixed(2)}`
}
