/**
 * Developer harness for the routine detector (spec 016, US2 / SC-004).
 *
 * Runs the detector over the planted-routine demo fixture and/or the sparse
 * spec-015 seed, and prints the ranked routines legibly so a reviewer can make
 * the findings.md go/no-go call — does `merchant + cadence` ALONE surface
 * routines that feel insightful? Plain tsx: no Next.js, no Supabase, no network.
 *
 *   npx tsx scripts/routines-demo.ts                  # both datasets
 *   npx tsx scripts/routines-demo.ts --dataset=demo   # planted-routine fixture
 *   npx tsx scripts/routines-demo.ts --dataset=seed   # sparse spec-015 seed (control)
 */
import { detectRoutines, type Routine } from '../lib/finance/routines'
import { buildRoutineDemo, DEMO_NOW } from '../lib/testdata/routine-demo'
import { buildSeedTables } from '../lib/testdata/seed'
import type { Transaction } from '../lib/types'

// Deterministic regardless of ambient TZ (detector uses UTC accessors).
process.env.TZ = 'UTC'

function usd(cents: number): string {
  const dollars = cents / 100
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: dollars % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(dollars)
}

function bucketPhrase(r: Routine): string {
  return r.timeBucket ? `${r.cadence}/${r.timeBucket}` : r.cadence
}

function printReport(title: string, transactions: Transaction[], now: Date): void {
  const report = detectRoutines(transactions, { now })
  console.log(`\n=== ${title} ===`)
  console.log(`transactions: ${transactions.length}  ·  window: last ${report.params.lookbackWeeksM} weeks  ·  min support: ${report.params.minSupportN}`)
  if (report.routines.length === 0) {
    console.log('  (no routines detected — stays quiet)')
  } else {
    console.log('  ' + ['#', 'confidence', 'cadence', 'typical', 'count', 'monthly', 'routine'].join('\t'))
    report.routines.forEach((r, i) => {
      console.log(
        '  ' +
          [
            i + 1,
            r.confidence.toFixed(3),
            bucketPhrase(r),
            usd(r.typicalAmountCents),
            r.occurrenceCount,
            usd(r.monthlyEstimateCents),
            r.label,
          ].join('\t'),
      )
    })
  }
  console.log(`  Estimated monthly routine cost: ${usd(report.monthlyRoutineCostCents)}`)
}

function seedTransactions(): Transaction[] {
  const { tables } = buildSeedTables()
  // The seed serves plain rows carrying the Transaction fields the detector
  // reads (merchant/category/kind/amount_cents/date); owner_ids/shares live in a
  // separate table and are unused here.
  return tables.transactions as unknown as Transaction[]
}

function main(): void {
  const arg = process.argv.find((a) => a.startsWith('--dataset='))
  const dataset = arg ? arg.split('=')[1] : 'both'
  const seedNow = new Date(Date.UTC(2026, 5, 15, 12, 0, 0)) // seed's anchor base

  if (dataset === 'demo' || dataset === 'both') {
    printReport('DEMO fixture (planted routines)', buildRoutineDemo(), DEMO_NOW)
  }
  if (dataset === 'seed' || dataset === 'both') {
    printReport('SEED (spec-015 sparse control)', seedTransactions(), seedNow)
  }
  console.log('')
}

main()
