// The labelled coverage scenarios (spec 026, FR-004). Special scenarios GUARANTEE
// every coverage dimension; a parameterized family then adds volume-with-variety
// to reach the few-hundred-household band (coverage over volume — FR-012).
//
// Amount ranges and the over-budget / subscription-creep flavors are loosely
// grounded in docs/research/finance-habits-budgeting-apps.md so the corpus shows
// realistic messiness (over-budget months, forgotten subscriptions, refunds),
// not an idealized happy path — while staying a *structural* edge corpus (the
// research-driven realistic distributions are the later §9.2 feature).

import type { CurrencyKey } from '@/lib/finance/money'
import type { TransactionCategory } from '@/lib/types'
import { mulberry32, type Prng } from './prng'
import type { GeneratedTransaction, HouseholdScenario, TxIntent } from './model'
import type { Dimension } from './coverage'
import {
  buildUser,
  buildHousehold,
  buildPerson,
  buildMember,
  buildCard,
  buildBudget,
  buildTransaction,
  buildProperty,
  type TxSpec,
} from './builders'
import { EPOCH, firstOfMonth, lastOfMonth, isoAt, nonNoonUtc, addMonths } from './clock'

const MERCHANTS: Record<string, string[]> = {
  coffee: ['Blue Bottle', 'Philz Coffee', 'Local Roasters'],
  groceries: ['Whole Foods', 'Trader Joe’s', 'Safeway', 'Costco'],
  dining: ['Tartine', 'Chez Nous', 'Ramen House'],
  subs: ['Netflix', 'Spotify', 'Disney+', 'iCloud', 'The Times'],
  fuel: ['Shell', 'Chevron'],
  health: ['CityMD', 'CVS Pharmacy'],
  transit: ['MTA', 'BART'],
  utilities: ['Con Edison', 'PG&E', 'City Water'],
  entertainment: ['AMC Theatres', 'Steam'],
  income: ['Acme Payroll', 'Globex Payroll'],
}

const EXPENSE_CATEGORIES: TransactionCategory[] = [
  'groceries',
  'dining',
  'coffee',
  'subs',
  'fuel',
  'health',
  'transit',
  'utilities',
  'entertainment',
]

/** Rough per-transaction cent ranges (research-grounded, US household). */
function amountFor(category: TransactionCategory, r: Prng): number {
  switch (category) {
    case 'groceries':
      return r.range(4000, 12000)
    case 'dining':
      return r.range(2000, 9000)
    case 'coffee':
      return r.range(400, 800)
    case 'subs':
      return r.pick([599, 999, 1099, 1599, 1799])
    case 'fuel':
      return r.range(3000, 7000)
    case 'health':
      return r.range(2000, 9000)
    case 'transit':
      return r.range(2500, 4000)
    case 'utilities':
      return r.range(8000, 16000)
    case 'entertainment':
      return r.range(1500, 5000)
    case 'income':
      return r.range(400000, 600000)
    default:
      return r.range(1000, 5000)
  }
}

interface BaseOpts {
  currency: CurrencyKey
  /** separate-finances: each person owns only their own rows (no joint). */
  separate?: boolean
  personNames?: [string, string]
  /** Explicit person ids + sort orders (used by the order-mismatch scenario). */
  people?: Array<{ id: string; name: string; sortOrder: number }>
}

interface Base {
  label: string
  currency: CurrencyKey
  separate: boolean
  hhId: string
  p0: string
  p1: string
  people: HouseholdScenario['people']
  scenario: HouseholdScenario
}

function baseHousehold(label: string, opts: BaseOpts): Base {
  const hhId = `${label}-hh`
  const u0 = `${label}-u-0`
  const u1 = `${label}-u-1`
  const [n0, n1] = opts.personNames ?? ['Ava', 'Ben']
  const peopleSpec =
    opts.people ??
    [
      { id: `${label}-p-0`, name: n0, sortOrder: 0 },
      { id: `${label}-p-1`, name: n1, sortOrder: 1 },
    ]
  const users = [buildUser(u0, peopleSpec[0].name, 'sage'), buildUser(u1, peopleSpec[1].name, 'slate')]
  const people = [
    buildPerson(peopleSpec[0].id, hhId, peopleSpec[0].name, peopleSpec[0].sortOrder, u0, 'sage'),
    buildPerson(peopleSpec[1].id, hhId, peopleSpec[1].name, peopleSpec[1].sortOrder, u1, 'slate'),
  ]
  const scenario: HouseholdScenario = {
    label,
    dimensions: [],
    displayCurrency: opts.currency,
    users,
    household: buildHousehold(hhId, u0, `${peopleSpec[0].name} & ${peopleSpec[1].name}`),
    people,
    members: [buildMember(hhId, u0, 'owner'), buildMember(hhId, u1, 'member')],
    cards: [buildCard(`${label}-card-0`, hhId, 'Joint Checking'), buildCard(`${label}-card-1`, hhId, 'Everyday Card')],
    transactions: [],
    properties: [],
    budgets: [],
  }
  return {
    label,
    currency: opts.currency,
    separate: opts.separate ?? false,
    hhId,
    p0: peopleSpec[0].id,
    p1: peopleSpec[1].id,
    people,
    scenario,
  }
}

function addDim(s: HouseholdScenario, ...dims: Dimension[]): void {
  for (const d of dims) if (!s.dimensions.includes(d)) s.dimensions.push(d)
}

const CURRENCY_DIM: Record<CurrencyKey, Dimension | null> = {
  usd: 'currency-usd',
  eur: 'currency-eur',
  jpy: 'currency-jpy',
  bdt: 'currency-bdt',
  cad: null,
  gbp: null,
  cny: null,
}

/** Add a month of expenses; returns the built transactions. */
function monthExpenses(
  base: Base,
  r: Prng,
  year: number,
  month1: number,
  categories: TransactionCategory[],
  startIdx: number,
  extraIntent: TxIntent[] = []
): GeneratedTransaction[] {
  const out: GeneratedTransaction[] = []
  categories.forEach((cat, i) => {
    const idx = startIdx + i
    const day = r.range(2, 26)
    const owners = base.separate ? [r.bool() ? base.p0 : base.p1] : r.bool(0.6) ? [base.p0, base.p1] : [base.p0]
    const payer = owners.length === 2 ? (r.bool() ? base.p0 : base.p1) : owners[0]
    out.push(
      buildTransaction({
        id: `${base.label}-tx-${idx}`,
        householdId: base.hhId,
        merchant: MERCHANTS[cat] ? r.pick(MERCHANTS[cat]) : cat,
        category: cat,
        kind: 'expense',
        amountCents: amountFor(cat, r),
        source: r.pick(['Joint Checking', 'Everyday Card']),
        date: isoAt(year, month1, day, 12, 0),
        createdBy: `${base.label}-u-0`,
        owners,
        paidBy: payer,
        intent: extraIntent,
      })
    )
  })
  return out
}

// ---------------------------------------------------------------------------
// Special scenarios — each GUARANTEES the dimensions it tags.
// ---------------------------------------------------------------------------

function jointEvenUsd(r: Prng): HouseholdScenario {
  const base = baseHousehold('joint-even-usd', { currency: 'usd' })
  const s = base.scenario
  let idx = 0
  // Six recent months, dense (all categories each month) — hits month-dense.
  for (let m = 0; m < 6; m++) {
    const { year, month1 } = addMonths(EPOCH.year, EPOCH.month - 5 + m, 0)
    const txs = monthExpenses(base, r, year, month1, EXPENSE_CATEGORIES, idx)
    idx += txs.length
    s.transactions.push(...txs)
  }
  // A recurring merchant across every month (Netflix subs) — recurring-merchant.
  for (let m = 0; m < 6; m++) {
    const { year, month1 } = addMonths(EPOCH.year, EPOCH.month - 5 + m, 0)
    s.transactions.push(
      buildTransaction({
        id: `${base.label}-sub-${m}`,
        householdId: base.hhId,
        merchant: 'Netflix',
        category: 'subs',
        kind: 'expense',
        amountCents: 1599,
        source: 'Everyday Card',
        date: isoAt(year, month1, 7, 12, 0),
        createdBy: `${base.label}-u-0`,
        owners: [base.p0, base.p1],
        paidBy: base.p0,
        intent: ['recurring-merchant', 'subscription'],
      })
    )
  }
  // Monthly income + a partial settle-up so member balances are non-zero.
  const cur = addMonths(EPOCH.year, EPOCH.month, 0)
  s.transactions.push(
    buildTransaction({
      id: `${base.label}-income`,
      householdId: base.hhId,
      merchant: 'Acme Payroll',
      category: 'income',
      kind: 'income',
      amountCents: 520000,
      source: 'Joint Checking',
      date: isoAt(cur.year, cur.month1, 1, 12, 0),
      createdBy: `${base.label}-u-0`,
      owners: [base.p0],
      intent: ['income'],
    }),
    buildTransaction({
      id: `${base.label}-settle`,
      householdId: base.hhId,
      merchant: 'Settle up',
      category: 'transfer',
      kind: 'transfer',
      amountCents: 30000,
      source: 'Joint Checking',
      date: isoAt(cur.year, cur.month1, 3, 12, 0),
      createdBy: `${base.label}-u-0`,
      owners: [base.p0],
      paidBy: base.p1,
      intent: ['settle-up'],
    })
  )
  // Generous budgets: this household's seeded single-tx-per-category spend stays
  // well inside every limit, so all three land in the UNDER band (the near/over
  // bands are realized deterministically by the dedicated `budget-bands`
  // scenario — coverage of a band must be exhibited by real spend, not asserted
  // by a hand-written tag that can silently drift).
  s.budgets.push(
    buildBudget(`${base.label}-b-groceries`, base.hhId, 'groceries', 40000),
    buildBudget(`${base.label}-b-dining`, base.hhId, 'dining', 30000),
    buildBudget(`${base.label}-b-coffee`, base.hhId, 'coffee', 8000)
  )
  addDim(
    s,
    'household-joint',
    'split-even',
    'currency-usd',
    'month-dense',
    'recurring-merchant',
    'budget-under'
  )
  return s
}

function separateEur(r: Prng): HouseholdScenario {
  const base = baseHousehold('separate-eur', { currency: 'eur', separate: true })
  const s = base.scenario
  // Sparse: only 3 categories, and a gap month with zero transactions.
  let idx = 0
  const cats: TransactionCategory[] = ['groceries', 'transit', 'coffee']
  for (const mOffset of [-4, -2, 0]) {
    // months -3 and -1 are intentionally empty → sparse
    const { year, month1 } = addMonths(EPOCH.year, EPOCH.month + mOffset, 0)
    const txs = monthExpenses(base, r, year, month1, cats, idx, ['sparse'])
    idx += txs.length
    s.transactions.push(...txs)
  }
  addDim(s, 'household-separate', 'currency-eur', 'split-even', 'month-sparse')
  return s
}

function percentValueUsd(r: Prng): HouseholdScenario {
  const base = baseHousehold('percent-value-usd', { currency: 'usd' })
  const s = base.scenario
  const cur = addMonths(EPOCH.year, EPOCH.month, 0)
  // percent split 70/30
  s.transactions.push(
    buildTransaction({
      id: `${base.label}-tx-pct`,
      householdId: base.hhId,
      merchant: 'Costco',
      category: 'groceries',
      kind: 'expense',
      amountCents: 13337, // not cleanly divisible → leftover cent under percent
      source: 'Joint Checking',
      date: isoAt(cur.year, cur.month1, 10, 12, 0),
      createdBy: `${base.label}-u-0`,
      owners: [base.p0, base.p1],
      paidBy: base.p0,
      split: { method: 'percent', percents: { [base.p0]: 70, [base.p1]: 30 } },
      intent: ['leftover-cent'],
    })
  )
  // value split summing exactly to the amount
  s.transactions.push(
    buildTransaction({
      id: `${base.label}-tx-val`,
      householdId: base.hhId,
      merchant: 'Tartine',
      category: 'dining',
      kind: 'expense',
      amountCents: 9640,
      source: 'Everyday Card',
      date: isoAt(cur.year, cur.month1, 12, 12, 0),
      createdBy: `${base.label}-u-0`,
      owners: [base.p0, base.p1],
      paidBy: base.p1,
      split: { method: 'value', values: { [base.p0]: 6000, [base.p1]: 3640 } },
    })
  )
  addDim(s, 'household-joint', 'split-percent', 'split-value', 'leftover-cent', 'currency-usd')
  return s
}

function currencyLens(currency: CurrencyKey, r: Prng): HouseholdScenario {
  const label = `currency-${currency}`
  const base = baseHousehold(label, { currency })
  const s = base.scenario
  let idx = 0
  for (const mOffset of [-2, -1, 0]) {
    const { year, month1 } = addMonths(EPOCH.year, EPOCH.month + mOffset, 0)
    const txs = monthExpenses(base, r, year, month1, ['groceries', 'dining', 'utilities'], idx)
    idx += txs.length
    s.transactions.push(...txs)
  }
  const dim = CURRENCY_DIM[currency]
  if (dim) addDim(s, dim)
  addDim(s, 'household-joint', 'split-even')
  return s
}

function febBoundaries(r: Prng): HouseholdScenario {
  const base = baseHousehold('feb-boundaries', { currency: 'usd' })
  const s = base.scenario
  const rows: TxSpec[] = [
    // non-leap Feb 2027: first + last day (noon UTC)
    { day: firstOfMonth(2027, 2), intent: ['month-boundary-first'] as TxIntent[] },
    { day: lastOfMonth(2027, 2), intent: ['month-boundary-last'] as TxIntent[] }, // Feb 28
    // leap Feb 2028: first + last day (Feb 29)
    { day: firstOfMonth(2028, 2), intent: ['month-boundary-first'] as TxIntent[] },
    { day: lastOfMonth(2028, 2), intent: ['month-boundary-last'] as TxIntent[] }, // Feb 29
    // Jan 31 + Mar 1 to exercise 31-day and adjacent boundaries
    { day: lastOfMonth(2027, 1), intent: ['month-boundary-last'] as TxIntent[] },
    { day: firstOfMonth(2027, 3), intent: ['month-boundary-first'] as TxIntent[] },
  ].map((row, i) => ({
    id: `${base.label}-tx-${i}`,
    householdId: base.hhId,
    merchant: r.pick(MERCHANTS.groceries),
    category: 'groceries' as TransactionCategory,
    kind: 'expense' as const,
    amountCents: r.range(4000, 9000),
    source: 'Joint Checking',
    date: row.day,
    createdBy: `${base.label}-u-0`,
    owners: [base.p0, base.p1],
    paidBy: base.p0,
    intent: row.intent,
  }))
  for (const spec of rows) s.transactions.push(buildTransaction(spec))
  addDim(
    s,
    'household-joint',
    'split-even',
    'currency-usd',
    'month-boundary-first',
    'month-boundary-last',
    'month-feb-leap',
    'month-feb-nonleap'
  )
  return s
}

function refunds(r: Prng): HouseholdScenario {
  const base = baseHousehold('refunds-credits', { currency: 'usd' })
  const s = base.scenario
  const cur = addMonths(EPOCH.year, EPOCH.month, 0)
  // A purchase then a REFUND. The DB forbids negative amount_cents (the
  // `amount_non_negative` check) and transaction_shares are `>= 0`, so a return
  // is modelled the way the app represents money coming back: a positive
  // income-kind credit — not a negative expense.
  s.transactions.push(
    buildTransaction({
      id: `${base.label}-tx-buy`,
      householdId: base.hhId,
      merchant: 'Whole Foods',
      category: 'groceries',
      kind: 'expense',
      amountCents: 8215,
      source: 'Everyday Card',
      date: isoAt(cur.year, cur.month1, 5, 12, 0),
      createdBy: `${base.label}-u-0`,
      owners: [base.p0, base.p1],
      paidBy: base.p0,
    }),
    buildTransaction({
      id: `${base.label}-tx-refund`,
      householdId: base.hhId,
      merchant: 'Whole Foods refund',
      category: 'income',
      kind: 'income',
      amountCents: 2001, // the credit back (positive; income kind)
      source: 'Everyday Card',
      date: isoAt(cur.year, cur.month1, 9, 12, 0),
      createdBy: `${base.label}-u-0`,
      owners: [base.p0],
      intent: ['refund'],
    })
  )
  addDim(s, 'household-joint', 'split-even', 'currency-usd', 'refund-credit')
  return s
}

function housing(r: Prng): HouseholdScenario {
  const base = baseHousehold('housing-mortgage-lease', { currency: 'usd' })
  const s = base.scenario
  // Primary home with an active mortgage (recent closing).
  s.properties.push(
    buildProperty({
      id: `${base.label}-prop-home`,
      householdId: base.hhId,
      kind: 'primary_home',
      address: '124 Oak Lane',
      nickname: 'Home',
      mortgage: {
        purchase_price_cents: 62000000,
        original_loan_cents: 49600000,
        annual_interest_rate_percent: 6.25,
        loan_term_years: 30,
        closing_date: isoAt(2024, 6, 1, 12, 0),
        auto_pay_source: 'Joint Checking',
      },
    })
  )
  // Rental with a lease + on-time payments.
  s.properties.push(
    buildProperty({
      id: `${base.label}-prop-rental`,
      householdId: base.hhId,
      kind: 'rental',
      address: '88 Birch Street',
      nickname: 'Birch rental',
      lease: {
        monthly_rent_cents: 285000,
        lease_start: isoAt(2027, 1, 1, 12, 0),
        lease_end: isoAt(2028, 1, 1, 12, 0),
        security_deposit_cents: 285000,
        paid_with_source: 'Joint Checking',
      },
      rentalPayments: [
        { id: `${base.label}-rp-0`, amount_cents: 285000, date: isoAt(2027, 6, 1, 12, 0), note: 'On time', created_at: isoAt(2027, 6, 1, 12, 0) },
        { id: `${base.label}-rp-1`, amount_cents: 285000, date: isoAt(2027, 7, 1, 12, 0), note: null, created_at: isoAt(2027, 7, 1, 12, 0) },
      ],
    })
  )
  addDim(s, 'household-joint', 'currency-usd', 'property-mortgage', 'property-lease')
  return s
}

function mortgagePaidOff(r: Prng): HouseholdScenario {
  const base = baseHousehold('mortgage-paid-off', { currency: 'usd' })
  const s = base.scenario
  // Closing 31 years before EPOCH on a 30-year loan → schedule fully elapsed
  // (the ~$2 residual case).
  s.properties.push(
    buildProperty({
      id: `${base.label}-prop-home`,
      householdId: base.hhId,
      kind: 'primary_home',
      address: '9 Elm Court',
      nickname: 'Paid-off home',
      mortgage: {
        purchase_price_cents: 24000000,
        original_loan_cents: 19200000,
        annual_interest_rate_percent: 7.5,
        loan_term_years: 30,
        closing_date: isoAt(EPOCH.year - 31, 6, 1, 12, 0),
        auto_pay_source: 'Joint Checking',
      },
    })
  )
  addDim(s, 'household-joint', 'currency-usd', 'mortgage-paid-off')
  return s
}

function multifamily(r: Prng): HouseholdScenario {
  const base = baseHousehold('multifamily-occupancy', { currency: 'usd' })
  const s = base.scenario
  s.properties.push(
    buildProperty({
      id: `${base.label}-prop-mf`,
      householdId: base.hhId,
      kind: 'multifamily',
      address: '200 Maple Ave',
      nickname: 'Maple triplex',
      units: [
        { id: `${base.label}-u1`, name: 'Unit A', monthly_rent_cents: 180000, tenant_name: 'R. Diaz', tenant_email: null, sort_order: 0, occupied: true },
        { id: `${base.label}-u2`, name: 'Unit B', monthly_rent_cents: 175000, tenant_name: 'K. Osei', tenant_email: null, sort_order: 1, occupied: true },
        { id: `${base.label}-u3`, name: 'Unit C', monthly_rent_cents: 190000, tenant_name: null, tenant_email: null, sort_order: 2, occupied: false },
      ],
      rentalPayments: [
        { id: `${base.label}-rp-0`, amount_cents: 355000, date: isoAt(2027, 7, 1, 12, 0), note: 'A+B', created_at: isoAt(2027, 7, 1, 12, 0) },
      ],
    })
  )
  addDim(s, 'household-joint', 'currency-usd', 'multifamily-occupancy')
  return s
}

function orderMismatchA4(r: Prng): HouseholdScenario {
  // Lexical id order (alpha < beta) is the OPPOSITE of sort_order (beta=0, alpha=1),
  // so the even-split leftover cent (goes to owners[0]) lands on different people
  // under canonical vs sort_order ordering — the A4 divergence.
  const label = 'order-mismatch-a4'
  const base = baseHousehold(label, {
    currency: 'usd',
    people: [
      { id: `${label}-p-alpha`, name: 'Alva', sortOrder: 1 },
      { id: `${label}-p-beta`, name: 'Bo', sortOrder: 0 },
    ],
  })
  const s = base.scenario
  const cur = addMonths(EPOCH.year, EPOCH.month, 0)
  // 1001 cents / 2 owners even → 500 + 500 with 1 leftover cent to owners[0].
  s.transactions.push(
    buildTransaction({
      id: `${label}-tx-odd`,
      householdId: base.hhId,
      merchant: 'Ramen House',
      category: 'dining',
      kind: 'expense',
      amountCents: 1001,
      source: 'Everyday Card',
      date: isoAt(cur.year, cur.month1, 14, 12, 0),
      createdBy: `${label}-u-0`,
      owners: [base.p0, base.p1],
      paidBy: base.p0,
      intent: ['leftover-cent'],
    })
  )
  s.timezoneNote = undefined
  addDim(s, 'household-joint', 'split-even', 'currency-usd', 'leftover-cent', 'order-mismatch')
  return s
}

function tzBoundaryA2(r: Prng): HouseholdScenario {
  // Boundary rows stored at NON-noon UTC times, chosen so a viewer west of UTC
  // (America/New_York) buckets them into the adjacent month. Feb 1 2027 00:15Z
  // is Jan 31 19:15 in NY → slips to the prior month there but not under UTC.
  const label = 'tz-boundary-a2'
  const base = baseHousehold(label, { currency: 'usd' })
  const s = base.scenario
  const rows: Array<{ date: string; cat: TransactionCategory; amount: number; intent: TxIntent[] }> = [
    { date: nonNoonUtc(2027, 2, 1, 0, 15), cat: 'groceries', amount: 50000, intent: ['month-boundary-first', 'non-noon-utc'] },
    { date: nonNoonUtc(2027, 3, 1, 0, 45), cat: 'dining', amount: 6400, intent: ['month-boundary-first', 'non-noon-utc'] },
    { date: nonNoonUtc(2027, 1, 31, 23, 30), cat: 'fuel', amount: 5200, intent: ['month-boundary-last', 'non-noon-utc'] },
  ]
  rows.forEach((row, i) => {
    s.transactions.push(
      buildTransaction({
        id: `${label}-tx-${i}`,
        householdId: base.hhId,
        merchant: MERCHANTS[row.cat] ? r.pick(MERCHANTS[row.cat]) : row.cat,
        category: row.cat,
        kind: 'expense',
        amountCents: row.amount,
        source: 'Everyday Card',
        date: row.date,
        createdBy: `${label}-u-0`,
        owners: [base.p0, base.p1],
        paidBy: base.p0,
        intent: row.intent,
      })
    )
  })
  s.timezoneNote = 'Boundary rows at non-noon UTC; reproduces A2 under TZ=America/New_York.'
  addDim(s, 'household-joint', 'split-even', 'currency-usd', 'tz-boundary-non-noon', 'month-boundary-first', 'month-boundary-last')
  return s
}

function budgetBands(r: Prng): HouseholdScenario {
  // Deterministic budget-band coverage (FR-004): one FIXED expense per category
  // in the current month against a fixed limit, so each of under/near/over is
  // realized by real spend regardless of the PRNG. insights.ts Rule 3 classifies
  // spent/limit as >=1.0 over, >=0.85 near, <=0.5 (once the month is >=70%
  // elapsed) under — see the realization guard in corpus.test.ts.
  const base = baseHousehold('budget-bands', { currency: 'usd' })
  const s = base.scenario
  const cur = addMonths(EPOCH.year, EPOCH.month, 0)
  const bands: Array<{ cat: TransactionCategory; spend: number; limit: number }> = [
    { cat: 'groceries', spend: 30000, limit: 100000 }, // 0.30 → under
    { cat: 'dining', spend: 8700, limit: 10000 }, //      0.87 → near
    { cat: 'fuel', spend: 12000, limit: 10000 }, //       1.20 → over
  ]
  bands.forEach((b, i) => {
    s.transactions.push(
      buildTransaction({
        id: `budget-bands-tx-${i}`,
        householdId: base.hhId,
        merchant: MERCHANTS[b.cat] ? r.pick(MERCHANTS[b.cat]) : b.cat,
        category: b.cat,
        kind: 'expense',
        amountCents: b.spend,
        source: 'Everyday Card',
        date: isoAt(cur.year, cur.month1, 6, 12, 0),
        createdBy: 'budget-bands-u-0',
        owners: [base.p0, base.p1],
        paidBy: base.p0,
        intent: [],
      })
    )
    s.budgets.push(buildBudget(`budget-bands-b-${b.cat}`, base.hhId, b.cat, b.limit))
  })
  addDim(s, 'household-joint', 'split-even', 'currency-usd', 'budget-under', 'budget-near', 'budget-over')
  return s
}

function subscriptionCreep(r: Prng): HouseholdScenario {
  // 8–15 subscriptions/household, ~40% forgotten (research). A dense recurring set.
  const base = baseHousehold('subscription-creep', { currency: 'usd' })
  const s = base.scenario
  const subs = ['Netflix', 'Spotify', 'Disney+', 'iCloud', 'The Times', 'Hulu', 'Adobe', 'Gym', 'Patreon', 'Dropbox']
  const cur = addMonths(EPOCH.year, EPOCH.month, 0)
  subs.forEach((name, i) => {
    s.transactions.push(
      buildTransaction({
        id: `${base.label}-sub-${i}`,
        householdId: base.hhId,
        merchant: name,
        category: 'subs',
        kind: 'expense',
        amountCents: r.pick([599, 999, 1099, 1299, 1599, 1999]),
        source: 'Everyday Card',
        date: isoAt(cur.year, cur.month1, (i % 26) + 1, 12, 0),
        createdBy: `${base.label}-u-0`,
        owners: r.bool(0.5) ? [base.p0, base.p1] : [base.p0],
        paidBy: base.p0,
        intent: ['subscription', 'recurring-merchant'],
      })
    )
  })
  s.budgets.push(buildBudget(`${base.label}-b-subs`, base.hhId, 'subs', 6000)) // over-budget by design
  addDim(s, 'household-joint', 'split-even', 'currency-usd', 'recurring-merchant', 'month-dense', 'budget-over')
  return s
}

function specialScenarios(root: Prng): HouseholdScenario[] {
  return [
    jointEvenUsd(root.sub('joint-even-usd')),
    separateEur(root.sub('separate-eur')),
    percentValueUsd(root.sub('percent-value-usd')),
    currencyLens('usd', root.sub('currency-usd')),
    currencyLens('eur', root.sub('currency-eur')),
    currencyLens('jpy', root.sub('currency-jpy')),
    currencyLens('bdt', root.sub('currency-bdt')),
    febBoundaries(root.sub('feb-boundaries')),
    refunds(root.sub('refunds')),
    housing(root.sub('housing')),
    mortgagePaidOff(root.sub('mortgage-paid-off')),
    multifamily(root.sub('multifamily')),
    orderMismatchA4(root.sub('order-mismatch')),
    tzBoundaryA2(root.sub('tz-boundary')),
    budgetBands(root.sub('budget-bands')),
    subscriptionCreep(root.sub('subscription-creep')),
  ]
}

// ---------------------------------------------------------------------------
// Parameterized family — volume with variety (coverage over volume).
// ---------------------------------------------------------------------------

const FAMILY_CURRENCIES: CurrencyKey[] = ['usd', 'eur', 'jpy', 'bdt']
const FAMILY_SPLITS: Array<'even' | 'percent' | 'value'> = ['even', 'percent', 'value']
const FAMILY_DENSITY: Array<'sparse' | 'normal' | 'dense'> = ['sparse', 'normal', 'dense']

function familyScenario(
  currency: CurrencyKey,
  split: 'even' | 'percent' | 'value',
  density: 'sparse' | 'normal' | 'dense',
  separate: boolean,
  variant: number,
  r: Prng
): HouseholdScenario {
  const label = `fam-${currency}-${split}-${density}-${separate ? 'sep' : 'joint'}-${variant}`
  const base = baseHousehold(label, { currency, separate })
  const s = base.scenario
  const monthsBack = density === 'sparse' ? 2 : density === 'normal' ? 4 : 6
  const catsPerMonth =
    density === 'sparse' ? 2 : density === 'normal' ? 4 : EXPENSE_CATEGORIES.length
  let idx = 0
  for (let m = 0; m < monthsBack; m++) {
    const { year, month1 } = addMonths(EPOCH.year, EPOCH.month - (monthsBack - 1) + m, 0)
    const cats = EXPENSE_CATEGORIES.slice(0, catsPerMonth)
    cats.forEach((cat, i) => {
      const amount = amountFor(cat, r)
      const owners = base.separate ? [r.bool() ? base.p0 : base.p1] : [base.p0, base.p1]
      let splitInput: TxSpec['split']
      if (owners.length === 2 && split === 'percent') splitInput = { method: 'percent', percents: { [base.p0]: 60, [base.p1]: 40 } }
      else if (owners.length === 2 && split === 'value') {
        const a = Math.floor(amount / 3)
        splitInput = { method: 'value', values: { [base.p0]: a, [base.p1]: amount - a } }
      } else splitInput = { method: 'even' }
      s.transactions.push(
        buildTransaction({
          id: `${label}-tx-${idx++}`,
          householdId: base.hhId,
          merchant: MERCHANTS[cat] ? r.pick(MERCHANTS[cat]) : cat,
          category: cat,
          kind: 'expense',
          amountCents: amount,
          source: r.pick(['Joint Checking', 'Everyday Card']),
          date: isoAt(year, month1, r.range(2, 26), 12, 0),
          createdBy: `${label}-u-0`,
          owners,
          split: splitInput,
          paidBy: owners.length === 2 ? (r.bool() ? base.p0 : base.p1) : owners[0],
          intent: density === 'sparse' ? ['sparse'] : density === 'dense' ? ['dense'] : [],
        })
      )
    })
  }
  // A grocery budget placed to land in one of the three bands by variant.
  const limit = variant % 3 === 0 ? 30000 : variant % 3 === 1 ? 60000 : 120000
  s.budgets.push(buildBudget(`${label}-b-groceries`, base.hhId, 'groceries', limit))

  addDim(s, separate ? 'household-separate' : 'household-joint')
  if (density === 'sparse') addDim(s, 'month-sparse')
  if (density === 'dense') addDim(s, 'month-dense')
  const cdim = CURRENCY_DIM[currency]
  if (cdim) addDim(s, cdim)
  // Derive the split dimension from what the transactions ACTUALLY realize — a
  // separate/1-owner household always collapses to `even` regardless of the
  // requested method — so the coverage tag can never drift from the rows.
  const methods = new Set(s.transactions.map((t) => t.splitMethod))
  if (methods.has('even')) addDim(s, 'split-even')
  if (methods.has('percent')) addDim(s, 'split-percent')
  if (methods.has('value')) addDim(s, 'split-value')
  return s
}

function parameterizedFamily(root: Prng): HouseholdScenario[] {
  const out: HouseholdScenario[] = []
  for (const currency of FAMILY_CURRENCIES) {
    for (const split of FAMILY_SPLITS) {
      for (const density of FAMILY_DENSITY) {
        for (const separate of [false, true]) {
          for (let variant = 0; variant < 3; variant++) {
            const label = `fam-${currency}-${split}-${density}-${separate ? 'sep' : 'joint'}-${variant}`
            out.push(familyScenario(currency, split, density, separate, variant, root.sub(label)))
          }
        }
      }
    }
  }
  return out
}

/** All scenarios: specials (guarantee coverage) + the parameterized family. */
export function buildAllScenarios(seed: number): HouseholdScenario[] {
  const r = mulberry32(seed)
  const specials = specialScenarios(r.sub('specials'))
  const family = parameterizedFamily(r.sub('family'))
  return [...specials, ...family]
}
