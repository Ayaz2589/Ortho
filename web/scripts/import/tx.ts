// Transaction CRUD CLI (spec 005). Subcommands: list | add | edit | rm.
// Reuses 004's OTP auth, lookups, money/split helpers, and the web-store write
// shapes. Run via `make tx-list/tx-add/tx-edit/tx-rm`. No top-level await (CJS).
import * as readline from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { randomUUID } from 'node:crypto'
import { loadEnv, makeClient, type AuthedClient } from './db/client'
import { listUsers, resolveHousehold } from './db/lookups'
import { getOne, listTransactions, createOne, updateOne, deleteOne } from './db/transactions'
import { parseFilters, CATEGORY_LIST } from './engine/filters'
import { renderTable, renderDetail } from './engine/render'
import { validateAmount, validateMerchant, validateCategory, parseDay, todayISO } from './engine/validate'
import { evenSplit, validateCustomSplit } from './engine/split'
import { parseFlags, flagStr as str, type Flags } from './engine/args'
import type { Transaction, TransactionCategory, TransactionKind, TransactionScope, User } from '../../lib/types'

function die(code: number, msg: string): never {
  console.error(msg)
  process.exit(code)
}

async function authenticate(rl: readline.Interface, admin: boolean): Promise<AuthedClient> {
  const email = admin ? undefined : (process.env.IMPORT_EMAIL ?? (await rl.question('Ortho email: '))).trim()
  try {
    return await makeClient({
      admin,
      email,
      onCodeSent: (e) => console.log(`\nVerification code sent to ${e} — check your email.`),
      requestCode: async () => rl.question('Enter the 6-digit code: '),
    })
  } catch (e) {
    die(5, `Auth error: ${e instanceof Error ? e.message : String(e)}`)
  }
}

function asKind(s: string): TransactionKind {
  if (s !== 'expense' && s !== 'income') die(1, `invalid kind: ${s} (expense|income)`)
  return s
}
function asScope(s: string): TransactionScope {
  if (s !== 'personal' && s !== 'shared') die(1, `invalid scope: ${s} (personal|shared)`)
  return s
}

/** Interactive owner + split picker for shared transactions. */
async function pickOwnersAndSplit(
  rl: readline.Interface,
  members: User[],
  fallbackOwnerId: string
): Promise<{ ownerIds: string[]; splits: Record<string, number> | null }> {
  members.forEach((u, i) => console.log(`  ${i + 1}. ${u.name}`))
  const sel = await rl.question('Owners (comma-separated numbers): ')
  let ownerIds = sel
    .split(',')
    .map((s) => members[Number(s.trim()) - 1]?.id)
    .filter((x): x is string => Boolean(x))
  if (ownerIds.length === 0) ownerIds = [fallbackOwnerId]

  let splits: Record<string, number> | null = null
  if (ownerIds.length >= 2) {
    console.log(`Even split = ${JSON.stringify(evenSplit(ownerIds))}; leave blank for even.`)
    const raw = await rl.question(`Percentages for ${ownerIds.join(', ')} (e.g. 70 30): `)
    if (raw.trim()) {
      const nums = raw.trim().split(/[\s,]+/).map(Number)
      const custom: Record<string, number> = {}
      ownerIds.forEach((id, i) => (custom[id] = nums[i]))
      const v = validateCustomSplit(custom, ownerIds)
      if (!v.ok) die(1, v.error)
      splits = custom
    }
  }
  return { ownerIds, splits }
}

async function cmdList(flags: Flags, rl: readline.Interface): Promise<void> {
  const admin = flags.admin === true
  let filter
  try {
    filter = parseFilters({
      month: str(flags.month),
      category: str(flags.category),
      source: str(flags.source),
      scope: str(flags.scope),
      kind: str(flags.kind),
      limit: str(flags.limit),
    })
  } catch (e) {
    die(1, e instanceof Error ? e.message : String(e))
  }
  const { supabase, userId } = await authenticate(rl, admin)
  const rows = await listTransactions(supabase, userId, filter, admin)
  console.log(renderTable(rows))
}

async function cmdAdd(flags: Flags, rl: readline.Interface): Promise<void> {
  const admin = flags.admin === true
  const merchant = validateMerchant(str(flags.merchant) ?? (await rl.question('Merchant: ')))
  const amountCents = validateAmount(str(flags.amount) ?? (await rl.question('Amount (e.g. 12.34): ')))
  const kind: TransactionKind = asKind(str(flags.kind) ?? 'expense')
  const category: TransactionCategory = str(flags.category)
    ? validateCategory(str(flags.category)!)
    : kind === 'income'
      ? 'income'
      : 'entertainment'
  let scope: TransactionScope = asScope(str(flags.scope) ?? 'personal')
  const dateISO = str(flags.date) ? parseDay(str(flags.date)!) : todayISO(new Date())
  const source = str(flags.source) ?? ''

  const { supabase, userId } = await authenticate(rl, admin)
  let createdBy = userId
  if (admin && !createdBy) {
    const users = await listUsers(supabase)
    if (!users[0]) die(5, 'no users to attribute the row to')
    createdBy = users[0].id
    console.log(`Admin: created_by = ${users[0].name}`)
  }

  let ownerIds = [createdBy]
  let splits: Record<string, number> | null = null
  let householdId: string | null = null
  if (scope === 'shared') {
    const household = await resolveHousehold(supabase, createdBy)
    if (!household.household || household.members.length < 2) die(1, 'shared requires a household with 2+ members')
    const picked = await pickOwnersAndSplit(rl, household.members, createdBy)
    if (picked.ownerIds.length < 2) {
      scope = 'personal' // one owner ⇒ personal
    } else {
      householdId = household.household.id
      ownerIds = picked.ownerIds
      splits = picked.splits
    }
  }

  const now = new Date().toISOString()
  const tx: Transaction = {
    id: randomUUID(),
    household_id: scope === 'shared' ? householdId : null,
    merchant,
    category,
    kind,
    scope,
    amount_cents: amountCents,
    source,
    date: dateISO,
    created_by: createdBy,
    created_at: now,
    updated_at: now,
    owner_ids: ownerIds,
    splits,
  }
  console.log('\n' + renderDetail(tx))
  const ans = await rl.question('\nCreate this transaction? [y/N] ')
  if (!/^y/i.test(ans.trim())) {
    console.log('Aborted — nothing written.')
    return
  }
  await createOne(supabase, tx)
  console.log(`Created ${tx.id.slice(0, 8)}.`)
}

async function cmdEdit(flags: Flags, rl: readline.Interface): Promise<void> {
  const admin = flags.admin === true
  const id = str(flags.id)
  if (!id) die(1, 'tx-edit needs ID=<uuid>')
  const { supabase } = await authenticate(rl, admin)
  const tx = await getOne(supabase, id)
  if (!tx) {
    console.log(`Transaction ${id} not found (or not accessible).`)
    return
  }
  console.log('\nCurrent:\n' + renderDetail(tx))
  console.log('\nEdit — blank keeps the current value.')

  const m = (await rl.question(`Merchant [${tx.merchant}]: `)).trim()
  if (m) tx.merchant = validateMerchant(m)
  const a = (await rl.question(`Amount [${(tx.amount_cents / 100).toFixed(2)}]: `)).trim()
  if (a) tx.amount_cents = validateAmount(a)
  const c = (await rl.question(`Category [${tx.category}]: `)).trim()
  if (c) tx.category = validateCategory(c)
  const d = (await rl.question(`Date [${new Date(tx.date).toISOString().slice(0, 10)}]: `)).trim()
  if (d) tx.date = parseDay(d)
  const k = (await rl.question(`Kind [${tx.kind}]: `)).trim()
  if (k) tx.kind = asKind(k)
  const s = (await rl.question(`Scope [${tx.scope}] (personal/shared): `)).trim()
  if (s) tx.scope = asScope(s)

  if (tx.scope === 'shared') {
    const household = await resolveHousehold(supabase, tx.created_by)
    if (!household.household || household.members.length < 2) die(1, 'shared requires a household with 2+ members')
    tx.household_id = household.household.id
    const keep =
      tx.owner_ids.length >= 2 ? (await rl.question(`Keep current owners (${tx.owner_ids.join(', ')})? [Y/n] `)).trim() : 'n'
    if (/^n/i.test(keep) || tx.owner_ids.length < 2) {
      const picked = await pickOwnersAndSplit(rl, household.members, tx.created_by)
      tx.owner_ids = picked.ownerIds
      tx.splits = picked.splits
    }
    if (tx.owner_ids.length < 2) {
      tx.scope = 'personal'
    }
  }
  if (tx.scope === 'personal') {
    tx.household_id = null
    tx.owner_ids = [tx.created_by]
    tx.splits = null
  }
  tx.updated_at = new Date().toISOString()

  console.log('\nNew:\n' + renderDetail(tx))
  const ans = await rl.question('\nSave changes? [y/N] ')
  if (!/^y/i.test(ans.trim())) {
    console.log('No changes written.')
    return
  }
  await updateOne(supabase, tx)
  console.log(`Updated ${tx.id.slice(0, 8)}.`)
}

async function cmdRm(flags: Flags, rl: readline.Interface): Promise<void> {
  const admin = flags.admin === true
  const id = str(flags.id)
  if (!id) die(1, 'tx-rm needs ID=<uuid>')
  const dryRun = flags['dry-run'] === true
  const { supabase } = await authenticate(rl, admin)
  const tx = await getOne(supabase, id)
  if (!tx) {
    console.log(`Transaction ${id} not found (or not accessible).`)
    return
  }
  console.log('\n' + renderDetail(tx))
  if (dryRun) {
    console.log('\nDry run — nothing deleted.')
    return
  }
  const ans = await rl.question('\nDelete this transaction? [y/N] ')
  if (!/^y/i.test(ans.trim())) {
    console.log('Aborted — nothing deleted.')
    return
  }
  await deleteOne(supabase, id)
  console.log(`Deleted ${tx.id.slice(0, 8)} (${tx.merchant}).`)
}

async function run(): Promise<void> {
  loadEnv()
  const sub = process.argv[2]
  const flags = parseFlags(process.argv.slice(3))
  const rl = readline.createInterface({ input: stdin, output: stdout })
  try {
    switch (sub) {
      case 'list':
        await cmdList(flags, rl)
        break
      case 'add':
        await cmdAdd(flags, rl)
        break
      case 'edit':
        await cmdEdit(flags, rl)
        break
      case 'rm':
        await cmdRm(flags, rl)
        break
      default:
        die(1, `unknown subcommand: ${sub ?? '(none)'} — use list | add | edit | rm`)
    }
  } finally {
    rl.close()
  }
}

run().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e))
  process.exit(1)
})
