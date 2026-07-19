// Spec 028 — disconnect a SimpleFIN institution (contracts/simplefin-functions.md §3).
// Unlike Plaid there is no provider-side revoke call: the user disables the Access
// Token from the SimpleFIN Bridge itself. Ortho simply drops the stored credential
// and marks the institution disconnected. Idempotent; already-imported transactions
// remain in the ledger (FR-014).
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { errorResponse, json, preflight, requiredEnv } from '../_shared/http.ts'

Deno.serve(async (req) => {
  const pre = preflight(req)
  if (pre) return pre
  if (req.method !== 'POST') return errorResponse('invalid_request')

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

  // Any household member may disconnect (shared facts, shared off-switch).
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

  // Drop the Access URL from Vault, then mark disconnected. No provider revoke:
  // the member turns access off at the Bridge; future syncs skip disconnected rows.
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
