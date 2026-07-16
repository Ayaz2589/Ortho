// Spec 024 — disconnect a linked institution (contracts/plaid-functions.md §3).
// Revoke at the provider FIRST, then mark disconnected locally: an unreachable
// provider changes nothing and the member retries — never a silent zombie
// connection (FR-009). Idempotent for already-disconnected institutions.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { errorResponse, json, preflight, requiredEnv } from '../_shared/http.ts'
import {
  createPlaidClient,
  interpretItemRemoveResult,
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

  let institutionId: unknown
  try {
    institutionId = (await req.json())?.institutionId
  } catch {
    return errorResponse('invalid_request')
  }
  if (typeof institutionId !== 'string' || institutionId.length === 0) {
    return errorResponse('invalid_request')
  }

  const service = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

  const { data: institution } = await service
    .from('linked_institutions')
    .select('id, household_id, status')
    .eq('id', institutionId)
    .maybeSingle()
  if (!institution) return errorResponse('institution_not_found')

  // Any household member may disconnect (US3/US4 — shared facts, shared off
  // switch); the caller just has to belong to the institution's household.
  const { data: membership } = await service
    .from('household_members')
    .select('household_id')
    .eq('user_id', user.id)
    .eq('household_id', institution.household_id)
    .maybeSingle()
  if (!membership) return errorResponse('not_household_member')

  if (institution.status === 'disconnected') {
    return json(200, { institutionId: institution.id, status: 'disconnected' })
  }

  // Revoke at Plaid first. A missing secret means there is no live access to
  // revoke (e.g. a compensated half-link) — treat like ITEM_NOT_FOUND.
  const { data: accessToken } = await service.rpc('get_institution_secret', {
    p_institution_id: institution.id,
  })
  if (accessToken) {
    const plaid = createPlaidClient(fetch as unknown as FetchLike, {
      clientId: env.PLAID_CLIENT_ID,
      secret: env.PLAID_SECRET,
      env: env.PLAID_ENV as PlaidEnv,
    })
    const removed = await plaid.post('/item/remove', { access_token: accessToken })
    const outcome = interpretItemRemoveResult(removed)
    if (outcome === 'unreachable') return errorResponse('provider_unreachable')
    if (outcome === 'failed') return errorResponse('disconnect_failed')
  }

  // Access is provably gone — now clean up our side.
  const { error: secretError } = await service.rpc('delete_institution_secret', {
    p_institution_id: institution.id,
  })
  if (secretError) return errorResponse('disconnect_failed')

  const { error: updateError } = await service
    .from('linked_institutions')
    .update({ status: 'disconnected', disconnected_at: new Date().toISOString() })
    .eq('id', institution.id)
  if (updateError) return errorResponse('disconnect_failed')

  return json(200, { institutionId: institution.id, status: 'disconnected' })
})
