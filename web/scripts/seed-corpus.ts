// Seed a LOCAL/DEV Supabase from the holistic seed (spec 030, extending spec 026).
//
//   npm run seed:corpus [-- --seed <n>] [--corpus] [--dry-run] [--i-understand-this-is-not-local]
//
// By default it seeds the realistic PRIMARY DEMO household (realism.ts), anchored
// to today, which the local/stage auto-login user owns — so the app opens fully
// populated. Pass `--corpus` to ALSO seed the deterministic edge-coverage corpus
// (spec 026, ~236 households) for exhaustive coverage testing.
//
// Unlike the spec-026 seeder, this one creates the required `auth.users` rows via
// the Admin API (public.users.id FK-references auth.users, and RLS keys off
// auth.uid()), maps every user-id column to the real auth id, and seeds the
// previously-missing tables (tags, transaction_tags, goals, goal_contributions,
// linked_institutions, linked_accounts, entitlements). Writes are UPSERTs on
// stable ids, so re-running is idempotent (FR-011). The safe-target guard
// (FR-014) refuses any non-local target unless a loud double opt-in is set.

import { pathToFileURL } from 'node:url'
import type { SupabaseClient } from '@supabase/supabase-js'
import { loadEnv, makeClient } from './import/db/client'
import { txRecord, shareRows } from './import/db/persist'
import { generateCorpus, toTables } from '../test/corpus/generate'
import type { CorpusTables } from '../test/corpus/model'
import { buildDemoHousehold, DEMO, type DemoHousehold } from '../test/corpus/realism'
import { checkSeedTarget } from '../test/corpus/seed-guard'
import { uuidFrom } from '../test/corpus/ids'

// Non-user id/FK columns → remapped with the deterministic uuidFrom (readable id
// → stable UUID). USER columns are handled separately (they map to the real
// auth.users id, not uuidFrom).
const ID_COLUMNS: Record<string, string[]> = {
  households: ['id'],
  household_people: ['id', 'household_id'],
  household_members: ['household_id'],
  cards: ['id', 'household_id'],
  properties: ['id', 'household_id'],
  mortgage_info: ['property_id'],
  lease_info: ['property_id'],
  units: ['id', 'property_id'],
  rental_payments: ['id', 'property_id'],
  budgets: ['id', 'household_id'],
  transactions: ['id', 'household_id', 'paid_by'],
  transaction_shares: ['transaction_id', 'person_id'],
  tags: ['id', 'household_id'],
  transaction_tags: ['transaction_id', 'tag_id'],
  goals: ['id', 'household_id', 'linked_account_id'],
  goal_contributions: ['id', 'goal_id'],
  linked_institutions: ['id', 'household_id'],
  linked_accounts: ['id', 'institution_id'],
}

// Columns that reference a USER (auth.users / public.users). Mapped to the real
// auth.users id created via the Admin API, NOT uuidFrom.
const USER_COLUMNS: Record<string, string[]> = {
  users: ['id'],
  households: ['owner_id'],
  household_members: ['user_id'],
  household_people: ['linked_user_id'],
  transactions: ['created_by'],
  goals: ['created_by'],
  goal_contributions: ['created_by'],
  linked_institutions: ['created_by'],
  entitlements: ['user_id'],
}

/** Remap a row's id/FK columns: user columns → auth id, everything else → uuidFrom. */
export function remapRow(table: string, row: unknown, userIds: Map<string, string>): unknown {
  const r = { ...(row as Record<string, unknown>) }
  for (const c of ID_COLUMNS[table] ?? []) {
    if (c in r && typeof r[c] === 'string') r[c] = uuidFrom(r[c] as string)
  }
  for (const c of USER_COLUMNS[table] ?? []) {
    if (c in r && typeof r[c] === 'string') {
      const readable = r[c] as string
      // A USER column must reference a user we created an auth.users row for.
      // Fail loud on a miss: silently falling back to uuidFrom() would insert a
      // phantom id with no matching auth.users row, surfacing only as an opaque
      // FK violation later (this seeder exists precisely to close that gap).
      const authId = userIds.get(readable)
      if (authId === undefined) {
        throw new Error(
          `remapRow: ${table}.${c} references user "${readable}", which has no auth.users row ` +
            `(it was not in tables.users, so ensureAuthUsers created no id for it). ` +
            `Add it to the seeded users instead of inserting a dangling foreign key.`
        )
      }
      r[c] = authId
    }
  }
  return r
}

export function remapRows(table: string, rows: unknown[], userIds: Map<string, string>): unknown[] {
  return rows.map((row) => remapRow(table, row, userIds))
}

interface Args {
  seed?: number
  dryRun: boolean
  overrideFlag: boolean
  corpus: boolean
}

function parseArgs(argv: string[]): Args {
  const args: Args = { dryRun: false, overrideFlag: false, corpus: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--dry-run') args.dryRun = true
    else if (a === '--i-understand-this-is-not-local') args.overrideFlag = true
    else if (a === '--corpus') args.corpus = true
    else if (a === '--seed') args.seed = Number(argv[++i])
  }
  return args
}

/** Flatten a demo household into the Supabase-shaped table maps. */
function demoTables(demo: DemoHousehold): CorpusTables {
  const t = emptyTables()
  t.users.push(...demo.users)
  t.households.push(demo.household)
  t.household_people.push(...demo.people)
  t.household_members.push(...demo.members)
  t.cards.push(...demo.cards)
  for (const gp of demo.properties) {
    t.properties.push(gp.property)
    if (gp.mortgage) t.mortgage_info.push(gp.mortgage)
    if (gp.lease) t.lease_info.push(gp.lease)
    t.units.push(...gp.units)
    t.rental_payments.push(...gp.rentalPayments)
  }
  for (const gt of demo.transactions) {
    t.transactions.push(gt.transaction)
    t.transaction_shares.push(...gt.shares)
    for (const tagId of gt.transaction.tags ?? []) {
      t.transaction_tags.push({ transaction_id: gt.transaction.id, tag_id: tagId })
    }
  }
  t.budgets.push(...demo.budgets)
  t.tags.push(...demo.tags)
  t.goals.push(...demo.goals)
  t.goal_contributions.push(...demo.goalContributions)
  t.linked_institutions.push(...demo.linkedInstitutions)
  t.linked_accounts.push(...demo.linkedAccounts)
  t.entitlements.push(...demo.entitlements)
  return t
}

function emptyTables(): CorpusTables {
  return {
    users: [], households: [], household_people: [], household_members: [], cards: [],
    transactions: [], transaction_shares: [], properties: [], mortgage_info: [], lease_info: [],
    units: [], rental_payments: [], budgets: [], tags: [], transaction_tags: [], goals: [],
    goal_contributions: [], linked_institutions: [], linked_accounts: [], entitlements: [],
  }
}

/** Concatenate two table maps table-by-table. */
function mergeTables(a: CorpusTables, b: CorpusTables): CorpusTables {
  const out = emptyTables()
  for (const key of Object.keys(out) as (keyof CorpusTables)[]) {
    ;(out[key] as unknown[]).push(...(a[key] as unknown[]), ...(b[key] as unknown[]))
  }
  return out
}

/** A synthesized, deterministic email for a corpus user (non-demo). */
function synthEmail(readableUserId: string): string {
  return `seed-${readableUserId.replace(/[^a-z0-9-]/gi, '-').toLowerCase()}@ortho.test`
}

/** The demo owner's real credentials (must match the app's autologin env). */
function demoCreds(): { email: string; password: string } {
  return {
    email: process.env.SEED_USER_EMAIL ?? DEMO.ownerEmail,
    password: process.env.SEED_USER_PASSWORD ?? 'ortho-seed-password',
  }
}
const DEFAULT_SEED_PASSWORD = process.env.SEED_USER_PASSWORD ?? 'ortho-seed-password'

/** Find an existing auth user's id by email (paginated). */
async function findAuthUserId(supabase: SupabaseClient, email: string): Promise<string | null> {
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw new Error(`listUsers: ${error.message}`)
    const found = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())
    if (found) return found.id
    if (data.users.length < 200) break
  }
  return null
}

/** Idempotently ensure an auth.users row exists; returns its id. */
async function ensureAuthUser(supabase: SupabaseClient, email: string, password: string): Promise<string> {
  const { data, error } = await supabase.auth.admin.createUser({ email, password, email_confirm: true })
  if (!error && data.user) return data.user.id
  // Already registered (or a transient race) → look it up.
  const existing = await findAuthUserId(supabase, email)
  if (existing) return existing
  throw new Error(`ensureAuthUser(${email}): ${error?.message ?? 'unknown'}`)
}

/** Create auth.users for every seeded user; returns readable-id → auth-id map. */
async function ensureAuthUsers(
  supabase: SupabaseClient,
  tables: CorpusTables
): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  const creds = demoCreds()
  for (const user of tables.users) {
    const readable = user.id
    const isDemoOwner = readable === DEMO.ownerUserId
    const email = isDemoOwner ? creds.email : synthEmail(readable)
    const password = isDemoOwner ? creds.password : DEFAULT_SEED_PASSWORD
    const authId = await ensureAuthUser(supabase, email, password)
    map.set(readable, authId)
  }
  return map
}

/** Insert order respects foreign keys. Each entry: table, rows, conflict key. */
function seedPlan(t: CorpusTables): Array<{ table: string; rows: unknown[]; onConflict: string }> {
  return [
    { table: 'users', rows: t.users, onConflict: 'id' },
    { table: 'households', rows: t.households, onConflict: 'id' },
    { table: 'household_people', rows: t.household_people, onConflict: 'id' },
    { table: 'household_members', rows: t.household_members, onConflict: 'household_id,user_id' },
    { table: 'cards', rows: t.cards, onConflict: 'id' },
    { table: 'properties', rows: t.properties, onConflict: 'id' },
    { table: 'mortgage_info', rows: t.mortgage_info, onConflict: 'property_id' },
    { table: 'lease_info', rows: t.lease_info, onConflict: 'property_id' },
    { table: 'units', rows: t.units, onConflict: 'id' },
    { table: 'rental_payments', rows: t.rental_payments, onConflict: 'id' },
    { table: 'budgets', rows: t.budgets, onConflict: 'id' },
    { table: 'tags', rows: t.tags, onConflict: 'id' },
    // Banks before goals (goals may reference a linked_account_id).
    { table: 'linked_institutions', rows: t.linked_institutions, onConflict: 'id' },
    { table: 'linked_accounts', rows: t.linked_accounts, onConflict: 'id' },
    { table: 'goals', rows: t.goals, onConflict: 'id' },
    { table: 'transactions', rows: t.transactions.map(txRecord), onConflict: 'id' },
    { table: 'transaction_shares', rows: t.transactions.flatMap(shareRows), onConflict: 'transaction_id,person_id' },
    { table: 'transaction_tags', rows: t.transaction_tags, onConflict: 'transaction_id,tag_id' },
    { table: 'goal_contributions', rows: t.goal_contributions, onConflict: 'id' },
    // Entitlements last: service-role bypasses RLS (client cannot write them).
    { table: 'entitlements', rows: t.entitlements, onConflict: 'user_id' },
  ]
}

async function upsertAll(supabase: SupabaseClient, t: CorpusTables, userIds: Map<string, string>): Promise<void> {
  for (const step of seedPlan(t)) {
    if (step.rows.length === 0) {
      console.log(`  ${step.table}: 0 (skipped)`)
      continue
    }
    const rows = remapRows(step.table, step.rows, userIds)
    const CHUNK = 500
    let written = 0
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK)
      const { error } = await supabase.from(step.table).upsert(chunk as never, { onConflict: step.onConflict })
      if (error) throw new Error(`UPSERT ${step.table} (${written} written): ${error.message}`)
      written += chunk.length
    }
    console.log(`  ${step.table}: ${written} upserted`)
  }
}

async function main(): Promise<void> {
  loadEnv()
  const args = parseArgs(process.argv.slice(2))
  if (args.seed !== undefined && !Number.isInteger(args.seed)) {
    console.error('✗ Invalid --seed: expected an integer (e.g. --seed 42).')
    process.exitCode = 1
    return
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL

  // The demo household is anchored to today so the seeded app is populated when
  // viewed now (the edge corpus stays pinned to its fixed epoch for coverage).
  const demo = demoTables(buildDemoHousehold(new Date()))
  const tables = args.corpus ? mergeTables(demo, toTables(generateCorpus(args.seed))) : demo

  const plan = seedPlan(tables)
  const total = plan.reduce((n, s) => n + s.rows.length, 0)
  console.log(
    `Holistic seed: ${args.corpus ? 'demo + edge corpus' : 'demo only'} — ${tables.households.length} households, ` +
      `${tables.users.length} users, ${tables.transactions.length} transactions, ${total} rows total.`
  )

  const guard = checkSeedTarget({
    url,
    overrideFlag: args.overrideFlag,
    allowRemoteEnv: process.env.SEED_ALLOW_REMOTE === '1',
  })

  if (args.dryRun) {
    console.log('\n[dry-run] planned rows per table:')
    for (const step of plan) console.log(`  ${step.table}: ${step.rows.length}`)
    console.log(`\n[dry-run] auth.users to ensure: ${tables.users.length}`)
    console.log(`[dry-run] target ${url ?? '(no URL)'} — guard: ${guard.ok ? 'ALLOW' : 'REFUSE'}`)
    if (!guard.ok) console.log(`  ${guard.reason}`)
    return
  }

  if (!guard.ok) {
    console.error(`\n✗ ${guard.reason}`)
    process.exitCode = 1
    return
  }

  console.log(`\nSeeding ${url} …`)
  const { supabase } = await makeClient({ admin: true })
  console.log(`Ensuring ${tables.users.length} auth.users …`)
  const userIds = await ensureAuthUsers(supabase, tables)
  await upsertAll(supabase, tables, userIds)
  const creds = demoCreds()
  console.log(`\n✓ Seed complete. Auto-login as ${creds.email} (owner of the demo household).`)
}

// Only run the CLI when invoked directly (so tests can import the remap helpers).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exitCode = 1
  })
}
