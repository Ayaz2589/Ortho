/**
 * Generates the shared golden test vectors from the (parity-corrected) TS
 * implementations. Both the web (Vitest) and iOS (XCTest) suites assert against
 * these files, so neither language can silently drift.
 *
 * Run: npx tsx scripts/gen-vectors.ts
 */
import { writeFileSync, mkdirSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import {
  monthlyPaymentCents,
  currentPrincipalBalanceCents,
  currentEquityCents,
  equityFraction,
  maturityDate,
  yearsRemaining,
  upcomingAmortization,
} from '../lib/finance/mortgage'
import { generateInsights } from '../lib/finance/insights'
import type { Transaction, Budget, Property } from '../lib/types'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = resolve(__dirname, '../../shared/test-vectors')

/** Parse 'YYYY-MM-DD' as a local calendar date (timezone-stable). */
const d = (s: string) => {
  const [y, m, day] = s.split('-').map(Number)
  return new Date(y, m - 1, day)
}
const fmt = (x: Date) =>
  `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`

// ── Mortgage vectors ────────────────────────────────────────────────────────

interface MortgageInput {
  name: string
  purchasePriceCents: number
  originalLoanCents: number
  annualRatePercent: number
  termYears: number
  closingDate: string
  asOf: string
}

const MORTGAGE_INPUTS: MortgageInput[] = [
  { name: 'standard 30yr', purchasePriceCents: 130_000_000, originalLoanCents: 30_000_000, annualRatePercent: 4.63, termYears: 30, closingDate: '2022-04-22', asOf: '2026-06-15' },
  { name: 'zero interest 10yr', purchasePriceCents: 15_000_000, originalLoanCents: 12_000_000, annualRatePercent: 0, termYears: 10, closingDate: '2024-01-10', asOf: '2026-01-10' },
  { name: 'asOf before closing day-of-month', purchasePriceCents: 60_000_000, originalLoanCents: 50_000_000, annualRatePercent: 6.0, termYears: 30, closingDate: '2023-08-20', asOf: '2025-03-10' },
  { name: 'maturity / years-remaining', purchasePriceCents: 40_000_000, originalLoanCents: 32_000_000, annualRatePercent: 5.25, termYears: 15, closingDate: '2020-02-01', asOf: '2026-06-15' },
]

const mortgage = MORTGAGE_INPUTS.map((i) => {
  const asOf = d(i.asOf)
  return {
    input: i,
    expected: {
      monthlyPaymentCents: monthlyPaymentCents(i.originalLoanCents, i.annualRatePercent, i.termYears),
      currentPrincipalBalanceCents: currentPrincipalBalanceCents(i.originalLoanCents, i.annualRatePercent, i.termYears, i.closingDate, asOf),
      currentEquityCents: currentEquityCents(i.purchasePriceCents, i.originalLoanCents, i.annualRatePercent, i.termYears, i.closingDate, asOf),
      equityFraction: equityFraction(i.purchasePriceCents, i.originalLoanCents, i.annualRatePercent, i.termYears, i.closingDate, asOf),
      maturityDate: fmt(maturityDate(i.closingDate, i.termYears)),
      yearsRemaining: yearsRemaining(i.closingDate, i.termYears, asOf),
      amortization12: upcomingAmortization(12, i.originalLoanCents, i.annualRatePercent, i.termYears, i.closingDate, asOf).map((e) => ({
        principalCents: e.principalCents,
        interestCents: e.interestCents,
      })),
    },
  }
})

// ── Insight vectors ─────────────────────────────────────────────────────────

const tx = (o: Partial<Transaction>): Transaction =>
  ({ owner_ids: [], splits: null, scope: 'shared', household_id: 'h', source: '', created_by: 'u', created_at: '', updated_at: '', ...o }) as Transaction
const budget = (o: Partial<Budget>): Budget => ({ id: 'b', household_id: 'h', ...o }) as Budget

interface InsightScenario {
  name: string
  referenceDate: string
  transactions: Transaction[]
  budgets: Budget[]
  properties: Property[]
}

const SCENARIOS: InsightScenario[] = [
  {
    name: 'top category + over budget + spending exceeds income',
    referenceDate: '2026-06-15',
    transactions: [
      tx({ kind: 'expense', category: 'dining', amount_cents: 40000, date: '2026-06-05', merchant: 'Bistro' }),
      tx({ kind: 'expense', category: 'groceries', amount_cents: 20000, date: '2026-06-07', merchant: 'Whole Foods' }),
      tx({ kind: 'income', category: 'income', amount_cents: 30000, date: '2026-06-03', merchant: 'Payroll' }),
    ],
    budgets: [budget({ category: 'dining', monthly_limit_cents: 30000 })],
    properties: [],
  },
  {
    name: 'saving above benchmark',
    referenceDate: '2026-06-15',
    transactions: [
      tx({ kind: 'income', category: 'income', amount_cents: 100000, date: '2026-06-03', merchant: 'Payroll' }),
      tx({ kind: 'expense', category: 'groceries', amount_cents: 40000, date: '2026-06-05', merchant: 'Whole Foods' }),
    ],
    budgets: [],
    properties: [],
  },
  {
    name: 'no qualifying data',
    referenceDate: '2026-06-15',
    transactions: [],
    budgets: [],
    properties: [],
  },
]

const insights = SCENARIOS.map((s) => ({
  input: { name: s.name, referenceDate: s.referenceDate, transactions: s.transactions, budgets: s.budgets, properties: s.properties },
  expected: generateInsights(s.transactions, s.budgets, s.properties, d(s.referenceDate)).map((i) => ({
    id: i.id,
    severity: i.severity,
    category: i.category,
    magnitude_cents: i.magnitude_cents,
  })),
}))

// ── Write ───────────────────────────────────────────────────────────────────

mkdirSync(OUT, { recursive: true })
writeFileSync(resolve(OUT, 'mortgage.json'), JSON.stringify(mortgage, null, 2) + '\n')
writeFileSync(resolve(OUT, 'insights.json'), JSON.stringify(insights, null, 2) + '\n')
console.log(`Wrote ${mortgage.length} mortgage + ${insights.length} insight vectors to ${OUT}`)
