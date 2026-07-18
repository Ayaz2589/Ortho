// Seed a LOCAL/DEV Supabase from the coverage corpus (spec 026, US3).
// See specs/026-seed-data-harness/contracts/seed-cli.md.
//
//   npm run seed:corpus [-- --seed <n>] [--dry-run] [--i-understand-this-is-not-local]
//
// Reuses the import CLI's client (loadEnv/makeClient admin mode) and column
// mappers (txRecord/shareRows). Writes are UPSERTs keyed on stable corpus ids, so
// re-running is idempotent (FR-008). The safe-target guard (FR-009) refuses any
// non-local target unless a loud double opt-in is set.

import type { SupabaseClient } from '@supabase/supabase-js'
import { loadEnv, makeClient } from './import/db/client'
import { txRecord, shareRows } from './import/db/persist'
import { generateCorpus, toTables } from '../test/corpus/generate'
import type { CorpusTables } from '../test/corpus/model'
import { checkSeedTarget } from '../test/corpus/seed-guard'
import { uuidFrom } from '../test/corpus/ids'

// The corpus uses readable ids; the DB columns are `uuid`. Map every id/FK column
// to a stable UUID so rows are insertable and foreign keys stay consistent.
const U = (id: unknown): unknown => (typeof id === 'string' ? uuidFrom(id) : id)

/** Id/FK columns per table (text columns like `source`/`merchant` are left alone). */
const ID_COLUMNS: Record<string, string[]> = {
  users: ['id'],
  households: ['id', 'owner_id'],
  household_people: ['id', 'household_id', 'linked_user_id'],
  household_members: ['household_id', 'user_id'],
  cards: ['id', 'household_id'],
  properties: ['id', 'household_id'],
  mortgage_info: ['property_id'],
  lease_info: ['property_id'],
  units: ['id', 'property_id'],
  rental_payments: ['id', 'property_id'],
  budgets: ['id', 'household_id'],
  transactions: ['id', 'household_id', 'created_by', 'paid_by'],
  transaction_shares: ['transaction_id', 'person_id'],
}

function remapIds(table: string, rows: unknown[]): unknown[] {
  const cols = ID_COLUMNS[table] ?? []
  return rows.map((row) => {
    const r = { ...(row as Record<string, unknown>) }
    for (const c of cols) if (c in r) r[c] = U(r[c])
    return r
  })
}

interface Args {
  seed?: number
  dryRun: boolean
  overrideFlag: boolean
}

function parseArgs(argv: string[]): Args {
  const args: Args = { dryRun: false, overrideFlag: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--dry-run') args.dryRun = true
    else if (a === '--i-understand-this-is-not-local') args.overrideFlag = true
    else if (a === '--seed') args.seed = Number(argv[++i])
  }
  return args
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
    { table: 'transactions', rows: t.transactions.map(txRecord), onConflict: 'id' },
    { table: 'transaction_shares', rows: t.transactions.flatMap(shareRows), onConflict: 'transaction_id,person_id' },
  ]
}

async function upsertAll(supabase: SupabaseClient, t: CorpusTables): Promise<void> {
  for (const step of seedPlan(t)) {
    if (step.rows.length === 0) {
      console.log(`  ${step.table}: 0 (skipped)`)
      continue
    }
    // Map readable ids → UUIDs, then chunk to keep request bodies reasonable.
    const rows = remapIds(step.table, step.rows)
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

  const corpus = generateCorpus(args.seed)
  const tables = toTables(corpus)
  const total = seedPlan(tables).reduce((n, s) => n + s.rows.length, 0)
  console.log(
    `Coverage corpus: ${corpus.scenarios.length} households, ${tables.transactions.length} transactions, ${total} rows total (seed ${corpus.seed}).`
  )

  const guard = checkSeedTarget({
    url,
    overrideFlag: args.overrideFlag,
    allowRemoteEnv: process.env.SEED_ALLOW_REMOTE === '1',
  })

  if (args.dryRun) {
    console.log('\n[dry-run] planned rows per table:')
    for (const step of seedPlan(tables)) console.log(`  ${step.table}: ${step.rows.length}`)
    console.log(`\n[dry-run] target ${url ?? '(no URL)'} — guard: ${guard.ok ? 'ALLOW' : 'REFUSE'}`)
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
  await upsertAll(supabase, tables)
  console.log('\n✓ Seed complete.')
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exitCode = 1
})
