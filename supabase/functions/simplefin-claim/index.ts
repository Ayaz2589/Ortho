// Spec 028 — claim a SimpleFIN setup token (contracts/simplefin-functions.md).
// Synchronous claim (research D2): decode the setup token → POST the claim URL →
// receive the Access URL (single-use token now consumed) → store it in Vault and
// record the institution + accounts ATOMICALLY via complete_simplefin_link. The
// Access URL is the standing credential and never leaves the server.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { errorResponse, json, preflight, requiredEnv } from '../_shared/http.ts'
import {
  buildAccountsQuery,
  createSimpleFinClient,
  decodeSetupToken,
  deriveProviderItemId,
  institutionLabel,
  parseSimpleFinAccounts,
  type SimpleFinFetch,
} from '../_shared/aggregation/index.ts'

Deno.serve(async (req) => {
  const pre = preflight(req)
  if (pre) return pre
  if (req.method !== 'POST') return errorResponse('invalid_request')

  // SimpleFIN needs no Ortho-side API key — each connection self-authenticates
  // via its Access URL. Only the Supabase env is required.
  const env = requiredEnv('SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY')
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

  let setupToken: unknown
  try {
    setupToken = (await req.json())?.setupToken
  } catch {
    return errorResponse('invalid_request')
  }
  if (typeof setupToken !== 'string' || setupToken.length === 0) {
    return errorResponse('invalid_request')
  }

  const claimUrl = decodeSetupToken(setupToken)
  if (!claimUrl) return errorResponse('invalid_request')

  const service = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

  // Mirror plaid-link-token: a user in 2+ households returns multiple rows,
  // which .maybeSingle() alone rejects as an error — deterministically take
  // the earliest membership (review 2026-08-24).
  const { data: membership } = await service
    .from('household_members')
    .select('household_id')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (!membership) return errorResponse('not_household_member')

  const client = createSimpleFinClient(fetch as unknown as SimpleFinFetch)

  // POST the claim URL — this CONSUMES the single-use token and returns the
  // Access URL. Anything but a clean 2xx with a body means the token is spent
  // or invalid (claim_failed); a network/5xx is provider_unreachable.
  const claimed = await client.claim(claimUrl)
  if (!claimed.ok) {
    return errorResponse(claimed.code === 'provider_unreachable' ? 'provider_unreachable' : 'claim_failed')
  }
  const accessUrl = claimed.data
  const providerItemId = deriveProviderItemId(accessUrl)

  // Best-effort account metadata (balances-only, a small window). A failure here
  // is non-fatal: the accounts also populate on the first sync.
  const nowSec = Math.floor(Date.now() / 1000)
  const metaRes = await client.getAccounts(accessUrl, buildAccountsQuery(nowSec - 86_400, nowSec, true))
  const parsed = metaRes.ok ? parseSimpleFinAccounts(metaRes.data) : { accounts: [], transactions: [], warnings: [] }
  const institutionName = institutionLabel(parsed.accounts)

  const accountsPayload = parsed.accounts.map((a) => ({
    provider_account_id: a.providerAccountId,
    name: a.name,
    official_name: a.orgName,
    mask: a.mask,
    account_type: a.accountType,
    account_subtype: null,
    currency: a.currency,
  }))

  const { data: institutionId, error } = await service.rpc('complete_simplefin_link', {
    p_household_id: membership.household_id,
    p_created_by: user.id,
    p_provider_item_id: providerItemId,
    p_institution_name: institutionName,
    p_access_url: accessUrl,
    p_accounts: accountsPayload,
  })
  if (error || !institutionId) return errorResponse('claim_failed')

  return json(200, {
    institutionId,
    institutionName,
    accounts: parsed.accounts.map((a) => ({
      name: a.name,
      accountType: a.accountType,
      currency: a.currency,
      mask: a.mask,
    })),
  })
})
