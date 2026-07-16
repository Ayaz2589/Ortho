// Spec 024 — start a bank-connection attempt (contracts/plaid-functions.md §1).
// verify_jwt stays ON; the function additionally resolves the caller via
// getUser() and acts ONLY for that user — nothing identity-shaped comes from
// the request body. Thin adapter: all Plaid shapes live in _shared/aggregation.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { errorResponse, json, preflight, requiredEnv } from '../_shared/http.ts'
import {
  buildLinkTokenRequest,
  createPlaidClient,
  parseLinkTokenResponse,
  type FetchLike,
  type PlaidEnv,
} from '../_shared/aggregation/index.ts'

Deno.serve(async (req) => {
  const pre = preflight(req)
  if (pre) return pre
  if (req.method !== 'POST') return errorResponse('invalid_request')

  const env = requiredEnv(
    'PLAID_CLIENT_ID',
    'PLAID_SECRET',
    'PLAID_ENV',
    'APP_BASE_URL',
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

  let mode: unknown
  let language: unknown
  try {
    const body = await req.json()
    mode = body?.mode
    language = body?.language
  } catch {
    return errorResponse('invalid_request')
  }
  if (mode !== 'embedded' && mode !== 'hosted' && mode !== 'probe') {
    return errorResponse('invalid_request')
  }

  const service = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

  // Linked banks are household facts: the caller must belong to one. Ordered
  // for determinism (review 024): a user somehow in two households always
  // links into their FIRST household rather than an arbitrary one.
  const { data: membership } = await service
    .from('household_members')
    .select('household_id')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (!membership) return errorResponse('not_household_member')

  // The FR-012 probe: config + auth + membership verified above, so answer
  // without creating a Plaid session or a DB row. Lets the Linked banks page
  // render its calm "not available yet" state instead of a broken button.
  if (mode === 'probe') return json(200, { configured: true })

  const plaid = createPlaidClient(fetch as unknown as FetchLike, {
    clientId: env.PLAID_CLIENT_ID,
    secret: env.PLAID_SECRET,
    env: env.PLAID_ENV as PlaidEnv,
  })

  const request = buildLinkTokenRequest({
    mode,
    clientUserId: user.id,
    appBaseUrl: env.APP_BASE_URL,
    ...(typeof language === 'string' ? { language } : {}),
  })
  const created = await plaid.post('/link/token/create', request)
  if (!created.ok) return errorResponse(created.code)
  const parsed = parseLinkTokenResponse(created.data)
  if (!parsed) return errorResponse('provider_error')
  if (mode === 'hosted' && !parsed.hostedLinkUrl) return errorResponse('provider_error')

  const { data: session, error: insertError } = await service
    .from('plaid_link_sessions')
    .insert({
      user_id: user.id,
      household_id: membership.household_id,
      mode,
      link_token: parsed.linkToken,
      expires_at: parsed.expiresAt,
    })
    .select('id')
    .single()
  if (insertError || !session) return errorResponse('provider_error')

  return json(200, {
    sessionId: session.id,
    linkToken: parsed.linkToken,
    expiresAt: parsed.expiresAt,
    ...(parsed.hostedLinkUrl ? { hostedLinkUrl: parsed.hostedLinkUrl } : {}),
  })
})
