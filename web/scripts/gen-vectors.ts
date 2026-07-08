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
import { computeShares, validateSplit, seedSplit, orderedOwnerIds, type SplitInput } from '../lib/splits'
import { toDisplayAmount, toUSDCents } from '../lib/finance/money'
import { CURRENCIES, CURRENCY_NAMES, currencySymbol, FALLBACK_RATE_FROM_USD } from '../lib/finance/currency'
import { availableMonths, availableRanges, monthReferenceDate, stepMonth } from '../components/dashboard/range'
import { balanceBetween } from '../lib/balances'
import { occupiedRentCents, netRentalCents, type RentUnit } from '../lib/finance/housing'
import { rentDueDay, daysUntilNextRent, daysUntilEnd, isRenewalSoon } from '../components/housing/lease'
import type { Transaction, Budget, Property, LeaseInfo } from '../lib/types'

// The vectors must be identical no matter where they are generated: pin the
// process timezone before any Date math runs. Both assertion suites pin the
// same zone (vitest.config.ts for web, a UTC Calendar in the iOS parity
// tests), so day-1 date-only strings ("2026-06-01" parses as UTC midnight)
// bucket into the same month everywhere.
process.env.TZ = 'UTC'

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
  // Month-end closing (day 31) viewed near a shorter month's end — the day-29–31
  // boundary where the old web `day <` check undercounted by a month (R7). iOS
  // Calendar gives 0 / 1 / 1 / 2 months elapsed for Feb 27 / Feb 28 / Mar 1 / Mar 31.
  { name: 'month-end closing boundary — Feb 27 (incomplete month)', purchasePriceCents: 60_000_000, originalLoanCents: 50_000_000, annualRatePercent: 6.0, termYears: 30, closingDate: '2026-01-31', asOf: '2026-02-27' },
  { name: 'month-end closing boundary — Feb 28 (full month)', purchasePriceCents: 60_000_000, originalLoanCents: 50_000_000, annualRatePercent: 6.0, termYears: 30, closingDate: '2026-01-31', asOf: '2026-02-28' },
  { name: 'month-end closing boundary — Mar 1', purchasePriceCents: 60_000_000, originalLoanCents: 50_000_000, annualRatePercent: 6.0, termYears: 30, closingDate: '2026-01-31', asOf: '2026-03-01' },
  { name: 'month-end closing boundary — Mar 31 (two months)', purchasePriceCents: 60_000_000, originalLoanCents: 50_000_000, annualRatePercent: 6.0, termYears: 30, closingDate: '2026-01-31', asOf: '2026-03-31' },
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
  ({ owner_ids: [], shares: {}, household_id: 'h', source: '', created_by: 'u', created_at: '', updated_at: '', ...o }) as Transaction
const budget = (o: Partial<Budget>): Budget => ({ id: 'b', household_id: 'h', ...o }) as Budget
const property = (o: Partial<Property>): Property =>
  ({ id: 'p', household_id: 'h', kind: 'primary_home', address: '', nickname: '', ...o }) as Property

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
    name: 'month-over-month rise + approaching budget',
    referenceDate: '2026-06-15',
    transactions: [
      tx({ kind: 'expense', category: 'dining', amount_cents: 10000, date: '2026-05-10', merchant: 'Bistro' }),
      tx({ kind: 'expense', category: 'dining', amount_cents: 27000, date: '2026-06-08', merchant: 'Bistro' }),
      tx({ kind: 'income', category: 'income', amount_cents: 100000, date: '2026-06-02', merchant: 'Payroll' }),
    ],
    budgets: [budget({ category: 'dining', monthly_limit_cents: 30000 })],
    properties: [],
  },
  {
    name: 'under budget late in month + mortgage ratio',
    referenceDate: '2026-06-25',
    transactions: [
      tx({ kind: 'expense', category: 'dining', amount_cents: 10000, date: '2026-06-05', merchant: 'Bistro' }),
      tx({ kind: 'income', category: 'income', amount_cents: 500000, date: '2026-06-02', merchant: 'Payroll' }),
    ],
    budgets: [budget({ category: 'dining', monthly_limit_cents: 30000 })],
    properties: [
      property({
        mortgage: {
          property_id: 'p',
          purchase_price_cents: 40000000,
          original_loan_cents: 30000000,
          annual_interest_rate_percent: 6,
          loan_term_years: 30,
          closing_date: '2024-01-01',
          auto_pay_source: null,
        },
      }),
    ],
  },
  {
    name: 'recurring charges + 30-day spending trend up',
    referenceDate: '2026-06-15',
    transactions: [
      tx({ kind: 'expense', category: 'subs', amount_cents: 1500, date: '2026-04-05', merchant: 'Netflix' }),
      tx({ kind: 'expense', category: 'subs', amount_cents: 1500, date: '2026-05-05', merchant: 'Netflix' }),
      tx({ kind: 'expense', category: 'subs', amount_cents: 1500, date: '2026-06-05', merchant: 'Netflix' }),
      tx({ kind: 'expense', category: 'entertainment', amount_cents: 20000, date: '2026-06-01', merchant: 'Amazon' }),
      tx({ kind: 'expense', category: 'entertainment', amount_cents: 10000, date: '2026-05-01', merchant: 'Amazon' }),
    ],
    budgets: [],
    properties: [],
  },
  {
    // Locks Rule 6 (outlier) — previously UNvectored. A category with ≥5 trailing
    // expenses establishes a median; a current-month charge ≥2× it fires the rule.
    // The outlier tx carries a fixed lowercase UUID so `outlier-<id>` matches iOS's
    // `outlier-<uuidString.lowercased()>`. (R8)
    name: 'outlier transaction (≥2× category median)',
    referenceDate: '2026-06-15',
    transactions: [
      tx({ kind: 'expense', category: 'dining', amount_cents: 1000, date: '2026-01-15', merchant: 'Cafe A' }),
      tx({ kind: 'expense', category: 'dining', amount_cents: 1100, date: '2026-02-15', merchant: 'Cafe B' }),
      tx({ kind: 'expense', category: 'dining', amount_cents: 1200, date: '2026-03-15', merchant: 'Cafe C' }),
      tx({ kind: 'expense', category: 'dining', amount_cents: 1300, date: '2026-04-15', merchant: 'Cafe D' }),
      tx({ kind: 'expense', category: 'dining', amount_cents: 1400, date: '2026-05-15', merchant: 'Cafe E' }),
      tx({ id: 'a1a2a3a4-0000-4000-8000-000000000001', kind: 'expense', category: 'dining', amount_cents: 3000, date: '2026-06-10', merchant: 'Fancy Dinner' }),
      tx({ kind: 'income', category: 'income', amount_cents: 600000, date: '2026-06-02', merchant: 'Payroll' }),
    ],
    budgets: [],
    properties: [],
  },
  {
    // Locks the recurring-average rounding (R6): 3002/3 = 1000.67 → truncates to
    // 1000 (iOS Int64 division), NOT 1001 (the old web Math.round).
    name: 'recurring non-divisible average (truncates toward zero)',
    referenceDate: '2026-06-15',
    transactions: [
      tx({ kind: 'expense', category: 'subs', amount_cents: 1000, date: '2026-04-05', merchant: 'Streamly' }),
      tx({ kind: 'expense', category: 'subs', amount_cents: 1001, date: '2026-05-05', merchant: 'Streamly' }),
      tx({ kind: 'expense', category: 'subs', amount_cents: 1001, date: '2026-06-05', merchant: 'Streamly' }),
      tx({ kind: 'income', category: 'income', amount_cents: 500000, date: '2026-06-02', merchant: 'Payroll' }),
    ],
    budgets: [],
    properties: [],
  },
  {
    // Locks the recurring preview ORDER (spec 013): three recurring merchants
    // whose Map-insertion order (Thrifty first) differs from the canonical
    // amount-desc order, plus an exact amount tie (bZeta/Alpha, 1500 each)
    // broken by case-insensitive name — Alpha before bZeta despite casing.
    name: 'recurring preview ordering (amount desc, name tie-break)',
    referenceDate: '2026-06-15',
    transactions: [
      tx({ kind: 'expense', category: 'subs', amount_cents: 500, date: '2026-04-05', merchant: 'Thrifty' }),
      tx({ kind: 'expense', category: 'subs', amount_cents: 500, date: '2026-05-05', merchant: 'Thrifty' }),
      tx({ kind: 'expense', category: 'subs', amount_cents: 500, date: '2026-06-05', merchant: 'Thrifty' }),
      tx({ kind: 'expense', category: 'subs', amount_cents: 1500, date: '2026-04-06', merchant: 'bZeta' }),
      tx({ kind: 'expense', category: 'subs', amount_cents: 1500, date: '2026-05-06', merchant: 'bZeta' }),
      tx({ kind: 'expense', category: 'subs', amount_cents: 1500, date: '2026-06-06', merchant: 'bZeta' }),
      tx({ kind: 'expense', category: 'subs', amount_cents: 1500, date: '2026-04-07', merchant: 'Alpha' }),
      tx({ kind: 'expense', category: 'subs', amount_cents: 1500, date: '2026-05-07', merchant: 'Alpha' }),
      tx({ kind: 'expense', category: 'subs', amount_cents: 1500, date: '2026-06-07', merchant: 'Alpha' }),
    ],
    budgets: [],
    properties: [],
  },
  {
    // Locks the preview CASING source (spec 013): the same merchant key with
    // casing drift across transactions — the MOST RECENT casing ("STREAMLY")
    // must win on both surfaces.
    name: 'recurring preview casing (most recent transaction wins)',
    referenceDate: '2026-06-15',
    transactions: [
      tx({ kind: 'expense', category: 'subs', amount_cents: 1200, date: '2026-04-05', merchant: 'streamly' }),
      tx({ kind: 'expense', category: 'subs', amount_cents: 1200, date: '2026-05-05', merchant: 'Streamly' }),
      tx({ kind: 'expense', category: 'subs', amount_cents: 1200, date: '2026-06-05', merchant: 'STREAMLY' }),
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
    // Spec 013: recurring preview ordering/casing is cross-surface logic —
    // always present ([] on non-recurring insights) so both suites assert
    // one shape.
    preview_merchants: i.preview_merchants ?? [],
  })),
}))

// ── Transaction filter vectors ──────────────────────────────────────────────

const ftx = (o: Partial<Transaction>): Transaction =>
  ({ id: '', household_id: '00000000-0000-0000-0000-000000000201', merchant: '', category: 'dining', kind: 'expense', amount_cents: 0, source: '', date: '2026-05-15T12:00:00.000Z', created_by: '00000000-0000-0000-0000-000000000999', created_at: '', updated_at: '', owner_ids: [], shares: {}, ...o }) as Transaction

// UUID-form ids so the iOS suite can decode the vectors straight into `Transaction`
// (its ids are UUIDs); the web compares strings, so it's agnostic.
const uid = (n: string) => `00000000-0000-0000-0000-${n.padStart(12, '0')}`
const A = uid('1'), B = uid('2'), C = uid('3'), D = uid('4')
const U1 = uid('101'), U2 = uid('102'), H1 = uid('201')

// A fixed, representative set spanning scopes/categories/kinds/sources/owners/dates.
const FSET: Transaction[] = [
  ftx({ id: A, merchant: 'Bistro', category: 'dining', kind: 'expense', source: 'Amex Gold', household_id: H1, owner_ids: [U1], date: '2026-05-04T12:00:00.000Z' }),
  ftx({ id: B, merchant: 'Blue Bottle', category: 'coffee', kind: 'expense', source: 'TD Bank', household_id: H1, owner_ids: [U1], date: '2026-05-10T12:00:00.000Z' }),
  ftx({ id: C, merchant: 'Payroll', category: 'income', kind: 'income', source: 'TD Bank', household_id: H1, owner_ids: [U2], date: '2026-06-01T12:00:00.000Z' }),
  ftx({ id: D, merchant: 'Whole Foods', category: 'groceries', kind: 'expense', source: 'Chase', household_id: H1, owner_ids: [U1, U2], date: '2026-04-20T12:00:00.000Z' }),
]
const FCTX: FilterContext = { ownerNames: { [U1]: 'Ayaz', [U2]: 'Tasnuva' } }
const may = monthBounds('2026-05')

const FILTER_CASES: Array<{ name: string; transactions: Transaction[]; context: FilterContext; criteria: FilterCriteria }> = [
  { name: 'no filters → all', transactions: FSET, context: FCTX, criteria: emptyCriteria() },
  { name: 'search merchant', transactions: FSET, context: FCTX, criteria: { ...emptyCriteria(), query: 'bistro' } },
  // Query whitespace trim must strip a trailing newline (JS `.trim()`); locks the
  // iOS fix to `.whitespacesAndNewlines` — iOS `.whitespaces` left the `\n` and missed.
  { name: 'search merchant trailing newline (trimmed)', transactions: FSET, context: FCTX, criteria: { ...emptyCriteria(), query: 'bistro\n' } },
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
  // Percents total 100 + tolerance (100.4): floored bases over-allocate, so the
  // reclaim path must pull shares back down to sum exactly to amountCents.
  { name: 'percent-over-tolerance-reclaim', amountCents: 10000, owners: ['a', 'b'], split: { method: 'percent', percents: { a: 50.4, b: 50 } } },
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

// seedSplit: reconstruct the edit-form seed from stored cents. Locks the
// lossless custom-split edit/copy round-trip on both clients (R7). The
// `custom-5050-of-odd` case is the silent-loss scenario: stored a:5000/b:5001
// of 10001 is NOT the even split (even → a:5001/b:5000), so it must seed as
// `value` with the exact cents, not re-even-split on resave.
interface SeedCase { name: string; amountCents: number; owners: string[]; storedCents: Record<string, number> }

const SEED_CASES: SeedCase[] = [
  { name: 'even-divisible-seeds-even', amountCents: 10000, owners: ['a', 'b'], storedCents: { a: 5000, b: 5000 } },
  { name: 'even-remainder-seeds-even', amountCents: 10001, owners: ['a', 'b'], storedCents: { a: 5001, b: 5000 } },
  { name: 'custom-5050-of-odd-seeds-value', amountCents: 10001, owners: ['a', 'b'], storedCents: { a: 5000, b: 5001 } },
  { name: 'custom-7030-seeds-value', amountCents: 10000, owners: ['a', 'b'], storedCents: { a: 7000, b: 3000 } },
  { name: 'custom-three-uneven-seeds-value', amountCents: 10000, owners: ['a', 'b', 'c'], storedCents: { a: 5000, b: 3000, c: 2000 } },
  { name: 'single-owner-seeds-even', amountCents: 9999, owners: ['a'], storedCents: { a: 9999 } },
]

// ownerOrdering: the canonical owner sort that decides the leftover cent. Inputs
// are SCRAMBLED on purpose; both clients must canonicalize via `orderedOwnerIds`
// before `computeShares`, so the leftover cent lands on the same owner regardless
// of entry/storage order. Locks the C1 contract. (R1)
interface OrderCase { name: string; amountCents: number; owners: string[]; split: SplitInput }

const ORDER_CASES: OrderCase[] = [
  { name: 'even-three-remainder-2-scrambled', amountCents: 10001, owners: ['c', 'a', 'b'], split: { method: 'even' } },
  { name: 'even-two-remainder-1-scrambled', amountCents: 10001, owners: ['b', 'a'], split: { method: 'even' } },
  { name: 'percent-leftover-scrambled', amountCents: 10001, owners: ['b', 'a'], split: { method: 'percent', percents: { a: 50, b: 50 } } },
  { name: 'single-owner', amountCents: 9999, owners: ['x'], split: { method: 'even' } },
  // UUID-form ids (lowercase) in non-sorted order — mirrors real person ids.
  { name: 'uuid-even-remainder-1-scrambled', amountCents: 100, owners: [uid('3'), uid('1'), uid('2')], split: { method: 'even' } },
]

const ownerOrdering = ORDER_CASES.map((c) => {
  const ordered = orderedOwnerIds(c.owners)
  return {
    name: c.name,
    amountCents: c.amountCents,
    owners: c.owners,
    ordered,
    split: c.split,
    expected: computeShares(c.amountCents, ordered, c.split),
  }
})

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
  seeds: SEED_CASES.map((c) => {
    const seed = seedSplit(c.amountCents, c.owners, c.storedCents)
    // Round-trip: applying the seed re-derives the exact stored cents.
    const split: SplitInput = seed.method === 'even' ? { method: 'even' } : { method: 'value', values: seed.values }
    return {
      name: c.name,
      amountCents: c.amountCents,
      owners: c.owners,
      storedCents: c.storedCents,
      expected: seed,
      roundTrip: computeShares(c.amountCents, c.owners, split),
    }
  }),
  ownerOrdering,
}

// ── Currency conversion vectors ─────────────────────────────────────────────
// Locks toDisplayAmount / toUSDCents across all 7 currencies at the fallback
// rates (C2/C3). Money is always USD cents; zero-fraction currencies render at
// the correct magnitude. Display *strings* are locale-dependent and NOT vectored.
const CURRENCY_CENTS = [8742, 575, 100000, 999, 1, 123456, 50050]

const currency = {
  toDisplay: CURRENCIES.flatMap((cur) =>
    CURRENCY_CENTS.map((cents) => {
      const rate = FALLBACK_RATE_FROM_USD[cur]
      return { name: `${cur}-${cents}`, cents, currency: cur, rate, expected: toDisplayAmount(cents, cur, rate) }
    })
  ),
  toUsdCents: CURRENCIES.flatMap((cur) => {
    const rate = FALLBACK_RATE_FROM_USD[cur]
    return CURRENCY_CENTS.map((cents) => {
      const amount = toDisplayAmount(cents, cur, rate)
      return { name: `${cur}-disp-${amount}`, amount, currency: cur, rate, expected: toUSDCents(amount, cur, rate) }
    })
  }),
}

// ── Currency name / symbol vectors ──────────────────────────────────────────
// Lock the per-currency display NAME and SYMBOL so web and iOS never disagree
// (previously vector-blind: GBP name 'British'→'UK' and CNY symbol '¥'→'CN¥'
// had drifted). Both platforms read a FIXED table — no locale derivation.
const currencyNames = Object.fromEntries(CURRENCIES.map((c) => [c, CURRENCY_NAMES[c]]))
const currencySymbols = Object.fromEntries(CURRENCIES.map((c) => [c, currencySymbol(c)]))

// ── Lease date-math vectors ─────────────────────────────────────────────────
// First vector for the lease helpers (previously untested). Locks rentDueDay,
// daysUntilNextRent (incl. the due-day > month-length CLAMP), daysUntilEnd, and
// isRenewalSoon so iOS — which overflowed a day-31 due date into the next month —
// matches web. asOf is injected; integer/boolean outputs are timezone-stable.
const leaseOf = (o: Partial<LeaseInfo>): LeaseInfo =>
  ({ property_id: 'p', monthly_rent_cents: 250000, lease_start: '2025-01-01', lease_end: '2026-01-01', security_deposit_cents: null, paid_with_source: null, ...o }) as LeaseInfo

const LEASE_CASES: Array<{ name: string; lease: Partial<LeaseInfo>; asOf: string }> = [
  { name: 'due today (start-of-month lease)', lease: { lease_start: '2025-09-01', lease_end: '2026-08-31' }, asOf: '2025-09-01' },
  { name: 'due-day 31 clamps to June 30 (15 days, not 16)', lease: { lease_start: '2025-01-31', lease_end: '2027-01-31' }, asOf: '2025-06-15' },
  { name: 'due-day 31 clamps to Feb 28 (13 days)', lease: { lease_start: '2025-01-31', lease_end: '2027-01-31' }, asOf: '2025-02-15' },
  { name: 'past due day rolls to next month', lease: { lease_start: '2025-03-05', lease_end: '2026-03-05' }, asOf: '2025-06-10' },
  { name: 'renewal soon (ends within 60 days)', lease: { lease_start: '2024-07-15', lease_end: '2025-07-15' }, asOf: '2025-06-15' },
  { name: 'renewal not soon', lease: { lease_start: '2025-01-01', lease_end: '2026-06-01' }, asOf: '2025-06-15' },
]

const lease = LEASE_CASES.map((c) => {
  const l = leaseOf(c.lease)
  const asOf = d(c.asOf)
  return {
    input: { name: c.name, lease: l, asOf: c.asOf },
    expected: {
      rentDueDay: rentDueDay(l),
      daysUntilNextRent: daysUntilNextRent(l, asOf),
      daysUntilEnd: daysUntilEnd(l, asOf),
      isRenewalSoon: isRenewalSoon(l, asOf),
    },
  }
})

// ── Dashboard month-scope vectors ───────────────────────────────────────────
// Locks the NEW pure date logic behind the dashboard's specific-month picker so
// iOS and web derive the same month list, reference date, and stepping. The
// selected-month → window conversion is NOT vectored here because it reuses the
// already-vectored `monthBounds` (transaction-filters.json).

const AVAILABLE_MONTHS_CASES: Array<{ name: string; dates: string[] }> = [
  { name: 'empty', dates: [] },
  { name: 'single month', dates: ['2026-06-15T12:00:00.000Z'] },
  { name: 'multiple months unsorted', dates: ['2026-04-20T12:00:00.000Z', '2026-06-01T09:00:00.000Z', '2026-05-10T12:00:00.000Z'] },
  { name: 'duplicate days same month', dates: ['2026-06-05T12:00:00.000Z', '2026-06-30T23:00:00.000Z'] },
  // String-slice keys these to May and June — a local-calendar re-bucket could disagree.
  { name: 'month boundary keyed by string slice', dates: ['2026-05-31T23:59:59.000Z', '2026-06-01T00:00:00.000Z'] },
  { name: 'year boundary Dec to Jan', dates: ['2025-12-15T12:00:00.000Z', '2026-01-10T12:00:00.000Z'] },
]

// availableRanges (spec 013 US4 — the last unvectored month-scope function).
// Availability = months between the EARLIEST transaction and `now` must reach
// monthCount(range) - 1; thisMonth is always offered. Cases pin every count
// boundary, the boundary-miss below it, year-line math, gaps, and future rows.
const NOON = (d: string) => `${d}T12:00:00.000Z`
const AVAILABLE_RANGES_CASES: Array<{ name: string; dates: string[]; now: string }> = [
  { name: 'empty history', dates: [], now: NOON('2026-06-15') },
  { name: 'single month', dates: [NOON('2026-06-03')], now: NOON('2026-06-15') },
  { name: 'one month back misses last3Months', dates: [NOON('2026-05-20')], now: NOON('2026-06-15') },
  { name: 'exactly 3-month boundary', dates: [NOON('2026-04-28')], now: NOON('2026-06-15') },
  { name: 'five-month span', dates: [NOON('2026-02-10'), NOON('2026-05-01')], now: NOON('2026-06-15') },
  { name: 'exactly 6-month boundary', dates: [NOON('2026-01-31')], now: NOON('2026-06-15') },
  { name: 'exactly 12-month boundary', dates: [NOON('2025-07-04')], now: NOON('2026-06-15') },
  { name: 'thirteen-month span unlocks all', dates: [NOON('2025-06-15')], now: NOON('2026-06-15') },
  { name: 'gap months (earliest drives, gaps irrelevant)', dates: [NOON('2025-06-15'), NOON('2026-06-01')], now: NOON('2026-06-15') },
  { name: 'year boundary Nov to Jan', dates: [NOON('2025-11-30')], now: NOON('2026-01-15') },
  { name: 'future-dated row does not unlock ranges', dates: [NOON('2026-06-01'), NOON('2026-07-20')], now: NOON('2026-06-15') },
]

const REF_MONTHS = ['2026-06', '2026-01', '2025-12', '2026-02']

const STEP_CASES: Array<{ name: string; months: string[]; current: string; direction: 'prev' | 'next' }> = [
  { name: 'prev to older', months: ['2026-06', '2026-05', '2026-04'], current: '2026-06', direction: 'prev' },
  { name: 'next to newer', months: ['2026-06', '2026-05', '2026-04'], current: '2026-05', direction: 'next' },
  { name: 'prev at earliest edge', months: ['2026-06', '2026-05', '2026-04'], current: '2026-04', direction: 'prev' },
  { name: 'next at latest edge', months: ['2026-06', '2026-05', '2026-04'], current: '2026-06', direction: 'next' },
  { name: 'current not in list', months: ['2026-06'], current: '2025-01', direction: 'prev' },
]

const dashboardMonthScope = {
  availableMonths: AVAILABLE_MONTHS_CASES.map((c) => ({
    name: c.name,
    dates: c.dates,
    expected: availableMonths(c.dates.map((date) => tx({ date }))),
  })),
  availableRanges: AVAILABLE_RANGES_CASES.map((c) => ({
    name: c.name,
    dates: c.dates,
    now: c.now,
    expected: availableRanges(c.dates.map((date) => tx({ date })), new Date(c.now)),
  })),
  monthReferenceDate: REF_MONTHS.map((m) => ({
    name: m,
    month: m,
    expected: monthReferenceDate(m).toISOString(),
  })),
  stepMonth: STEP_CASES.map((c) => ({
    name: c.name,
    months: c.months,
    current: c.current,
    direction: c.direction,
    expected: stepMonth(c.months, c.current, c.direction),
  })),
}

// ── Member balance (reimbursement / settle-up) vectors ──────────────────────
// Locks balanceBetween(viewer, other) — net cents owed, + => other owes viewer.
// Transfers store paid_by = sender, owner_ids = [recipient], shares = {recipient: amount}.
const MB_V = uid('101'), MB_OTHER = uid('102'), MB_THIRD = uid('103')
const btx = (o: Partial<Transaction>): Transaction =>
  ({ id: '', household_id: 'h', merchant: '', category: 'groceries', kind: 'expense', amount_cents: 0, source: '', date: '2026-06-15T12:00:00.000Z', created_by: 'u', created_at: '', updated_at: '', paid_by: null, owner_ids: [], shares: {}, ...o }) as Transaction
const expTx = (paidBy: string, shares: Record<string, number>): Transaction =>
  btx({ kind: 'expense', paid_by: paidBy, owner_ids: Object.keys(shares), shares, amount_cents: Object.values(shares).reduce((s, n) => s + n, 0) })
const xferTx = (from: string, to: string, amount: number): Transaction =>
  btx({ kind: 'transfer', category: 'transfer', paid_by: from, owner_ids: [to], shares: { [to]: amount }, amount_cents: amount })

const MEMBER_BALANCE_CASES: Array<{ name: string; viewer: string; other: string; transactions: Transaction[] }> = [
  { name: 'worked example: 150 split 100/50, you paid', viewer: MB_V, other: MB_OTHER, transactions: [expTx(MB_V, { [MB_V]: 10000, [MB_OTHER]: 5000 })] },
  { name: 'reverse: other paid, you owe your share', viewer: MB_V, other: MB_OTHER, transactions: [expTx(MB_OTHER, { [MB_V]: 10000, [MB_OTHER]: 5000 })] },
  { name: 'payer not an owner: other-only expense you paid', viewer: MB_V, other: MB_OTHER, transactions: [expTx(MB_V, { [MB_OTHER]: 8000 })] },
  { name: 'reimbursement settles to zero', viewer: MB_V, other: MB_OTHER, transactions: [expTx(MB_V, { [MB_V]: 10000, [MB_OTHER]: 5000 }), xferTx(MB_OTHER, MB_V, 5000)] },
  { name: 'partial reimbursement', viewer: MB_V, other: MB_OTHER, transactions: [expTx(MB_V, { [MB_V]: 10000, [MB_OTHER]: 5000 }), xferTx(MB_OTHER, MB_V, 2000)] },
  { name: 'over-reimbursement flips sign', viewer: MB_V, other: MB_OTHER, transactions: [expTx(MB_V, { [MB_V]: 10000, [MB_OTHER]: 5000 }), xferTx(MB_OTHER, MB_V, 7000)] },
  { name: 'multi-expense mixed payers net', viewer: MB_V, other: MB_OTHER, transactions: [expTx(MB_V, { [MB_V]: 10000, [MB_OTHER]: 4000 }), expTx(MB_OTHER, { [MB_V]: 3000, [MB_OTHER]: 9000 })] },
  { name: 'third member tx does not affect viewer<->other', viewer: MB_V, other: MB_OTHER, transactions: [expTx(MB_V, { [MB_V]: 5000, [MB_THIRD]: 5000 })] },
  { name: 'viewer pays other with no prior debt (other now owes viewer)', viewer: MB_V, other: MB_OTHER, transactions: [xferTx(MB_V, MB_OTHER, 3000)] },
]
const memberBalance = {
  cases: MEMBER_BALANCE_CASES.map((c) => ({
    name: c.name,
    viewer: c.viewer,
    other: c.other,
    transactions: c.transactions,
    expected: balanceBetween(c.viewer, c.other, c.transactions),
  })),
}

// ── Housing net-rental vectors ───────────────────────────────────────────────
// Shared source of truth for the net rental figure on both the Dashboard summary
// and the property-detail net-balance card (lib/finance/housing.ts ↔ iOS
// Property.swift). Occupancy is a resolved boolean here so the vector is
// platform-neutral; each surface maps its Unit → { rentCents, occupied }.
interface HousingNetRentalInput {
  name: string
  units: RentUnit[]
  mortgagePaymentCents: number
}
const HOUSING_NET_RENTAL_INPUTS: HousingNetRentalInput[] = [
  { name: 'two occupied units, no mortgage (paid-off still earns rent)', units: [{ rentCents: 250000, occupied: true }, { rentCents: 240000, occupied: true }], mortgagePaymentCents: 0 },
  { name: 'one vacant unit drags net negative (review opposite-sign case)', units: [{ rentCents: 250000, occupied: true }, { rentCents: 240000, occupied: true }, { rentCents: 260000, occupied: false }], mortgagePaymentCents: 505654 },
  { name: 'all units vacant → net is minus the mortgage', units: [{ rentCents: 250000, occupied: false }, { rentCents: 240000, occupied: false }], mortgagePaymentCents: 300000 },
  { name: 'no units at all → occupied rent 0', units: [], mortgagePaymentCents: 300000 },
  { name: 'single occupied unit covering the mortgage exactly', units: [{ rentCents: 300000, occupied: true }], mortgagePaymentCents: 300000 },
  { name: 'occupied units net positive against a mortgage', units: [{ rentCents: 200000, occupied: true }, { rentCents: 200000, occupied: true }], mortgagePaymentCents: 300000 },
]
const housingNetRental = HOUSING_NET_RENTAL_INPUTS.map((i) => ({
  input: i,
  expected: {
    occupiedRentCents: occupiedRentCents(i.units),
    netRentalCents: netRentalCents(i.units, i.mortgagePaymentCents),
  },
}))

// ── Write ───────────────────────────────────────────────────────────────────

mkdirSync(OUT, { recursive: true })
writeFileSync(resolve(OUT, 'mortgage.json'), JSON.stringify(mortgage, null, 2) + '\n')
writeFileSync(resolve(OUT, 'housing-net-rental.json'), JSON.stringify(housingNetRental, null, 2) + '\n')
writeFileSync(resolve(OUT, 'insights.json'), JSON.stringify(insights, null, 2) + '\n')
writeFileSync(resolve(OUT, 'transaction-filters.json'), JSON.stringify(filters, null, 2) + '\n')
writeFileSync(resolve(OUT, 'transaction-splits.json'), JSON.stringify(splits, null, 2) + '\n')
writeFileSync(resolve(OUT, 'currency.json'), JSON.stringify(currency, null, 2) + '\n')
writeFileSync(resolve(OUT, 'dashboard-month-scope.json'), JSON.stringify(dashboardMonthScope, null, 2) + '\n')
writeFileSync(resolve(OUT, 'member-balance.json'), JSON.stringify(memberBalance, null, 2) + '\n')
writeFileSync(resolve(OUT, 'currency-names.json'), JSON.stringify(currencyNames, null, 2) + '\n')
writeFileSync(resolve(OUT, 'currency-symbols.json'), JSON.stringify(currencySymbols, null, 2) + '\n')
writeFileSync(resolve(OUT, 'lease.json'), JSON.stringify(lease, null, 2) + '\n')
console.log(`Wrote ${mortgage.length} mortgage + ${insights.length} insight + ${filters.cases.length} filter + ${splits.cases.length} split + ${splits.ownerOrdering.length} ownerOrdering + ${currency.toDisplay.length} currency + ${Object.keys(currencyNames).length} currency-names + ${Object.keys(currencySymbols).length} currency-symbols + ${lease.length} lease + ${dashboardMonthScope.availableMonths.length} availableMonths/${dashboardMonthScope.stepMonth.length} stepMonth + ${memberBalance.cases.length} member-balance vectors to ${OUT}`)
