// Transaction CRUD CLI (spec 005). Subcommands: list | add | edit | rm.
// Reuses 004's OTP auth, lookups, money/split helpers, and the web-store write
// shapes. Run via `make tx-list/tx-add/tx-edit/tx-rm`. No top-level await (CJS).
import * as readline from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { randomUUID } from 'node:crypto'
import { loadEnv, makeClient, type AuthedClient } from './db/client'
import { listUsers, listAllPeople, resolveHousehold } from './db/lookups'
import { getOne, listTransactions, createOne, updateOne, deleteOne } from './db/transactions'
import { parseListArgs, resolveOwnerIds, type ParsedList } from './engine/filters'
import { filterTransactions } from '../../lib/transactionFilters'
import { renderTable, renderDetail } from './engine/render'
import { validateAmount, validateMerchant, validateCategory, parseDay, todayISO } from './engine/validate'
import { validateCustomSplit } from './engine/split'
import { computeShares, orderedOwnerIds, seedSplit, type SplitInput } from '../../lib/splits'
import { parseFlags, flagStr as str, type Flags } from './engine/args'
import type { Transaction, TransactionCategory, TransactionKind, Person } from '../../lib/types'

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
      requestCode: async () => rl.question('Enter the 8-digit code: '),
    })
  } catch (e) {
    die(5, `Auth error: ${e instanceof Error ? e.message : String(e)}`)
  }
}

function asKind(s: string): TransactionKind {
  if (s !== 'expense' && s !== 'income') die(1, `invalid kind: ${s} (expense|income)`)
  return s
}

/** Interactive owner + split picker. Returns owners (person ids) and the
 *  resolved cents shares (even by default, or operator percentages). */
async function pickOwnersAndSplit(
  rl: readline.Interface,
  people: Person[],
  fallbackOwnerId: string,
  amountCents: number
): Promise<{ ownerIds: string[]; shares: Record<string, number> }> {
  people.forEach((u, i) => console.log(`  ${i + 1}. ${u.name}`))
  const sel = await rl.question('Owners (comma-separated numbers): ')
  let ownerIds = [
    ...new Set(
      sel
        .split(',')
        .map((s) => people[Number(s.trim()) - 1]?.id)
        .filter((x): x is string => Boolean(x))
    ),
  ]
  if (ownerIds.length === 0) ownerIds = [fallbackOwnerId]

  let split: SplitInput = { method: 'even' }
  if (ownerIds.length >= 2) {
    console.log(`Even split = ${JSON.stringify(computeShares(amountCents, orderedOwnerIds(ownerIds), { method: 'even' }))} cents; leave blank for even.`)
    const raw = await rl.question(`Percentages for ${ownerIds.join(', ')} (e.g. 70 30): `)
    if (raw.trim()) {
      const nums = raw.trim().split(/[\s,]+/).map(Number)
      const percents: Record<string, number> = {}
      ownerIds.forEach((id, i) => (percents[id] = nums[i]))
      const v = validateCustomSplit(percents, ownerIds)
      if (!v.ok) die(1, v.error)
      split = { method: 'percent', percents }
    }
  }
  return { ownerIds, shares: computeShares(amountCents, orderedOwnerIds(ownerIds), split) }
}

async function cmdList(flags: Flags, rl: readline.Interface): Promise<void> {
  const admin = flags.admin === true
  let parsed: ParsedList
  try {
    parsed = parseListArgs({
      month: str(flags.month),
      query: str(flags.query),
      category: str(flags.category),
      source: str(flags.source),
      kind: str(flags.kind),
      owner: str(flags.owner),
      limit: str(flags.limit),
    })
  } catch (e) {
    die(1, e instanceof Error ? e.message : String(e))
  }
  const { supabase, userId } = await authenticate(rl, admin)

  // Scope matches the apps: the whole household (spec 013 US5) — admin mode
  // (service role, no session user) spans all households.
  let householdId: string | null = null
  let people: Person[] = []
  if (admin) {
    people = await listAllPeople(supabase)
  } else {
    const hh = await resolveHousehold(supabase, userId)
    if (!hh.household) die(1, 'no household found for this user')
    householdId = hh.household.id
    people = hh.people
  }

  let owners: string[] = []
  try {
    owners = resolveOwnerIds(people, parsed.ownerNames)
  } catch (e) {
    die(1, e instanceof Error ? e.message : String(e))
  }

  // Date window in SQL; every other criterion through the apps' shared
  // filtering brain (same set the apps show — SC-005).
  const { rows, truncated } = await listTransactions(supabase, householdId, parsed.window, parsed.limit)
  const ownerNames = Object.fromEntries(people.map((p) => [p.id, p.name]))
  const visible = filterTransactions(rows, { ...parsed.criteria, owners }, { ownerNames })
  console.log(renderTable(visible))
  if (truncated) {
    console.log(
      `\nShowing the first ${parsed.limit} rows by date — pass LIMIT=<n> for more (filters applied after the cap).`
    )
  }
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

  const household = await resolveHousehold(supabase, createdBy)
  if (!household.household) die(1, 'no household found for this user')
  const defaultOwnerId = household.defaultPersonId || createdBy

  let ownerIds = [defaultOwnerId]
  let shares = computeShares(amountCents, orderedOwnerIds(ownerIds), { method: 'even' })
  if (household.people.length >= 2) {
    const yn = (await rl.question('Split with other household people? [y/N] ')).trim()
    if (/^y/i.test(yn)) {
      const picked = await pickOwnersAndSplit(rl, household.people, defaultOwnerId, amountCents)
      ownerIds = picked.ownerIds
      shares = picked.shares
    }
  }

  const now = new Date().toISOString()
  const tx: Transaction = {
    id: randomUUID(),
    household_id: household.household.id,
    merchant,
    category,
    kind,
    amount_cents: amountCents,
    source,
    date: dateISO,
    created_by: createdBy,
    created_at: now,
    updated_at: now,
    owner_ids: ownerIds,
    shares,
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

  // Capture the stored split BEFORE any edits, so a no-op edit round-trips
  // losslessly (matches the apps' seedSplit-based edit form).
  const originalAmount = tx.amount_cents
  const originalShares = { ...tx.shares }

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

  // Resolve the creator's household ONLY to source the people/default owner for
  // the reassign prompt below — do NOT overwrite tx.household_id with it. The
  // transaction already carries its correct household from load; recomputing it
  // from the creator's *current* membership would silently RELOCATE the
  // transaction to a different household if the creator has since moved (e.g. an
  // unrelated merchant-typo edit).
  const household = await resolveHousehold(supabase, tx.created_by)
  const defaultOwnerId = household.defaultPersonId || tx.created_by
  const reassign = (await rl.question(`Owners [${tx.owner_ids.join(', ')}] — reassign? [y/N] `)).trim()
  if (/^y/i.test(reassign) && household.people.length) {
    const picked = await pickOwnersAndSplit(rl, household.people, defaultOwnerId, tx.amount_cents)
    tx.owner_ids = picked.ownerIds
    tx.shares = picked.shares
  } else {
    // Owners kept — preserve the STORED split rather than flattening to even
    // (the old behavior silently destroyed a custom split whenever the operator
    // edited any other field). Reconstruct the split from the original shares:
    const ordered = orderedOwnerIds(tx.owner_ids)
    const seed = seedSplit(originalAmount, ordered, originalShares)
    if (seed.method === 'even' || tx.amount_cents === originalAmount) {
      // Even split, or amount unchanged: reapply the stored split as-is (an even
      // split re-derives cleanly to the new amount; an unchanged custom split
      // round-trips to the exact stored cents).
      tx.shares = computeShares(tx.amount_cents, ordered, seed)
    } else {
      // Custom split AND the amount changed, so the stored cents no longer sum to
      // the total. Preserve the per-owner RATIO (convert to percentages, which
      // sum to 100 exactly) and recompute against the new amount — never silently
      // flatten to even, never write a share/total mismatch.
      const percents: Record<string, number> = {}
      for (const oid of ordered) percents[oid] = ((originalShares[oid] ?? 0) / originalAmount) * 100
      tx.shares = computeShares(tx.amount_cents, ordered, { method: 'percent', percents })
    }
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
