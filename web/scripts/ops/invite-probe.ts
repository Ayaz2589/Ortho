/**
 * Spec 017 FR-026 — [OPERATOR-PENDING] readiness probe for the partner-invite
 * rails on the HOSTED backend. Read-only: verifies (via the PostgREST swagger
 * root + column probes) that `pending_invites`, the `accept_invite` RPC, and
 * `household_people.linked_user_id` exist live. It never writes anything.
 *
 * Run from a networked host (the dev sandbox cannot reach the hosted project):
 *   cd web && npx tsx scripts/ops/invite-probe.ts
 *
 * Exit codes: 0 = every rail present · 1 = one or more rails missing/unreachable.
 */
import { loadEnv } from '../import/db/client'

interface CheckResult {
  name: string
  ok: boolean
  detail: string
}

export function summarizeChecks(checks: CheckResult[]): { report: string; ok: boolean } {
  const width = Math.max(...checks.map((c) => c.name.length))
  const lines = checks.map(
    (c) => `  ${c.ok ? 'OK  ' : 'MISS'}  ${c.name.padEnd(width)}  ${c.detail}`
  )
  const ok = checks.every((c) => c.ok)
  const report = [
    'Partner-invite rails probe (spec 017) — read-only',
    ...lines,
    ok
      ? 'All rails present — the invite/join feature is deploy-complete.'
      : 'One or more rails are missing: DO NOT enable invite/join against this backend. See supabase/migrations/20260521120000_initial_schema.sql.',
  ].join('\n')
  return { report, ok }
}

async function main(): Promise<number> {
  loadEnv()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL / a Supabase key in web/.env.local')
    return 1
  }
  const headers = { apikey: key, Authorization: `Bearer ${key}` }

  const checks: CheckResult[] = []

  // 1. Swagger root — lists every exposed table and RPC path.
  try {
    const res = await fetch(`${url}/rest/v1/`, { headers })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const spec = (await res.json()) as {
      paths?: Record<string, unknown>
      definitions?: Record<string, { properties?: Record<string, unknown> }>
    }
    const paths = spec.paths ?? {}
    const defs = spec.definitions ?? {}
    checks.push({
      name: 'pending_invites table',
      ok: '/pending_invites' in paths,
      detail: '/pending_invites in PostgREST paths',
    })
    checks.push({
      name: 'accept_invite RPC',
      ok: '/rpc/accept_invite' in paths,
      detail: '/rpc/accept_invite in PostgREST paths',
    })
    const invCols = Object.keys(defs.pending_invites?.properties ?? {})
    const needed = ['token_hash', 'expires_at', 'redeemed_at', 'role', 'created_by']
    checks.push({
      name: 'pending_invites columns',
      ok: needed.every((c) => invCols.includes(c)),
      detail: `needs ${needed.join(', ')}; found ${invCols.length ? invCols.join(', ') : '(none)'}`,
    })
    const peopleCols = Object.keys(defs.household_people?.properties ?? {})
    checks.push({
      name: 'household_people.linked_user_id',
      ok: peopleCols.includes('linked_user_id'),
      detail: 'the identity-claim column',
    })
  } catch (e) {
    checks.push({
      name: 'PostgREST reachability',
      ok: false,
      detail: `swagger root failed: ${(e as Error).message}`,
    })
  }

  const { report, ok } = summarizeChecks(checks)
  console.log(report)
  return ok ? 0 : 1
}

// Only run when invoked directly (not when imported by tests).
if (process.argv[1]?.endsWith('invite-probe.ts')) {
  main().then((code) => process.exit(code))
}
