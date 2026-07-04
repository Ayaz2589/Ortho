/**
 * Richer demonstration fixture for the routine detector (spec 016, research D9).
 *
 * The existing spec-015 `seed.ts` is intentionally sparse (mostly one-offs) and
 * serves as the "stays quiet" control. This fixture is the positive case: it
 * plants known routines so the detector's output can be checked against ground
 * truth (SC-001) and so the harness shows what a compelling result looks like.
 *
 * Planted routines (over a 12-week window ending at DEMO_NOW):
 *   • Weekday coffee     — one merchant, Mon–Fri mornings (~$5.00)   → weekday, morning
 *   • Weekday transit    — one merchant, Mon–Fri mornings (~$2.90)   → weekday, morning
 *   • Weekly groceries   — Saturdays, 6 ROTATING merchants (2 each)  → category groceries, weekly
 *   • Monthly subscription — one merchant, noon-UTC (imported)       → monthly, no bucket
 *   • Noise              — a flight and a dentist visit, one-off      → must NOT surface
 *
 * Groceries rotate across enough merchants that no single merchant clears the
 * support threshold, so only the CATEGORY routine surfaces — exercising the
 * category grouping path (research D1). All timestamps are clock-independent
 * (anchored to a fixed base), so the fixture is deterministic.
 */
import type { Transaction, TransactionCategory, TransactionKind } from '@/lib/types'
import { computeShares } from '@/lib/splits'

const HH = 'demo-hh'
const P = 'demo-person-ava'
const DAY_MS = 24 * 60 * 60 * 1000

/** Midnight-UTC on the anchor day; occurrences are offset back from here. */
const BASE = Date.UTC(2026, 5, 15, 0, 0, 0) // 2026-06-15T00:00:00Z

/** Reference "now" for a detector run over this fixture (noon on the anchor day). */
export const DEMO_NOW = new Date(Date.UTC(2026, 5, 15, 12, 0, 0))

/** Timestamp `daysAgo` before the anchor, at the given UTC hour/minute. */
const at = (daysAgo: number, hour: number, minute = 0): Date =>
  new Date(BASE - daysAgo * DAY_MS + (hour * 60 + minute) * 60 * 1000)

let seq = 0
function makeTx(merchant: string, category: TransactionCategory, kind: TransactionKind, cents: number, when: Date): Transaction {
  seq++
  const iso = when.toISOString()
  const owners = [P]
  return {
    id: `demo-tx-${seq}`,
    household_id: HH,
    merchant,
    category,
    kind,
    amount_cents: cents,
    source: 'Everyday Card',
    date: iso,
    created_by: P,
    created_at: iso,
    updated_at: iso,
    paid_by: P,
    owner_ids: owners,
    shares: computeShares(cents, owners, { method: 'even' }),
  }
}

const GROCERY_MERCHANTS = ['Whole Foods', 'Trader Joe’s', 'Costco', 'Safeway', 'Key Food', 'Fairway']
const GROCERY_AMOUNTS = [7000, 8200, 6800, 9100, 7500, 8800]

/** Build the demonstration transaction list (deterministic). */
export function buildRoutineDemo(): Transaction[] {
  const txs: Transaction[] = []
  let saturdayIndex = 0

  for (let daysAgo = 1; daysAgo <= 83; daysAgo++) {
    const day = at(daysAgo, 8) // 08:00 UTC → morning bucket
    const weekday = day.getUTCDay() // 0=Sun … 6=Sat

    if (weekday >= 1 && weekday <= 5) {
      // Weekday coffee (~$5.00) + weekday transit (~$2.90), both mornings.
      txs.push(makeTx('Blue Bottle Coffee', 'coffee', 'expense', 500, at(daysAgo, 8, 0)))
      txs.push(makeTx('MTA', 'transit', 'expense', 290, at(daysAgo, 8, 30)))
    }

    if (weekday === 6) {
      // Weekly groceries, rotating merchant (Saturday afternoons).
      const merchant = GROCERY_MERCHANTS[saturdayIndex % GROCERY_MERCHANTS.length]
      const amount = GROCERY_AMOUNTS[saturdayIndex % GROCERY_AMOUNTS.length]
      txs.push(makeTx(merchant, 'groceries', 'expense', amount, at(daysAgo, 15, 0)))
      saturdayIndex++
    }
  }

  // Monthly subscription — imported (noon-UTC → no time bucket), ~$16, 3 months.
  for (const daysAgo of [5, 35, 65]) {
    txs.push(makeTx('Streamly', 'subs', 'expense', 1599, at(daysAgo, 12, 0)))
  }

  // Noise: genuine one-offs that must never surface as routines.
  txs.push(makeTx('Blue Coast Airlines', 'entertainment', 'expense', 52000, at(10, 14, 0)))
  txs.push(makeTx('City Dental', 'health', 'expense', 18000, at(44, 10, 0)))

  return txs
}
