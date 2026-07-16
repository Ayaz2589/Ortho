// Spec 024 — complete a bank-connection attempt (contracts/plaid-functions.md §2).
// Idempotent: a completed session returns its stored result. Compensating: any
// failure after /item/public_token/exchange best-effort /item/remove's the
// orphaned provider access (on the Trial plan an orphan permanently burns one
// of 10 Item slots) and cleans this attempt's rows, leaving the session
// pending for a calm retry (contracts/link-session-lifecycle.md).
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { errorResponse, json, preflight, requiredEnv } from '../_shared/http.ts'
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
  const { data: inst } = await service
    .from('linked_institutions')
    .select('id, provider, institution_name, status, created_by, created_at')
    .eq('id', institutionId)
    .maybeSingle()
  if (!inst) return null
  const { data: accounts } = await service
    .from('linked_accounts')
    .select('id, name, official_name, mask, account_type, account_subtype')
    .eq('institution_id', institutionId)
    .order('created_at', { ascending: true })
    .order('name', { ascending: true })
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

  if (new Date(session.expires_at).getTime() <= Date.now()) {
    return errorResponse('session_expired')
  }

  const plaid: PlaidClient = createPlaidClient(fetch as unknown as FetchLike, {
    clientId: env.PLAID_CLIENT_ID,
    secret: env.PLAID_SECRET,
    env: env.PLAID_ENV as PlaidEnv,
  })

  // Resolve the public token: embedded Link hands it to the page (onSuccess);
  // hosted sessions are resolved server-side from the session's link token.
  let resolvedPublicToken: string
  if (typeof publicToken === 'string' && publicToken.length > 0) {
    resolvedPublicToken = publicToken
  } else if (session.mode === 'hosted') {
    const got = await plaid.post('/link/token/get', { link_token: session.link_token })
    if (!got.ok) return errorResponse(got.code)
    const result = parseHostedSessionResult(got.data)
    if (!result) return errorResponse('session_incomplete')
    resolvedPublicToken = result
  } else {
    return errorResponse('invalid_request')
  }

  const exchanged = await plaid.post('/item/public_token/exchange', {
    public_token: resolvedPublicToken,
  })
  if (!exchanged.ok) return errorResponse(exchanged.code)
  const tokens = parseExchangeResponse(exchanged.data)
  if (!tokens) return errorResponse('provider_error')

  // ---- From here on, every failure compensates (research.md D7). -----------
  let institutionId: string | null = null
  let institutionIsNew = false
  const compensate = async () => {
    // Kill the orphaned provider access first — but never for a pre-existing
    // institution (its live token is not this attempt's to revoke).
    if (institutionIsNew) {
      try {
        await plaid.post('/item/remove', { access_token: tokens.accessToken })
      } catch {
        // Best-effort: an unreachable Plaid here leaves an orphan we cannot
        // help; the session stays pending so a retry can be attempted.
      }
      if (institutionId) {
        await service.rpc('delete_institution_secret', { p_institution_id: institutionId })
        // Cascades linked_accounts + the secret mapping row.
        await service.from('linked_institutions').delete().eq('id', institutionId)
      }
    }
  }

  const accountsRes = await plaid.post('/accounts/get', { access_token: tokens.accessToken })
  if (!accountsRes.ok) {
    await compensate()
    return errorResponse('exchange_failed')
  }
  const parsedAccounts = parseAccountsResponse(accountsRes.data)
  if (!parsedAccounts) {
    await compensate()
    return errorResponse('exchange_failed')
  }

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

  // Upsert the institution on the (provider, provider_item_id) anchor. A
  // pre-existing row means this exact Item is already linked (a concurrent
  // completion race) — reuse it rather than duplicating.
  const { data: existing } = await service
    .from('linked_institutions')
    .select('id, status')
    .eq('provider', 'plaid')
    .eq('provider_item_id', tokens.itemId)
    .maybeSingle()

  if (existing) {
    institutionId = existing.id
    if (existing.status === 'disconnected') {
      await service
        .from('linked_institutions')
        .update({ status: 'active', disconnected_at: null })
        .eq('id', existing.id)
    }
  } else {
    institutionIsNew = true
    const { data: inserted, error: insertError } = await service
      .from('linked_institutions')
      .insert({
        household_id: session.household_id,
        provider: 'plaid',
        provider_item_id: tokens.itemId,
        provider_institution_id: parsedAccounts.institutionId,
        institution_name: institutionName ?? '',
        created_by: user.id,
      })
      .select('id')
      .single()
    if (insertError || !inserted) {
      await compensate()
      return errorResponse('exchange_failed')
    }
    institutionId = inserted.id
  }

  // The access token goes to Vault (never a client-readable column) via the
  // service-role-only wrapper RPC; re-links replace the previous secret.
  const { error: secretError } = await service.rpc('store_institution_secret', {
    p_institution_id: institutionId,
    p_secret: tokens.accessToken,
  })
  if (secretError) {
    await compensate()
    return errorResponse('exchange_failed')
  }

  const { error: accountsError } = await service.from('linked_accounts').upsert(
    parsedAccounts.accounts.map((a) => ({
      institution_id: institutionId,
      provider_account_id: a.providerAccountId,
      name: a.name,
      official_name: a.officialName,
      mask: a.mask,
      account_type: a.accountType,
      account_subtype: a.accountSubtype,
    })),
    { onConflict: 'institution_id,provider_account_id' }
  )
  if (accountsError) {
    await compensate()
    return errorResponse('exchange_failed')
  }

  // The link is now fully real (institution + secret + accounts). Marking the
  // session completed is what makes retries idempotent; if THIS write fails we
  // still answer 200 — the connection exists, and the unique item anchor keeps
  // any later replay from duplicating it.
  await service
    .from('plaid_link_sessions')
    .update({
      status: 'completed',
      institution_id: institutionId,
      completed_at: new Date().toISOString(),
    })
    .eq('id', session.id)

  const payload = await institutionPayload(service, institutionId)
  return payload ? json(200, payload) : errorResponse('exchange_failed')
})
