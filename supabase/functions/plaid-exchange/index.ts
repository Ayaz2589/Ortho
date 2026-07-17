// Spec 024 — complete a bank-connection attempt (contracts/plaid-functions.md §2).
// Idempotent: a completed session returns its stored result. Persistence is
// ATOMIC: the complete_plaid_link RPC lands institution + Vault secret +
// accounts + session flip in one transaction, so no member-visible half-link
// can exist. Compensation (review 024): the public token is single-use, so any
// failure after /item/public_token/exchange is TERMINAL for this session —
// best-effort /item/remove the orphaned Item when this attempt minted it (an
// orphan permanently burns one of the Trial plan's 10 slots), mark the session
// 'abandoned' so clients reset calmly, and answer exchange_failed.
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { errorResponse, json, preflight, requiredEnv } from '../_shared/http.ts'
import { decideCompletionAfterRpcError } from './completion.ts'
import {
  createPlaidClient,
  parseAccountsResponse,
  parseExchangeResponse,
  parseHostedSessionResult,
  parseInstitutionResponse,
  type FetchLike,
  type PlaidClient,
  type PlaidEnv,
} from '../_shared/aggregation/index.ts'

type SessionRow = {
  id: string
  user_id: string
  household_id: string
  mode: 'embedded' | 'hosted'
  link_token: string
  status: 'pending' | 'completed' | 'abandoned'
  institution_id: string | null
  expires_at: string
}

/** Contract payload: institution + accounts, display fields only (SC-002). */
async function institutionPayload(service: SupabaseClient, institutionId: string) {
  const [{ data: inst }, { data: accounts }] = await Promise.all([
    service
      .from('linked_institutions')
      .select('id, provider, institution_name, status, created_by, created_at')
      .eq('id', institutionId)
      .maybeSingle(),
    service
      .from('linked_accounts')
      .select('id, name, official_name, mask, account_type, account_subtype')
      .eq('institution_id', institutionId)
      .order('created_at', { ascending: true })
      .order('name', { ascending: true }),
  ])
  if (!inst) return null
  return {
    institution: {
      id: inst.id,
      provider: inst.provider,
      institutionName: inst.institution_name,
      status: inst.status,
      createdBy: inst.created_by,
      createdAt: inst.created_at,
    },
    accounts: (accounts ?? []).map((a) => ({
      id: a.id,
      name: a.name,
      officialName: a.official_name,
      mask: a.mask,
      accountType: a.account_type,
      accountSubtype: a.account_subtype,
    })),
  }
}

Deno.serve(async (req) => {
  const pre = preflight(req)
  if (pre) return pre
  if (req.method !== 'POST') return errorResponse('invalid_request')

  const env = requiredEnv(
    'PLAID_CLIENT_ID',
    'PLAID_SECRET',
    'PLAID_ENV',
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY'
  )
  if (!env) return errorResponse('not_configured')
  if (env.PLAID_ENV !== 'sandbox' && env.PLAID_ENV !== 'production') {
    return errorResponse('not_configured')
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return errorResponse('unauthenticated')
  const authed = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })
  const {
    data: { user },
  } = await authed.auth.getUser()
  if (!user) return errorResponse('unauthenticated')

  let sessionId: unknown
  let publicToken: unknown
  try {
    const body = await req.json()
    sessionId = body?.sessionId
    publicToken = body?.publicToken
  } catch {
    return errorResponse('invalid_request')
  }
  if (typeof sessionId !== 'string' || sessionId.length === 0) {
    return errorResponse('invalid_request')
  }

  const service = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

  const { data: session } = (await service
    .from('plaid_link_sessions')
    .select('id, user_id, household_id, mode, link_token, status, institution_id, expires_at')
    .eq('id', sessionId)
    .maybeSingle()) as { data: SessionRow | null }
  if (!session) return errorResponse('session_not_found')
  if (session.user_id !== user.id) return errorResponse('session_not_owned')

  // Idempotency: double hand-backs (iOS deep link + foreground poll) land here.
  if (session.status === 'completed' && session.institution_id) {
    const payload = await institutionPayload(service, session.institution_id)
    return payload ? json(200, payload) : errorResponse('exchange_failed')
  }

  // A previous attempt consumed this session's public token and failed past
  // the point of recovery — clients must reset, not retry (review 024).
  if (session.status === 'abandoned') return errorResponse('session_expired')

  const expired = new Date(session.expires_at).getTime() <= Date.now()

  const plaid: PlaidClient = createPlaidClient(fetch as unknown as FetchLike, {
    clientId: env.PLAID_CLIENT_ID,
    secret: env.PLAID_SECRET,
    env: env.PLAID_ENV as PlaidEnv,
  })

  // Resolve the public token. Embedded Link hands it to the page (onSuccess)
  // and dies with the link token. Hosted sessions are resolved server-side —
  // and DELIBERATELY before any expiry gate: Plaid keeps a finished hosted
  // session's results retrievable for ~6h AFTER the link token expires
  // (research.md D3), so a member who finished in the browser last night can
  // still land their bank this morning (review 024).
  let resolvedPublicToken: string
  if (typeof publicToken === 'string' && publicToken.length > 0) {
    if (expired) return errorResponse('session_expired')
    resolvedPublicToken = publicToken
  } else if (session.mode === 'hosted') {
    const got = await plaid.post('/link/token/get', { link_token: session.link_token })
    if (!got.ok) return errorResponse(got.code)
    const result = parseHostedSessionResult(got.data)
    if (!result) {
      // No finished result: still-in-the-browser (waiting) vs never-finished
      // (expired token AND no result → this session can never produce one).
      return errorResponse(expired ? 'session_expired' : 'session_incomplete')
    }
    resolvedPublicToken = result
  } else {
    return errorResponse('invalid_request')
  }

  const exchanged = await plaid.post('/item/public_token/exchange', {
    public_token: resolvedPublicToken,
  })
  if (!exchanged.ok) {
    // A consumed/expired public token can never be exchanged again — mark the
    // session terminal so the client resets instead of silently re-failing on
    // every foreground (review 024).
    if (exchanged.code === 'provider_error' && exchanged.providerErrorCode === 'INVALID_PUBLIC_TOKEN') {
      await service
        .from('plaid_link_sessions')
        .update({ status: 'abandoned' })
        .eq('id', session.id)
      return errorResponse('session_expired')
    }
    return errorResponse(exchanged.code)
  }
  const tokens = parseExchangeResponse(exchanged.data)
  if (!tokens) return errorResponse('provider_error')

  // ---- The public token is now consumed: from here every failure is -------
  // ---- terminal for this session and must compensate (research.md D7). ----

  // Know BEFORE anything can fail whether this Item is new to us — only a
  // brand-new Item may be /item/remove'd on failure (a pre-existing
  // institution's live access is not this attempt's to revoke).
  const { data: existing } = await service
    .from('linked_institutions')
    .select('id')
    .eq('provider', 'plaid')
    .eq('provider_item_id', tokens.itemId)
    .maybeSingle()
  const institutionIsNew = !existing

  const failTerminally = async () => {
    if (institutionIsNew) {
      try {
        await plaid.post('/item/remove', { access_token: tokens.accessToken })
      } catch {
        // Best-effort: an unreachable Plaid here leaves an orphan we cannot
        // help; the session is still marked terminal below.
      }
    }
    await service.from('plaid_link_sessions').update({ status: 'abandoned' }).eq('id', session.id)
    return errorResponse('exchange_failed')
  }

  const accountsRes = await plaid.post('/accounts/get', { access_token: tokens.accessToken })
  if (!accountsRes.ok) return await failTerminally()
  const parsedAccounts = parseAccountsResponse(accountsRes.data)
  if (!parsedAccounts) return await failTerminally()

  // Institution display name: /accounts/get usually carries it; fall back to
  // /institutions/get_by_id (free endpoint); tolerate absence ('').
  let institutionName = parsedAccounts.institutionName
  if (!institutionName && parsedAccounts.institutionId) {
    const inst = await plaid.post('/institutions/get_by_id', {
      institution_id: parsedAccounts.institutionId,
      country_codes: ['US'],
    })
    if (inst.ok) institutionName = parseInstitutionResponse(inst.data)
  }

  // Atomic persist: institution upsert (reactivating a disconnected re-link),
  // Vault secret, accounts, session→completed — one transaction, all or
  // nothing. On failure the DB rolled back by itself; only the provider-side
  // orphan needs compensating.
  const { data: institutionId, error: rpcError } = await service.rpc('complete_plaid_link', {
    p_session_id: session.id,
    p_provider_item_id: tokens.itemId,
    p_provider_institution_id: parsedAccounts.institutionId,
    p_institution_name: institutionName ?? '',
    p_access_token: tokens.accessToken,
    p_accounts: parsedAccounts.accounts.map((a) => ({
      provider_account_id: a.providerAccountId,
      name: a.name,
      official_name: a.officialName,
      mask: a.mask,
      account_type: a.accountType,
      account_subtype: a.accountSubtype,
    })),
  })
  if (rpcError || typeof institutionId !== 'string') {
    // The RPC may have COMMITTED with only its response lost (see completion.ts).
    // Re-read the session; the atomic flip to 'completed' is the true commit
    // signal, so we only compensate (revoke + abandon) when it's confirmed absent.
    const { data: recheck } = (await service
      .from('plaid_link_sessions')
      .select('status, institution_id')
      .eq('id', session.id)
      .maybeSingle()) as { data: Pick<SessionRow, 'status' | 'institution_id'> | null }
    const decision = decideCompletionAfterRpcError({
      status: recheck?.status ?? null,
      institutionId: recheck?.institution_id ?? null,
    })
    if (decision.outcome === 'success') {
      const payload = await institutionPayload(service, decision.institutionId)
      if (payload) return json(200, payload)
    }
    return await failTerminally()
  }

  const payload = await institutionPayload(service, institutionId)
  return payload ? json(200, payload) : errorResponse('exchange_failed')
})
