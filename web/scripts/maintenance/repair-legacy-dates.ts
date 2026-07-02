// One-time audit/repair of legacy transaction timestamps (spec 013 US2).
//
// Pre-2026-07-02, the iOS sheet saved the picker's wall-clock instant, so an
// evening America/New_York entry landed at 00:00–04:00Z on the NEXT UTC day —
// rendering on the wrong calendar day. The convention everywhere is now noon
// UTC of the picked local day; this script finds rows carrying the legacy
// signature and (on explicit APPLY) rewrites ONLY their `date` to noon UTC of
// the inferred NY calendar day.
//
//   make repair-dates            # DRY RUN (default): report only, zero writes
//   make repair-dates APPLY=1    # prints the report, then requires typing
//                                # "repair" at the prompt before writing
//
// Auth: the operator's OTP session by default (same as tx-*); ADMIN=1 uses the
// service-role key if present. The hosted backend is LIVE SHARED DATA — the
// dry-run → operator review → APPLY sequence is the contract
// (specs/013-post-audit-closeout/contracts/repair-legacy-dates.md).
import * as readline from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import type { SupabaseClient } from '@supabase/supabase-js'
import { loadEnv, makeClient } from '../import/db/client'
import { parseFlags } from '../import/engine/args'

export interface LegacyRow {
  id: string
  date: string
  merchant: string
  amount_cents: number
}

export interface RepairableRow extends LegacyRow {
  localDay: string
  proposedISO: string
}

// ── Pure inference ──────────────────────────────────────────────────────────

/** Milliseconds into the UTC day. */
function utcTimeOfDayMs(iso: string): number {
  const d = new Date(iso)
  return (
    d.getUTCHours() * 3_600_000 +
    d.getUTCMinutes() * 60_000 +
    d.getUTCSeconds() * 1_000 +
    d.getUTCMilliseconds()
  )
}

const FOUR_HOURS_MS = 4 * 3_600_000
const NOON_MS = 12 * 3_600_000

/** The legacy evening wall-clock signature: UTC time-of-day in [00:00, 04:00)Z
 *  (and never the noon-UTC convention — implied, noon is outside the window). */
export function isLegacy(dateISO: string): boolean {
  const t = utcTimeOfDayMs(dateISO)
  return t < FOUR_HOURS_MS && t !== NOON_MS
}

const NY_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})
const NY_HOUR = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  hour: '2-digit',
  hourCycle: 'h23',
})

/** NY-day inference for one instant. `ambiguous` flags the defensive band —
 *  NY wall-clock in [00:00, 01:00): such an instant could be a genuine
 *  just-after-midnight entry rather than a shifted evening one, so it is
 *  never auto-repaired (FR-006). For the NY offsets (UTC−4/−5) the band
 *  cannot intersect the 00:00–04:00Z window, but the guard stays — the
 *  selector and the inference must be independently safe. */
export function proposeRepair(dateISO: string): {
  localDay: string
  proposedISO: string
  ambiguous: boolean
} {
  const instant = new Date(dateISO)
  const localDay = NY_DAY.format(instant) // en-CA → YYYY-MM-DD
  const hour = Number(NY_HOUR.format(instant))
  return {
    localDay,
    proposedISO: `${localDay}T12:00:00.000Z`,
    ambiguous: hour === 0,
  }
}

// ── IO ──────────────────────────────────────────────────────────────────────

export interface RepairResult {
  repairable: RepairableRow[]
  ambiguous: RepairableRow[]
  written: number
  failed: string[]
}

export interface RepairOptions {
  apply: boolean
  /** Must resolve to the literal string "repair" for APPLY to write. */
  confirm: () => Promise<string>
  log: (line: string) => void
}

export async function runRepair(supabase: SupabaseClient, opts: RepairOptions): Promise<RepairResult> {
  const { log } = opts
  // The whole household's rows are a few hundred — fetch id/date and select
  // the window in-process (the signature is a time-of-day predicate SQL can't
  // express portably through supabase-js).
  const { data, error } = await supabase
    .from('transactions')
    .select('id,date,merchant,amount_cents')
    .order('date', { ascending: true })
  if (error) throw new Error(`FETCH_TX: ${error.message}`)
  const rows = (data ?? []) as LegacyRow[]

  const repairable: RepairableRow[] = []
  const ambiguous: RepairableRow[] = []
  for (const row of rows) {
    if (!isLegacy(row.date)) continue
    const p = proposeRepair(row.date)
    const entry = { ...row, localDay: p.localDay, proposedISO: p.proposedISO }
    ;(p.ambiguous ? ambiguous : repairable).push(entry)
  }

  const money = (c: number) => `$${(c / 100).toFixed(2)}`
  log(`Scanned ${rows.length} transactions.`)
  log('')
  log(`REPAIRABLE (${repairable.length}):`)
  for (const r of repairable) {
    log(`  ${r.id} · ${r.date} → NY day ${r.localDay} → ${r.proposedISO} · ${r.merchant} · ${money(r.amount_cents)}`)
  }
  if (ambiguous.length) {
    log('')
    log(`AMBIGUOUS — not repaired, operator decision required (${ambiguous.length}):`)
    for (const r of ambiguous) {
      log(`  ${r.id} · ${r.date} · NY wall-clock just after midnight · ${r.merchant} · ${money(r.amount_cents)}`)
    }
  }

  if (!opts.apply) {
    log('')
    log(`Dry run — nothing written. (${repairable.length} repairable · ${ambiguous.length} ambiguous)`)
    return { repairable, ambiguous, written: 0, failed: [] }
  }

  if (repairable.length === 0) {
    log('')
    log('Nothing to repair.')
    return { repairable, ambiguous, written: 0, failed: [] }
  }

  log('')
  const answer = (await opts.confirm()).trim()
  if (answer !== 'repair') {
    log('Confirmation not given — nothing written.')
    return { repairable, ambiguous, written: 0, failed: [] }
  }

  let written = 0
  const failed: string[] = []
  for (const r of repairable) {
    // The date-equality guard makes each write race-safe and re-run-safe:
    // a row edited since the report simply matches nothing.
    const { data: updated, error: ue } = await supabase
      .from('transactions')
      .update({ date: r.proposedISO })
      .eq('id', r.id)
      .eq('date', r.date)
      .select('id')
    if (ue) {
      failed.push(`${r.id}: ${ue.message}`)
      log(`  FAILED ${r.id}: ${ue.message}`)
      continue
    }
    if (!updated || (updated as unknown[]).length === 0) {
      failed.push(`${r.id}: no match (row changed since the report)`)
      log(`  SKIPPED ${r.id}: row changed since the report`)
      continue
    }
    written++
    log(`  repaired ${r.id} → ${r.proposedISO}`)
  }
  log('')
  log(`${written} repaired · ${failed.length} failed/skipped · ${ambiguous.length} ambiguous (untouched)`)
  return { repairable, ambiguous, written, failed }
}

// ── CLI entry (skipped under vitest) ────────────────────────────────────────

async function main(): Promise<void> {
  loadEnv()
  const flags = parseFlags(process.argv.slice(2))
  const apply = flags.apply === true
  const admin = flags.admin === true
  const rl = readline.createInterface({ input: stdin, output: stdout })
  try {
    const email = admin
      ? undefined
      : (process.env.IMPORT_EMAIL ?? (await rl.question('Ortho email: '))).trim()
    const { supabase } = await makeClient({
      admin,
      email,
      onCodeSent: (e) => console.log(`\nVerification code sent to ${e} — check your email.`),
      requestCode: async () => rl.question('Enter the 8-digit code: '),
    })
    const res = await runRepair(supabase, {
      apply,
      confirm: async () =>
        rl.question(`Rewrite ${'the dates above'} on the LIVE backend — type "repair" to proceed: `),
      log: (line) => console.log(line),
    })
    if (res.failed.length > 0) process.exitCode = 1
  } finally {
    rl.close()
  }
}

if (process.argv[1]?.includes('repair-legacy-dates')) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : String(e))
    process.exit(1)
  })
}
