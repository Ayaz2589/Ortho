// Bank-statement import CLI. Orchestrates: extract → detect → parse → reconcile
// → review (category / exclude / owners / split) → dedupe → confirm → persist.
// Run via `make ingest` (see Makefile / contracts/cli.md). No top-level await (CJS).
import * as readline from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { randomUUID } from 'node:crypto'
import { readInput } from './engine/readInput'
import { detectBank } from './engine/detectBank'
import { reconcile } from './engine/reconcile'
import { markDuplicates } from './engine/dedupe'
import { toTransaction } from './engine/toTransaction'
import { evenSplit, validateCustomSplit } from './engine/split'
import { matchOwnerByName } from './engine/ownerMatch'
import { loadEnv, makeClient } from './db/client'
import { listUsers, resolveHousehold, fetchExistingForDedupe } from './db/lookups'
import { persist } from './db/persist'
import { formatMoney } from '../../lib/finance/money'
import type { RunOptions, ParsedTransaction } from './engine/types'
import type { TransactionCategory, TransactionKind, User } from '../../lib/types'

const CATEGORIES: TransactionCategory[] = [
  'coffee', 'groceries', 'dining', 'subs', 'fuel', 'rent',
  'health', 'income', 'transit', 'utilities', 'entertainment',
]

function parseArgs(argv: string[]): RunOptions {
  const o: RunOptions = { file: '', bankOverride: null, dryRun: false, assumeYes: false, admin: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--file') o.file = argv[++i] ?? ''
    else if (a === '--bank') o.bankOverride = argv[++i] ?? null
    else if (a === '--dry-run') o.dryRun = true
    else if (a === '--yes') o.assumeYes = true
    else if (a === '--admin') o.admin = true
  }
  return o
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10)

/** Money for the preview: income gets +$, expense gets −$ (Unicode minus). */
function money(cents: number, kind: TransactionKind): string {
  return kind === 'income' ? formatMoney(cents, 'usd', 1, true) : `−${formatMoney(cents)}`
}

function rowLine(r: ParsedTransaction, owners: User[]): string {
  const own = r.ownerIds.length
    ? r.ownerIds.map((id) => owners.find((u) => u.id === id)?.name ?? id.slice(0, 4)).join(', ')
    : '—'
  const tag = r.duplicate
    ? '  [DUPLICATE — same day/amount already imported]'
    : r.excluded
      ? `  [EXCLUDED: ${r.excludeReason}]`
      : ''
  return `${isoDay(new Date(r.dateISO))}  ${r.merchant.padEnd(26)} ${money(r.amountCents, r.kind).padStart(12)}  ${r.category.padEnd(13)} ← ${own}${tag}`
}

function die(code: number, msg: string): never {
  console.error(msg)
  process.exit(code)
}

async function run(): Promise<void> {
  loadEnv()
  const opts = parseArgs(process.argv.slice(2))
  if (!opts.file) die(1, 'Usage: make ingest FILE=<path.pdf> [BANK=td] [DRY_RUN=1] [YES=1] [ADMIN=1]')

  // 1. Read input (PDF via unpdf, or CSV as text)
  let pages: string[]
  try {
    pages = await readInput(opts.file)
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e)
    die(/UNPARSEABLE/.test(m) ? 3 : 1, `Could not read statement: ${m}`)
  }

  // 2. Detect
  const det = detectBank(pages.join('\n'), opts.bankOverride)
  if (!det.ok) die(det.code === 'bad-override' ? 1 : 2, det.message)
  console.log(`Detected bank: ${det.profile.label}`)

  // 3. Parse
  const stmt = det.profile.parse(pages)
  console.log(`Statement period: ${isoDay(stmt.period.start)} → ${isoDay(stmt.period.end)}  (holder: ${stmt.accountHolder})`)

  // 4/5. Reconcile (BLOCKING) — skipped for sources with no printed control total (CSV).
  if (stmt.reconcilable === false) {
    console.log('Reconciliation: n/a (CSV has no printed control total — verify the preview below)')
  } else {
  const rec = reconcile(stmt.sections)
  if (rec.ok) {
    console.log(`Reconciliation: OK (${rec.sections.length}/${rec.sections.length} sections)`)
  } else {
    console.log('Reconciliation: FAILED')
    for (const s of rec.sections.filter((x) => !x.ok)) {
      console.log(`  ${s.name}: expected ${money(s.expectedCents, 'expense')} computed ${money(s.computedCents, 'expense')} (Δ ${money(Math.abs(s.expectedCents - s.computedCents), 'expense')})`)
    }
    die(4, 'Reconciliation failed — nothing imported.')
  }
  }

  const rows = stmt.sections.flatMap((s) => s.rows)

  // 6 (preview). For dry-run we don't resolve owners (no DB).
  const excludedCount = rows.filter((r) => r.excluded).length
  console.log(`\nPreview (${rows.length} transactions, ${excludedCount} excluded):`)
  for (const r of rows) console.log('  ' + rowLine(r, []))

  if (opts.dryRun) {
    console.log("\n(Owners show '—' in dry-run — no sign-in. The real import defaults every row to you")
    console.log("and lets you reassign or split with 'o' / 's' during review.)")
    console.log('\nDry run — nothing written.')
    return
  }

  // ---- US2/US3: DB-backed import ----
  const rl = readline.createInterface({ input: stdin, output: stdout })
  try {
    // Auth: email OTP (sign-in) or service-role (admin).
    const email = opts.admin
      ? undefined
      : (process.env.IMPORT_EMAIL ?? (await rl.question('Ortho email: '))).trim()

    let client
    try {
      client = await makeClient({
        admin: opts.admin,
        email,
        onCodeSent: (e) => console.log(`\nVerification code sent to ${e} — check your email.`),
        requestCode: async () => rl.question('Enter the 8-digit code: '),
      })
    } catch (e) {
      die(5, `Auth/DB error: ${e instanceof Error ? e.message : String(e)}`)
    }

    let users: User[]
    let household
    try {
      users = await listUsers(client.supabase)
      // Admin mode: created_by = the user matching the statement holder (fallback: first user).
      if (opts.admin && !client.userId) {
        const holder = users.find((u) => u.name.toUpperCase() === stmt.accountHolder.toUpperCase()) ?? users[0]
        if (!holder) die(5, 'No users found to attribute imported rows to.')
        client.userId = holder.id
        console.log(`Admin mode: attributing rows to ${holder.name}`)
      }
      household = await resolveHousehold(client.supabase, client.userId)
    } catch (e) {
      die(5, `Lookup error: ${e instanceof Error ? e.message : String(e)}`)
    }

    const defaultOwnerId = household.defaultPersonId || client.userId
    // Default each row's owner: match the statement's card member (Amex) to a
    // household person by first name, else the operator. Changeable in review.
    for (const r of rows) r.ownerIds = [matchOwnerByName(r.cardMember, household.people, defaultOwnerId)]
    const coOwners = household.people
    const canSplit = !!household.household && household.people.length >= 2

    // Flag probable duplicates (same day + amount + bank) before review, so they
    // appear as [DUPLICATE]. Excluded by default; re-include with 'x' if separate.
    try {
      const existing = await fetchExistingForDedupe(client.supabase, client.userId)
      const flagged = markDuplicates(rows, existing, client.userId, stmt.source)
      if (flagged) console.log(`\n${flagged} probable duplicate(s) flagged (already imported) — excluded by default; re-include with 'x' if they're separate charges.`)
    } catch (e) {
      die(5, `Lookup error: ${e instanceof Error ? e.message : String(e)}`)
    }

    if (!opts.assumeYes) {
      const ok = await reviewLoop(rl, rows, coOwners, defaultOwnerId, canSplit)
      if (!ok) {
        console.log('Aborted — nothing written.')
        return
      }
    }

    const included = rows.filter((r) => !r.excluded)
    // Always require an explicit final confirmation before writing (FR-025).
    // YES=1 only skips the per-row review, never this gate.
    const ans = await rl.question(`\nImport ${included.length} transactions? [y/N] `)
    if (!/^y/i.test(ans.trim())) {
      console.log('Aborted — nothing written.')
      return
    }

    const now = new Date().toISOString()
    const txs = included.map((r) =>
      toTransaction(
        r,
        stmt.source,
        { createdBy: client.userId, householdId: household.household?.id ?? null, defaultOwnerId },
        randomUUID(),
        now
      )
    )
    let written = 0
    try {
      written = await persist(client.supabase, txs)
    } catch (e) {
      die(5, `Write error: ${e instanceof Error ? e.message : String(e)}`)
    }
    const dupCount = rows.filter((r) => r.duplicate).length
    const exclCount = rows.filter((r) => r.excluded && !r.duplicate).length
    console.log(
      `Summary: imported ${written} · duplicate ${dupCount} · excluded ${exclCount} · reconciliation OK`
    )
  } finally {
    rl.close()
  }
}

/** Interactive per-row review. Returns false if the operator aborts. */
async function reviewLoop(
  rl: readline.Interface,
  rows: ParsedTransaction[],
  coOwners: User[],
  defaultOwnerId: string,
  canSplit: boolean
): Promise<boolean> {
  console.log('\nReview — [Enter] accept · c category · x toggle-exclude · o owners · s split · a accept-all · q abort')
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    const ans = (await rl.question(`  ${rowLine(r, coOwners)}\n  > `)).trim().toLowerCase()
    if (ans === 'a') break
    if (ans === 'q') return false
    if (ans === 'x') {
      r.excluded = !r.excluded
      if (r.excluded) {
        r.excludeReason = r.excludeReason ?? 'manual'
      } else {
        // Re-including clears any duplicate/exclusion flag — operator says it's a real, separate charge.
        r.excludeReason = null
        r.duplicate = false
      }
      i--
      continue
    }
    if (ans === 'c') {
      const c = await rl.question(`    category [${CATEGORIES.join(', ')}]: `)
      const picked = c.trim().toLowerCase()
      if ((CATEGORIES as string[]).includes(picked)) r.category = picked as TransactionCategory
      else console.log('    (unrecognized category, kept)')
      i--
      continue
    }
    if (ans === 'o') {
      if (coOwners.length < 2) {
        console.log('    Only one account available — multi-owner splitting unavailable.')
        i--
        continue
      }
      coOwners.forEach((u, idx) => console.log(`      ${idx + 1}. ${u.name}`))
      const sel = await rl.question('    owners (comma-separated numbers): ')
      const ids = sel
        .split(',')
        .map((s) => coOwners[Number(s.trim()) - 1]?.id)
        .filter((x): x is string => Boolean(x))
      if (ids.length) {
        r.ownerIds = ids
        r.splits = null // reset to even when owners change
      }
      i--
      continue
    }
    if (ans === 's') {
      if (r.ownerIds.length < 2) {
        console.log('    Assign multiple owners first (o) to set a split.')
        i--
        continue
      }
      if (!canSplit) {
        console.log('    Splitting requires a household with 2+ members.')
        i--
        continue
      }
      console.log(`    even split = ${JSON.stringify(evenSplit(r.ownerIds))}; enter percentages or blank for even`)
      const raw = await rl.question(`    percentages for ${r.ownerIds.join(', ')} (e.g. "70 30"): `)
      if (!raw.trim()) {
        r.splits = null
      } else {
        const nums = raw.trim().split(/[\s,]+/).map(Number)
        const custom: Record<string, number> = {}
        r.ownerIds.forEach((id, idx) => (custom[id] = nums[idx]))
        const v = validateCustomSplit(custom, r.ownerIds)
        if (v.ok) r.splits = custom
        else console.log(`    ${v.error} — kept even split`)
      }
      i--
      continue
    }
    // Enter / anything else → accept
  }
  return true
}

run().catch((e) => {
  console.error(e instanceof Error ? e.stack ?? e.message : String(e))
  process.exit(1)
})
