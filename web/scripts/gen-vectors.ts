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
import { filterTransactions, monthBounds, emptyCriteria, type FilterCriteria, type FilterContext } from '../lib/transactionFilters'
import { computeShares, validateSplit, type SplitInput } from '../lib/splits'
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

// ── Transaction filter vectors ──────────────────────────────────────────────

const ftx = (o: Partial<Transaction>): Transaction =>
  ({ id: '', household_id: null, merchant: '', category: 'dining', kind: 'expense', scope: 'personal', amount_cents: 0, source: '', date: '2026-05-15T12:00:00.000Z', created_by: '00000000-0000-0000-0000-000000000999', created_at: '', updated_at: '', owner_ids: [], splits: null, ...o }) as Transaction

// UUID-form ids so the iOS suite can decode the vectors straight into `Transaction`
// (its ids are UUIDs); the web compares strings, so it's agnostic.
const uid = (n: string) => `00000000-0000-0000-0000-${n.padStart(12, '0')}`
const A = uid('1'), B = uid('2'), C = uid('3'), D = uid('4')
const U1 = uid('101'), U2 = uid('102'), H1 = uid('201')

// A fixed, representative set spanning scopes/categories/kinds/sources/owners/dates.
const FSET: Transaction[] = [
  ftx({ id: A, merchant: 'Bistro', category: 'dining', kind: 'expense', source: 'Amex Gold', household_id: H1, owner_ids: [U1], date: '2026-05-04T12:00:00.000Z' }),
  ftx({ id: B, merchant: 'Blue Bottle', category: 'coffee', kind: 'expense', source: 'TD Bank', household_id: null, owner_ids: [U1], date: '2026-05-10T12:00:00.000Z' }),
  ftx({ id: C, merchant: 'Payroll', category: 'income', kind: 'income', source: 'TD Bank', household_id: H1, owner_ids: [U2], date: '2026-06-01T12:00:00.000Z' }),
  ftx({ id: D, merchant: 'Whole Foods', category: 'groceries', kind: 'expense', source: 'Chase', household_id: H1, owner_ids: [U1, U2], date: '2026-04-20T12:00:00.000Z' }),
]
const FCTX: FilterContext = { ownerNames: { [U1]: 'Ayaz', [U2]: 'Tasnuva' } }
const may = monthBounds('2026-05')

const FILTER_CASES: Array<{ name: string; transactions: Transaction[]; context: FilterContext; criteria: FilterCriteria }> = [
  { name: 'no filters → all', transactions: FSET, context: FCTX, criteria: emptyCriteria() },
  { name: 'search merchant', transactions: FSET, context: FCTX, criteria: { ...emptyCriteria(), query: 'bistro' } },
  { name: 'search source', transactions: FSET, context: FCTX, criteria: { ...emptyCriteria(), query: 'td bank' } },
  { name: 'search owner name', transactions: FSET, context: FCTX, criteria: { ...emptyCriteria(), query: 'tasnuva' } },
  { name: 'search miss → empty', transactions: FSET, context: FCTX, criteria: { ...emptyCriteria(), query: 'zzz' } },
  { name: 'category multi (OR)', transactions: FSET, context: FCTX, criteria: { ...emptyCriteria(), categories: ['dining', 'coffee'] } },
  { name: 'kind income', transactions: FSET, context: FCTX, criteria: { ...emptyCriteria(), kind: 'income' } },
  { name: 'kind expense', transactions: FSET, context: FCTX, criteria: { ...emptyCriteria(), kind: 'expense' } },
  { name: 'source multi (OR)', transactions: FSET, context: FCTX, criteria: { ...emptyCriteria(), sources: ['TD Bank', 'Chase'] } },
  { name: 'owner single (∩)', transactions: FSET, context: FCTX, criteria: { ...emptyCriteria(), owners: [U2] } },
  { name: 'month May (half-open)', transactions: FSET, context: FCTX, criteria: { ...emptyCriteria(), dateFrom: may.dateFrom, dateTo: may.dateTo } },
  { name: 'dateFrom only', transactions: FSET, context: FCTX, criteria: { ...emptyCriteria(), dateFrom: '2026-05-01T00:00:00.000Z' } },
  { name: 'AND: kind expense ∧ source TD Bank', transactions: FSET, context: FCTX, criteria: { ...emptyCriteria(), kind: 'expense', sources: ['TD Bank'] } },
  { name: 'AND: dining ∧ May', transactions: FSET, context: FCTX, criteria: { ...emptyCriteria(), categories: ['dining'], dateFrom: may.dateFrom, dateTo: may.dateTo } },
  { name: 'absent source → empty', transactions: FSET, context: FCTX, criteria: { ...emptyCriteria(), sources: ['Wells Fargo'] } },
]

const filters = {
  cases: FILTER_CASES.map((c) => ({
    name: c.name,
    transactions: c.transactions,
    context: c.context,
    criteria: c.criteria,
    expectedIds: filterTransactions(c.transactions, c.criteria, c.context).map((t) => t.id),
  })),
}

// ── Transaction split vectors ───────────────────────────────────────────────

interface SplitCase { name: string; amountCents: number; owners: string[]; split: SplitInput }

const SPLIT_CASES: SplitCase[] = [
  { name: 'single-full', amountCents: 9999, owners: ['a'], split: { method: 'even' } },
  { name: 'single-ignores-method', amountCents: 9999, owners: ['a'], split: { method: 'value', values: { a: 5000 } } },
  { name: 'even-divisible', amountCents: 10000, owners: ['a', 'b'], split: { method: 'even' } },
  { name: 'even-remainder-1', amountCents: 10001, owners: ['a', 'b'], split: { method: 'even' } },
  { name: 'even-three-remainder-1', amountCents: 1000, owners: ['a', 'b', 'c'], split: { method: 'even' } },
  { name: 'even-three-remainder-2', amountCents: 10001, owners: ['a', 'b', 'c'], split: { method: 'even' } },
  { name: 'percent-clean', amountCents: 10000, owners: ['a', 'b'], split: { method: 'percent', percents: { a: 70, b: 30 } } },
  { name: 'percent-uneven-remainder', amountCents: 10000, owners: ['a', 'b', 'c'], split: { method: 'percent', percents: { a: 33.33, b: 33.33, c: 33.34 } } },
  { name: 'percent-remainder-to-first', amountCents: 100, owners: ['a', 'b', 'c'], split: { method: 'percent', percents: { a: 33.33, b: 33.33, c: 33.34 } } },
  { name: 'value-exact', amountCents: 10000, owners: ['a', 'b'], split: { method: 'value', values: { a: 6000, b: 4000 } } },
  { name: 'value-uneven', amountCents: 10001, owners: ['a', 'b'], split: { method: 'value', values: { a: 5001, b: 5000 } } },
  { name: 'order-matters', amountCents: 10001, owners: ['b', 'a'], split: { method: 'even' } },
]

interface ValCase { name: string; amountCents: number; owners: string[]; split: SplitInput }

const VAL_CASES: ValCase[] = [
  { name: 'percent-short', amountCents: 10000, owners: ['a', 'b'], split: { method: 'percent', percents: { a: 50, b: 49 } } },
  { name: 'value-short', amountCents: 10000, owners: ['a', 'b'], split: { method: 'value', values: { a: 6000, b: 3999 } } },
  { name: 'no-owners', amountCents: 100, owners: [], split: { method: 'even' } },
  { name: 'percent-within-tolerance', amountCents: 10000, owners: ['a', 'b'], split: { method: 'percent', percents: { a: 50, b: 50.4 } } },
]

const splits = {
  cases: SPLIT_CASES.map((c) => ({
    name: c.name,
    amountCents: c.amountCents,
    owners: c.owners,
    split: c.split,
    expected: computeShares(c.amountCents, c.owners, c.split),
  })),
  validations: VAL_CASES.map((c) => ({
    name: c.name,
    amountCents: c.amountCents,
    owners: c.owners,
    split: c.split,
    result: validateSplit(c.amountCents, c.owners, c.split),
  })),
}

// ── Write ───────────────────────────────────────────────────────────────────

mkdirSync(OUT, { recursive: true })
writeFileSync(resolve(OUT, 'mortgage.json'), JSON.stringify(mortgage, null, 2) + '\n')
writeFileSync(resolve(OUT, 'insights.json'), JSON.stringify(insights, null, 2) + '\n')
writeFileSync(resolve(OUT, 'transaction-filters.json'), JSON.stringify(filters, null, 2) + '\n')
writeFileSync(resolve(OUT, 'transaction-splits.json'), JSON.stringify(splits, null, 2) + '\n')
console.log(`Wrote ${mortgage.length} mortgage + ${insights.length} insight + ${filters.cases.length} filter + ${splits.cases.length} split vectors to ${OUT}`)
