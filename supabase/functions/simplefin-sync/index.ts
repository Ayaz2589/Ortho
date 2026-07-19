// Spec 028 — sync a SimpleFIN connection's transactions into the ledger
// (contracts/simplefin-functions.md §2, accounts-sync-lifecycle.md). Pull
// GET /accounts for the sync window, normalize each amount to (abs cents, kind),
// dedupe on a deterministic ledger id, and write through the atomic
// upsert_transaction RPC with a default single-person split. Idempotent by
// construction — re-syncing an overlapping window creates no duplicates.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { errorResponse, json, preflight, requiredEnv } from '../_shared/http.ts'
import {
  buildAccountsQuery,
  buildSyncWindow,
  createSimpleFinClient,
  parseSimpleFinAccounts,
  toUpsertPayload,
  type SimpleFinFetch,
  type UpsertContext,
} from '../_shared/aggregation/index.ts'
import { isManualRefreshBlocked, pickDefaultPerson, type HouseholdPerson } from './sync-logic.ts'

/** Unmatched-expense fallback category — mirrors the CLI import engine (spec 028). */
const DEFAULT_EXPENSE_CATEGORY = 'entertainment'

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

  let body: { institutionId?: unknown; manual?: unknown }
  try {
    body = (await req.json()) ?? {}
  } catch {
    return errorResponse('invalid_request')
  }
  const institutionId = body.institutionId
  const manual = body.manual === true
  if (typeof institutionId !== 'string' || institutionId.length === 0) {
    return errorResponse('invalid_request')
  }

  const service = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

  const { data: institution } = await service
    .from('linked_institutions')
    .select('id, household_id, created_by, provider, status, last_synced_at, last_manual_refresh_at')
    .eq('id', institutionId)
    .maybeSingle()
  if (!institution || institution.provider !== 'simplefin' || institution.status !== 'active') {
    return errorResponse('institution_not_found')
  }

  const { data: membership } = await service
    .from('household_members')
    .select('household_id')
    .eq('user_id', user.id)
    .eq('household_id', institution.household_id)
    .maybeSingle()
  if (!membership) return errorResponse('not_household_member')

  const nowMs = Date.now()
  if (manual && isManualRefreshBlocked(institution.last_manual_refresh_at, nowMs)) {
    return errorResponse('rate_limited')
  }

  const { data: accessUrl, error: secretError } = await service.rpc('get_institution_secret', {
    p_institution_id: institution.id,
  })
  if (secretError || !accessUrl) return errorResponse('sync_failed')

  const lastSyncedSec = institution.last_synced_at
    ? Math.floor(Date.parse(institution.last_synced_at) / 1000)
    : null
  const window = buildSyncWindow(lastSyncedSec, Math.floor(nowMs / 1000))

  const client = createSimpleFinClient(fetch as unknown as SimpleFinFetch)
  const res = await client.getAccounts(accessUrl, buildAccountsQuery(window.start, window.end))
  if (!res.ok) {
    return errorResponse(res.code === 'provider_unreachable' ? 'provider_unreachable' : 'sync_failed')
  }
  const parsed = parseSimpleFinAccounts(res.data)

  // Default split target (research D7).
  const { data: people } = await service
    .from('household_people')
    .select('id, linked_user_id, sort_order, removed_at')
    .eq('household_id', institution.household_id)
  const defaultPersonId = pickDefaultPerson((people ?? []) as HouseholdPerson[], institution.created_by)
  if (!defaultPersonId) return errorResponse('sync_failed')

  const ctx: UpsertContext = {
    householdId: institution.household_id,
    createdBy: institution.created_by,
    defaultPersonId,
    defaultExpenseCategory: DEFAULT_EXPENSE_CATEGORY,
  }

  // A pending transaction can arrive with no date (posted=0, no transacted_at).
  // Fall back to sync time so it never lands on the 1970 epoch; when it later
  // posts with a real date, the same deterministic ledger id updates it in place.
  const nowSec = Math.floor(nowMs / 1000)
  const payloads = parsed.transactions.map((t) =>
    toUpsertPayload(t.postedAt > 0 ? t : { ...t, postedAt: nowSec }, ctx)
  )

  // Split imported vs updated by checking which ledger ids already exist.
  let imported = 0
  let updated = 0
  if (payloads.length > 0) {
    const ids = payloads.map((p) => p.tx.id)
    // Scope by household — the ledger id is already household-namespaced, but keep
    // the read inside the household boundary too (defense in depth).
    const { data: existing } = await service
      .from('transactions')
      .select('id')
      .eq('household_id', institution.household_id)
      .in('id', ids)
    const existingIds = new Set((existing ?? []).map((r: { id: string }) => r.id))
    for (const p of payloads) {
      const { error: upsertError } = await service.rpc('upsert_transaction', {
        p_tx: p.tx,
        p_shares: p.shares,
      })
      if (upsertError) {
        // Each upsert is atomic; a mid-loop failure leaves prior rows committed
        // and the ledger consistent. Report what succeeded (FR-012).
        return json(200, {
          institutionId: institution.id,
          imported,
          updated,
          warnings: [...parsed.warnings, 'Some transactions could not be saved; try again.'],
        })
      }
      if (existingIds.has(p.tx.id)) updated++
      else imported++
    }
  }

  await service.rpc('mark_simplefin_synced', {
    p_institution_id: institution.id,
    p_synced_at: new Date(window.end * 1000).toISOString(),
    p_manual: manual,
  })

  return json(200, { institutionId: institution.id, imported, updated, warnings: parsed.warnings })
})
