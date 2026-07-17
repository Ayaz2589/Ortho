// [OPERATOR-PENDING] Spec 024 — headless SANDBOX smoke (quickstart.md §2.5).
// Proves the full connect path against Plaid Sandbox without the UI:
//   link-token issued → sandbox item minted (/sandbox/public_token/create,
//   bypassing the Link UI) → plaid-exchange records institution + accounts +
//   Vault secret → plaid-disconnect revokes at Plaid and flips the status.
// Writes ONLY sandbox-linked rows for the operator's own household, then
// disconnects them. Never prints a token.
//
// Requires (web/.env.local): NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
//   SUPABASE_SERVICE_ROLE_KEY, OPERATOR_JWT (a signed-in member's access token),
//   PLAID_CLIENT_ID + PLAID_SECRET (SANDBOX keys — also set as function secrets).
// Run: cd web && OPERATOR=1 npx tsx scripts/ops/plaid-smoke.ts
import { loadEnv } from '../import/db/client'

loadEnv()

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const operatorJwt = process.env.OPERATOR_JWT
const plaidClientId = process.env.PLAID_CLIENT_ID
const plaidSecret = process.env.PLAID_SECRET

const results: Array<{ name: string; ok: boolean }> = []
const record = (name: string, ok: boolean, detail: string) => {
  results.push({ name, ok })
  console.log(`${ok ? '✅' : '❌'} ${name} — ${detail}`)
}

async function invokeFn(name: string, body: unknown): Promise<{ status: number; json: unknown }> {
  const res = await fetch(`${url}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: anonKey!,
      Authorization: `Bearer ${operatorJwt}`,
    },
    body: JSON.stringify(body),
  })
  let json: unknown = null
  try {
    json = await res.json()
  } catch {
    // Non-JSON body — leave null; callers report the status.
  }
  return { status: res.status, json }
}

async function serviceSelect(path: string): Promise<{ status: number; rows: unknown[] }> {
  const res = await fetch(`${url}/rest/v1/${path}`, {
    headers: { apikey: serviceKey!, Authorization: `Bearer ${serviceKey}` },
  })
  const rows = res.ok ? ((await res.json()) as unknown[]) : []
  return { status: res.status, rows }
}

async function main() {
  if (process.env.OPERATOR !== '1') {
    console.error('This smoke talks to the LIVE project + Plaid Sandbox. Re-run with OPERATOR=1.')
    process.exit(2)
  }
  for (const [name, v] of Object.entries({ url, anonKey, serviceKey, operatorJwt, plaidClientId, plaidSecret })) {
    if (!v) {
      console.error(`Missing ${name} — see the header of this script.`)
      process.exit(2)
    }
  }

  // --- 1. probe: configured? ---
  const probe = await invokeFn('plaid-link-token', { mode: 'probe' })
  record('probe (configured + membership)', probe.status === 200, `HTTP ${probe.status}`)
  if (probe.status !== 200) return finish()

  // --- 2. link token (hosted mode so no browser is needed for the token) ---
  const start = await invokeFn('plaid-link-token', { mode: 'embedded' })
  const session = start.json as { sessionId?: string; linkToken?: string }
  record(
    'link-token issued + session row',
    start.status === 200 && !!session.sessionId && !!session.linkToken,
    `HTTP ${start.status}`
  )
  if (start.status !== 200 || !session.sessionId) return finish()

  // --- 3. mint a sandbox public token (bypasses the Link UI) ---
  const sandboxRes = await fetch('https://sandbox.plaid.com/sandbox/public_token/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: plaidClientId,
      secret: plaidSecret,
      institution_id: 'ins_109508', // First Platypus Bank
      initial_products: ['auth'],
    }),
  })
  const sandboxJson = (await sandboxRes.json()) as { public_token?: string }
  record('sandbox public_token minted', sandboxRes.ok && !!sandboxJson.public_token, `HTTP ${sandboxRes.status}`)
  if (!sandboxJson.public_token) return finish()

  // --- 4. exchange ---
  const exchange = await invokeFn('plaid-exchange', {
    sessionId: session.sessionId,
    publicToken: sandboxJson.public_token,
  })
  const outcome = exchange.json as {
    institution?: { id?: string; institutionName?: string }
    accounts?: unknown[]
  }
  const instId = outcome.institution?.id
  record(
    'exchange → institution + accounts',
    exchange.status === 200 && !!instId && (outcome.accounts?.length ?? 0) > 0,
    `HTTP ${exchange.status} · ${outcome.institution?.institutionName ?? '?'} · ${outcome.accounts?.length ?? 0} accounts`
  )
  if (!instId) return finish()

  // --- 5. server truth: rows + Vault mapping exist; no token anywhere client-visible ---
  const inst = await serviceSelect(`linked_institutions?id=eq.${instId}&select=status`)
  record('institution row active', (inst.rows[0] as { status?: string })?.status === 'active', `HTTP ${inst.status}`)
  const secret = await serviceSelect(`linked_institution_secrets?institution_id=eq.${instId}&select=institution_id`)
  record('vault mapping present', secret.rows.length === 1, `${secret.rows.length} row(s)`)

  // --- 6. idempotent replay (double hand-back safety) ---
  const replay = await invokeFn('plaid-exchange', { sessionId: session.sessionId })
  const replayOutcome = replay.json as { institution?: { id?: string } }
  record(
    'replay is idempotent (same institution)',
    replay.status === 200 && replayOutcome.institution?.id === instId,
    `HTTP ${replay.status}`
  )

  // --- 7. disconnect (revokes at Plaid first) ---
  const disc = await invokeFn('plaid-disconnect', { institutionId: instId })
  record('disconnect', disc.status === 200, `HTTP ${disc.status}`)
  const after = await serviceSelect(`linked_institutions?id=eq.${instId}&select=status`)
  record(
    'status flipped to disconnected',
    (after.rows[0] as { status?: string })?.status === 'disconnected',
    `${(after.rows[0] as { status?: string })?.status ?? 'missing'}`
  )
  const secretAfter = await serviceSelect(`linked_institution_secrets?institution_id=eq.${instId}&select=institution_id`)
  record('vault mapping deleted', secretAfter.rows.length === 0, `${secretAfter.rows.length} row(s)`)

  finish()
}

function finish() {
  const failed = results.filter((r) => !r.ok)
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
  process.exit(failed.length ? 1 : 0)
}

void main()
