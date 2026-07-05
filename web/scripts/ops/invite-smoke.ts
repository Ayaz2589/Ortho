/**
 * Spec 017 FR-026 — [OPERATOR-PENDING] live end-to-end smoke of the partner
 * invite/join/claim path against the HOSTED backend, using disposable scratch
 * data that is fully cleaned up afterwards. It exercises the REAL rails: a
 * GoTrue-admin-minted partner account, a real `pending_invites` row, the real
 * `accept_invite` RPC, and the guarded `linked_user_id` claim update.
 *
 * Run from a networked host (the dev sandbox cannot reach the hosted project):
 *   cd web && DRY_RUN=1 npx tsx scripts/ops/invite-smoke.ts   # print the plan
 *   cd web && npx tsx scripts/ops/invite-smoke.ts             # run + clean up
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY in web/.env.local. Never touches rows it
 * did not create. Exit codes: 0 = pass · 1 = fail (cleanup attempted either way).
 */
import { createClient } from '@supabase/supabase-js'
import { createHash, randomUUID } from 'node:crypto'
import { loadEnv } from '../import/db/client'
import {
  generateInviteCode,
  canonicalizeInviteCode,
} from '../../lib/invites'

const PLAN = `Plan (all rows scratch, all cleaned up):
  1. service-role: create household "017-smoke <ts>" + owner user (GoTrue admin, email-confirmed)
  2. service-role: create an UNLINKED scratch Person "Smoke Partner" in it (the claim target)
  3. service-role: insert a pending_invite (7-day expiry, sha256 of a fresh code)
  4. GoTrue admin: mint the disposable partner account (email-confirmed, random password)
  5. AS THE PARTNER (anon key + password session): rpc accept_invite(<canonical code>)
     → expect the scratch household id back; membership row created
  6. AS THE PARTNER: UPDATE household_people SET linked_user_id = partner
     WHERE id = <scratch person> AND linked_user_id IS NULL → expect 1 row
  7. AS THE PARTNER: re-redeem the same code → expect the 'invalid/redeemed/expired' error
  8. cleanup: delete household (cascades members/people/invites), delete both auth users`

async function main(): Promise<number> {
  loadEnv()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !service || !anon) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / anon key in web/.env.local')
    return 1
  }
  if (process.env.DRY_RUN === '1') {
    console.log(PLAN)
    return 0
  }

  const admin = createClient(url, service, { auth: { persistSession: false } })
  const ts = Date.now()
  const ownerEmail = `ortho-017-smoke-owner-${ts}@example.com`
  const partnerEmail = `ortho-017-smoke-partner-${ts}@example.com`
  const partnerPassword = randomUUID()
  let householdId: string | null = null
  let ownerId: string | null = null
  let partnerId: string | null = null
  const failures: string[] = []
  const step = (name: string, ok: boolean, detail = '') => {
    console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
    if (!ok) failures.push(name)
    return ok
  }

  try {
    // 1-2. Scratch owner + household + unlinked person (service-role writes).
    const ownerRes = await admin.auth.admin.createUser({ email: ownerEmail, email_confirm: true })
    if (!step('mint scratch owner', !ownerRes.error, ownerRes.error?.message)) return finish()
    ownerId = ownerRes.data.user!.id
    await admin.from('users').insert({ id: ownerId, name: 'Smoke Owner', initial: 'S', color_key: 'sage' })

    householdId = randomUUID()
    const hh = await admin.from('households').insert({ id: householdId, owner_id: ownerId, name: `017-smoke ${ts}` })
    if (!step('create scratch household', !hh.error, hh.error?.message)) return finish()
    await admin.from('household_members').insert({ household_id: householdId, user_id: ownerId, role: 'owner' })

    const personId = randomUUID()
    const person = await admin.from('household_people').insert({
      id: personId, household_id: householdId, name: 'Smoke Partner', initial: 'S',
      color_key: 'sand', linked_user_id: null, sort_order: 1,
    })
    if (!step('create unlinked claim target', !person.error, person.error?.message)) return finish()

    // 3. The invite — the same codec convention as both apps (contract §1-§4).
    const code = generateInviteCode()
    const canonical = canonicalizeInviteCode(code)
    const tokenHash = createHash('sha256').update(canonical, 'utf8').digest('hex')
    const invite = await admin.from('pending_invites').insert({
      household_id: householdId, role: 'member', token_hash: tokenHash,
      expires_at: new Date(ts + 7 * 24 * 60 * 60 * 1000).toISOString(), created_by: ownerId,
    })
    if (!step('insert pending invite', !invite.error, invite.error?.message)) return finish()

    // 4. The disposable partner (password auth just for this smoke — the apps
    // use OTP; the RPC only cares about an authenticated session).
    const partnerRes = await admin.auth.admin.createUser({
      email: partnerEmail, password: partnerPassword, email_confirm: true,
    })
    if (!step('mint disposable partner', !partnerRes.error, partnerRes.error?.message)) return finish()
    partnerId = partnerRes.data.user!.id
    await admin.from('users').insert({ id: partnerId, name: 'Smoke Joiner', initial: 'S', color_key: 'slate' })

    const partner = createClient(url, anon, { auth: { persistSession: false } })
    const signIn = await partner.auth.signInWithPassword({ email: partnerEmail, password: partnerPassword })
    if (!step('partner session', !signIn.error, signIn.error?.message)) return finish()

    // 5. The real redemption.
    const redeem = await partner.rpc('accept_invite', { p_token: canonical })
    step('accept_invite returns the household', !redeem.error && redeem.data === householdId,
      redeem.error?.message ?? `got ${String(redeem.data)}`)

    const membership = await partner.from('household_members')
      .select('role').eq('household_id', householdId).eq('user_id', partnerId)
    step('membership row exists (member)', !membership.error && membership.data?.[0]?.role === 'member')

    // 6. The guarded claim.
    const claim = await partner.from('household_people')
      .update({ linked_user_id: partnerId })
      .eq('id', personId).is('linked_user_id', null).select('id')
    step('guarded person claim (1 row)', !claim.error && (claim.data?.length ?? 0) === 1, claim.error?.message)

    // 7. One-time-ness.
    const again = await partner.rpc('accept_invite', { p_token: canonical })
    step('re-redemption is refused', Boolean(again.error),
      again.error ? again.error.message : 'unexpectedly succeeded')

    return finish()
  } catch (e) {
    console.error('unexpected failure:', (e as Error).message)
    failures.push('unexpected')
    return finish()
  }

  async function finish(): Promise<number> {
    // 8. Cleanup — cascade kills members/people/invites with the household.
    if (householdId) await admin.from('households').delete().eq('id', householdId)
    if (partnerId) {
      await admin.from('users').delete().eq('id', partnerId)
      await admin.auth.admin.deleteUser(partnerId)
    }
    if (ownerId) {
      await admin.from('users').delete().eq('id', ownerId)
      await admin.auth.admin.deleteUser(ownerId)
    }
    console.log(failures.length === 0 ? 'SMOKE PASS — invite/join/claim verified live.' : `SMOKE FAIL — ${failures.join('; ')}`)
    return failures.length === 0 ? 0 : 1
  }
}

if (process.argv[1]?.endsWith('invite-smoke.ts')) {
  main().then((code) => process.exit(code))
}
