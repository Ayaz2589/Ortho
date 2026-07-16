// [OPERATOR-PENDING] Spec 018 — read-only deployment probe (quickstart.md §2.6).
// Verifies from a NETWORKED machine that the billing backend is fully deployed:
//   1. migration applied (entitlements/billing_events reachable via service role,
//      ensure_entitlement RPC present),
//   2. all four edge functions respond with the expected auth posture,
//   3. optionally (with OPERATOR_JWT) that billing-plans returns real prices.
// It performs ZERO writes. Run: cd web && OPERATOR=1 npx tsx scripts/ops/billing-probe.ts
import { loadEnv } from '../import/db/client'

loadEnv()

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const operatorJwt = process.env.OPERATOR_JWT // optional: a signed-in user's access token

const results: Array<{ name: string; ok: boolean; detail: string }> = []
const record = (name: string, ok: boolean, detail: string) => {
  results.push({ name, ok, detail })
  console.log(`${ok ? '✅' : '❌'} ${name} — ${detail}`)
}

async function main() {
  if (process.env.OPERATOR !== '1') {
    console.error('This probe talks to the LIVE project. Re-run with OPERATOR=1 to confirm.')
    process.exit(2)
  }
  if (!url || !anonKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY (web/.env.local).')
    process.exit(2)
  }

  // --- 1. Migration state (service role; read-only selects) ---
  if (!serviceKey || serviceKey.includes('YOUR_')) {
    record('migration: tables', false, 'SUPABASE_SERVICE_ROLE_KEY not set — cannot verify tables')
  } else {
    for (const table of ['entitlements', 'billing_events']) {
      const res = await fetch(`${url}/rest/v1/${table}?select=count&limit=1`, {
        headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, Prefer: 'count=exact' },
      })
      record(
        `migration: ${table}`,
        res.ok,
        res.ok ? `reachable (${res.headers.get('content-range') ?? 'ok'})` : `HTTP ${res.status} — migration not applied?`
      )
    }
  }

  // An unauthenticated RPC call proves the function EXISTS (it must refuse with
  // its own auth error, not PostgREST's 404 for a missing function).
  const rpcRes = await fetch(`${url}/rest/v1/rpc/ensure_entitlement`, {
    method: 'POST',
    headers: { apikey: anonKey, 'Content-Type': 'application/json' },
    body: '{}',
  })
  const rpcBody = await rpcRes.text()
  const rpcMissing = rpcRes.status === 404
  record(
    'migration: ensure_entitlement()',
    !rpcMissing,
    rpcMissing ? 'HTTP 404 — RPC missing (migration not applied)' : `deployed (unauthenticated call → HTTP ${rpcRes.status}: ${rpcBody.slice(0, 80)})`
  )

  // --- 2. Edge functions (auth posture, no side effects) ---
  // stripe-webhook: verify_jwt=false + signature check ⇒ POST without a
  // signature must reach the function and come back 400 missing_signature.
  // A 401 here means verify_jwt was NOT disabled at deploy — a real misconfig.
  const wh = await fetch(`${url}/functions/v1/stripe-webhook`, { method: 'POST', body: '{}' })
  record(
    'function: stripe-webhook',
    wh.status === 400,
    wh.status === 400
      ? 'deployed, verify_jwt off, signature enforced'
      : wh.status === 401
        ? 'responds 401 — deployed WITH JWT verification: redeploy with --no-verify-jwt'
        : `HTTP ${wh.status} — not deployed?`
  )

  // The three client functions keep verify_jwt on ⇒ unauthenticated ⇒ 401.
  for (const fn of ['billing-checkout', 'billing-portal', 'billing-plans']) {
    const res = await fetch(`${url}/functions/v1/${fn}`, { method: 'POST', body: '{}' })
    record(
      `function: ${fn}`,
      res.status === 401,
      res.status === 401 ? 'deployed, JWT required' : `HTTP ${res.status} — ${res.status === 404 ? 'not deployed' : 'unexpected posture'}`
    )
  }

  // --- 3. Prices (requires a real user token; optional) ---
  if (operatorJwt) {
    const res = await fetch(`${url}/functions/v1/billing-plans`, {
      headers: { Authorization: `Bearer ${operatorJwt}`, apikey: anonKey },
    })
    const body = (await res.json().catch(() => null)) as
      | { plans?: { monthly?: { amountCents: number }; yearly?: { amountCents: number } }; error?: { code: string } }
      | null
    const ok = res.ok && !!body?.plans?.monthly && !!body?.plans?.yearly
    record(
      'prices: billing-plans',
      ok,
      ok
        ? `monthly ${body!.plans!.monthly!.amountCents}¢ / yearly ${body!.plans!.yearly!.amountCents}¢`
        : `HTTP ${res.status} ${body?.error?.code ?? ''} — check STRIPE_PRICE_* / STRIPE_SECRET_KEY secrets`
    )
  } else {
    console.log('ℹ️  prices: set OPERATOR_JWT=<a signed-in access token> to verify billing-plans end-to-end')
  }

  const failed = results.filter((r) => !r.ok)
  console.log(`\n${failed.length === 0 ? 'ALL GREEN' : `${failed.length} check(s) failed`} — see quickstart.md §2 for fixes.`)
  process.exit(failed.length === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error('probe crashed:', e)
  process.exit(1)
})
