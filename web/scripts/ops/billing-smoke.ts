// [OPERATOR-PENDING] Spec 018 — guided live smoke walk (quickstart.md §3).
// Interactive: prints each verification step, shows the relevant live state
// (read-only service-role selects between steps), and waits for Enter. All
// MUTATIONS are printed as SQL/dashboard actions for the OPERATOR to perform —
// this script never writes anything itself.
// Run: cd web && OPERATOR=1 SMOKE_EMAIL=you@example.com npx tsx scripts/ops/billing-smoke.ts
import { createInterface } from 'node:readline/promises'
import { loadEnv } from '../import/db/client'

loadEnv()

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const email = process.env.SMOKE_EMAIL

const rl = createInterface({ input: process.stdin, output: process.stdout })
const pause = async (msg = 'Press Enter when done…') => {
  await rl.question(`   ${msg}`)
}

async function select(path: string): Promise<unknown> {
  const res = await fetch(`${url}/rest/v1/${path}`, {
    headers: { apikey: serviceKey!, Authorization: `Bearer ${serviceKey}` },
  })
  return res.ok ? res.json() : `HTTP ${res.status}`
}

async function showEntitlement(userId: string) {
  const rows = (await select(
    `entitlements?user_id=eq.${userId}&select=status,access_expires_at,plan,source,stripe_customer_id,last_event_at`
  )) as unknown[]
  console.log('   entitlement:', JSON.stringify(Array.isArray(rows) ? rows[0] ?? null : rows))
}

async function showRecentEvents(userId: string) {
  const rows = await select(
    `billing_events?user_id=eq.${userId}&select=event_type,outcome,event_created_at&order=received_at.desc&limit=6`
  )
  console.log('   recent events:', JSON.stringify(rows))
}

async function main() {
  if (process.env.OPERATOR !== '1') {
    console.error('This walk inspects the LIVE project. Re-run with OPERATOR=1.')
    process.exit(2)
  }
  if (!url || !serviceKey || serviceKey.includes('YOUR_') || !email) {
    console.error('Need NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (web/.env.local) and SMOKE_EMAIL=<test user email>.')
    process.exit(2)
  }

  console.log(`\nOrtho billing smoke walk — test user: ${email}`)
  console.log('Prereq: billing-probe.ts is ALL GREEN, Stripe is in TEST mode.\n')

  // Resolve the test user.
  const users = (await select(`users?select=id,name&limit=1000`)) as Array<{ id: string; name: string }>
  console.log(`Found ${Array.isArray(users) ? users.length : '?'} profile rows (name shown after sign-in).`)
  console.log(`1) Sign in on the WEB as ${email} (fresh account preferred).`)
  await pause('Enter once signed in and the app has loaded…')
  const authRes = await fetch(`${url}/auth/v1/admin/users?page=1&per_page=100`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  })
  const authBody = (await authRes.json()) as { users?: Array<{ id: string; email?: string }> }
  const user = authBody.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase())
  if (!user) {
    console.error(`Could not find an auth user for ${email} — sign in first, then re-run.`)
    process.exit(1)
  }
  console.log(`   user id: ${user.id}`)
  await showEntitlement(user.id)
  console.log('   EXPECT: status trialing, expiry ≈ 31 days out, app fully usable.\n')

  console.log('2) Force the trial to lapse — run in the SQL editor:')
  console.log(`   update entitlements set access_expires_at = now() - interval '4 days' where user_id = '${user.id}';`)
  await pause('Enter after running the SQL and reloading the web app…')
  await showEntitlement(user.id)
  console.log('   EXPECT: the paywall blocks everything; plans show operator prices.\n')

  console.log('3) Subscribe MONTHLY with test card 4242 4242 4242 4242.')
  await pause('Enter after checkout returns to Settings and "check again" unblocks…')
  await showEntitlement(user.id)
  await showRecentEvents(user.id)
  console.log('   EXPECT: status active, plan monthly; checkout.session.completed + invoice.paid applied.\n')

  console.log('4) Portal: switch monthly → yearly (Settings → Manage).')
  await pause()
  await showEntitlement(user.id)
  console.log('   EXPECT: plan yearly via subscription_updated.\n')

  console.log('5) Dunning: attach failing card 4000 0000 0000 0341 in the portal, then:')
  console.log('   stripe trigger invoice.payment_failed   # or advance a test clock')
  await pause()
  await showEntitlement(user.id)
  await showRecentEvents(user.id)
  console.log('   EXPECT: status past_due; app STILL fully usable; calm Settings notice (FR-020/026).\n')

  console.log('6) Replay check (idempotency, SC-007): pick an applied event id and run:')
  console.log('   stripe events resend <evt_...>')
  await pause()
  await showRecentEvents(user.id)
  console.log('   EXPECT: webhook 200, outcome noop, entitlement row unchanged.\n')

  console.log('7) Cancel in the portal; verify access persists until period end (test clock to fast-forward).')
  await pause()
  await showEntitlement(user.id)
  console.log('   EXPECT: status canceled, access until access_expires_at, then paywall.\n')

  console.log('8) Admin bypass — GRANT (run in SQL editor):')
  console.log(`   update entitlements set status='admin', access_expires_at=null, plan=null, source='operator' where user_id='${user.id}';`)
  console.log('   REVOKE (back to a normal lapsed user):')
  console.log(`   update entitlements set status='trialing', access_expires_at=created_at + interval '31 days', source='trial' where user_id='${user.id}';`)
  await pause('Enter after verifying the admin account never sees the paywall…')
  await showEntitlement(user.id)

  console.log('\n9) iOS pass: expired user → paywall → plan opens Safari checkout → pay → "Check again" → in (quickstart §3.9).')
  console.log('10) Repeat 2–3 in LIVE mode with a real card before announcing.\n')
  console.log('Smoke walk complete. Record the outcome in specs/018-subscription-system/tasks.md (T030/T045 notes).')
  rl.close()
}

main().catch((e) => {
  console.error('smoke walk crashed:', e)
  process.exit(1)
})
