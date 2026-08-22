// @vitest-environment jsdom
//
// spec 056 US1 — the widget board follows the dashboard's member picker.
//
// Before this, picking a person re-scoped the net hero and nothing else, so a
// personal net figure sat on top of a board reporting everyone's money, with
// nothing on screen distinguishing the two subjects. Each body below now reads
// the ledger through `useScopedTransactions`, so its figures are the selected
// person's stored share.
//
// Two things this suite is deliberately careful about:
//
//  1. It re-proves the household no-op locally (`renders identically to no
//     provider at all`). The primary proof is the twenty PRE-EXISTING suites in
//     this directory that were left untouched — but those only prove it while
//     nobody edits them, so the property is also asserted here where a reader
//     can see it.
//  2. It pins the two EXCLUDED widgets (financial-health, goals) as unchanged
//     under person scope. They are the two most likely to be scoped by accident,
//     and they ship in their own PR.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import type { ReactElement } from 'react'
import type { Budget, Transaction } from '@/lib/types'
import { HOUSEHOLD_SCOPE, personScope, type MoneyScope } from '@/lib/scope/moneyScope'
import { MoneyScopeProvider } from '@/lib/widgets/MoneyScopeContext'

const ALICE = 'p1'
const BOB = 'p2'

// ── The window ───────────────────────────────────────────────────────────────
// August 2026, with `now` mid-month so the trailing-30 pace window lands on the
// fixture dates. July exists too, but OUTSIDE the interval — it is reachable only
// through SavingsTrendsBody's separate previous-month read, which is exactly the
// second code path that must also be scoped.
const NOW = new Date(2026, 7, 20, 12)
const AUG = { start: new Date(2026, 7, 1), end: new Date(2026, 8, 1) }
const AUG_DAY = '2026-08-10T12:00:00.000Z'
const JUL_DAY = '2026-07-10T12:00:00.000Z'

const h = vi.hoisted(() => ({
  txns: [] as unknown[],
  budgets: [] as unknown[],
}))

vi.mock('@/lib/store', () => ({
  useApp: () => ({
    t: (k: string, ...a: unknown[]) => k.replace(/\{(\d+)\}/g, (_, i) => String(a[Number(i)] ?? '')),
    locale: 'en-US',
    formatMoney: (c: number) => `$${c}`,
    transactions: h.txns,
    budgets: h.budgets,
    goals: [{ id: 'g1', name: 'Emergency fund', kind: 'savings', target_cents: 100000, target_date: null, created_at: AUG_DAY }],
    goalContributions: [{ id: 'c1', goal_id: 'g1', amount_cents: 60000, date: AUG_DAY }],
    // spec 041/052 — the health widget scopes to the SIGNED-IN person, never to the
    // viewer's board selection. Keeping a real profile here makes the exclusion test
    // compare two real scores rather than two empty states.
    userFinancialProfile: {
      id: 'p', user_id: ALICE, monthly_income_cents: 300000, income_is_variable: false,
      income_low_estimate_cents: null, housing_type: 'rent', housing_cost_cents: 100000,
      housing_share_fraction: 1, savings_target_fraction: 0.1, emergency_fund_level: '1_3m',
      created_at: AUG_DAY, updated_at: AUG_DAY,
    },
    userFixedCosts: [],
    userDimensionWeights: [],
    healthSnapshots: [],
    routines: [],
    currentPersonId: ALICE,
    ownersDisplay: (tx: Transaction) => ({
      avatarUser: {},
      label: tx.owner_ids.map((id) => (id === ALICE ? 'Alice' : 'Bob')).join(' & '),
      count: tx.owner_ids.length,
    }),
    householdMembers: [
      { id: ALICE, name: 'Alice', initial: 'A', color_key: 'sage', created_at: AUG_DAY },
      { id: BOB, name: 'Bob', initial: 'B', color_key: 'slate', created_at: AUG_DAY },
    ],
    resolveUser: (id: string) => ({ id, name: id === ALICE ? 'Alice' : 'Bob' }),
  }),
}))

const scopeCtx = vi.hoisted(() => ({ value: {} as Record<string, unknown> }))
vi.mock('@/lib/widgets/DashboardScopeContext', () => ({
  useDashboardScopeContext: () => scopeCtx.value,
}))

import { SpendingPaceBody } from '@/components/widgets/bodies/SpendingPaceBody'
import { TopMerchantsBody } from '@/components/widgets/bodies/TopMerchantsBody'
import { SavingsTrendsBody } from '@/components/widgets/bodies/SavingsTrendsBody'
import { ActivityBody } from '@/components/widgets/bodies/ActivityBody'
import { BudgetsBody } from '@/components/widgets/bodies/BudgetsBody'
import { FinancialHealthBody } from '@/components/widgets/bodies/FinancialHealthBody'
import { GoalsBody } from '@/components/widgets/bodies/GoalsBody'

function tx(over: Partial<Transaction>): Transaction {
  return {
    id: 'x', household_id: 'hh', merchant: 'Costco', category: 'groceries', kind: 'expense',
    amount_cents: 0, source: '', date: AUG_DAY, created_by: 'u',
    created_at: AUG_DAY, updated_at: AUG_DAY, owner_ids: [], shares: {}, notes: null,
    ...over,
  } as Transaction
}

function budget(over: Partial<Budget>): Budget {
  return {
    id: 'b', household_id: 'hh', category: 'groceries', monthly_limit_cents: 0,
    budget_type: 'fixed', rollover_cap_cents: null, person_id: null,
    created_at: '2026-08-01T00:00:00.000Z',
    ...over,
  } as Budget
}

// ── The fixture ──────────────────────────────────────────────────────────────
// August expenses total $900, splitting $360 to Alice and $540 to Bob:
//   Costco   $300 shared 50/50   → Alice $150, Bob $150
//   Bistro   $300 split 70/30    → Alice $210, Bob  $90   (an UNEVEN split, so a
//                                                          recomputed even split
//                                                          would be visibly wrong)
//   Cafe     $300 Bob alone      → Alice   $0, Bob $300
// August income $900 splits $600 / $300. A $50 transfer runs Bob → Alice.
const AUGUST: Transaction[] = [
  tx({ id: 'costco', merchant: 'Costco', category: 'groceries', amount_cents: 30000, paid_by: ALICE, owner_ids: [ALICE, BOB], shares: { [ALICE]: 15000, [BOB]: 15000 } }),
  tx({ id: 'bistro', merchant: 'Bistro', category: 'dining', amount_cents: 30000, paid_by: ALICE, owner_ids: [ALICE, BOB], shares: { [ALICE]: 21000, [BOB]: 9000 } }),
  tx({ id: 'cafe', merchant: 'Cafe', category: 'coffee', amount_cents: 30000, paid_by: BOB, owner_ids: [BOB], shares: { [BOB]: 30000 } }),
  tx({ id: 'pay', merchant: 'Employer', category: 'salary', kind: 'income', amount_cents: 90000, owner_ids: [ALICE, BOB], shares: { [ALICE]: 60000, [BOB]: 30000 } }),
  tx({ id: 'settle', merchant: 'Settle up', category: 'transfer', kind: 'transfer', amount_cents: 5000, paid_by: BOB, owner_ids: [ALICE], shares: { [ALICE]: 5000 } }),
]

// July: income Alice alone $1000, one shared $500 expense. Outside the August
// interval, so ONLY the previous-month comparison can see it.
const JULY: Transaction[] = [
  tx({ id: 'jul-pay', date: JUL_DAY, merchant: 'Employer', category: 'salary', kind: 'income', amount_cents: 100000, owner_ids: [ALICE], shares: { [ALICE]: 100000 } }),
  tx({ id: 'jul-shop', date: JUL_DAY, merchant: 'Costco', amount_cents: 50000, paid_by: ALICE, owner_ids: [ALICE, BOB], shares: { [ALICE]: 25000, [BOB]: 25000 } }),
]

const at = (scope: MoneyScope, node: ReactElement) =>
  render(<MoneyScopeProvider scope={scope}>{node}</MoneyScopeProvider>)

beforeEach(() => {
  h.txns = [...AUGUST, ...JULY]
  h.budgets = []
  scopeCtx.value = {
    interval: AUG,
    now: NOW,
    referenceDate: new Date(2026, 7, 15, 12),
    isSpecificMonth: false,
    selectedMonth: null,
    availableMonths: ['2026-07', '2026-08'],
    periodLabel: 'August',
  }
})
afterEach(cleanup)

// ─────────────────────────────────────────────────────────────────────────────
// C-1 / C-2 — household scope is the identity
// ─────────────────────────────────────────────────────────────────────────────

describe('household scope changes nothing', () => {
  const BODIES: Array<[string, ReactElement]> = [
    ['SpendingPaceBody', <SpendingPaceBody key="a" />],
    ['TopMerchantsBody', <TopMerchantsBody key="b" />],
    ['SavingsTrendsBody', <SavingsTrendsBody key="c" />],
    ['ActivityBody', <ActivityBody key="d" />],
    ['BudgetsBody', <BudgetsBody key="e" />],
  ]

  it.each(BODIES)('%s renders identically with no provider and with HOUSEHOLD_SCOPE', (_name, node) => {
    h.budgets = [budget({ id: 'b1', monthly_limit_cents: 50000 })]

    const bare = render(node).container.innerHTML
    cleanup()
    const household = at(HOUSEHOLD_SCOPE, node).container.innerHTML

    expect(household).toBe(bare)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// FR-006 — spending pace
// ─────────────────────────────────────────────────────────────────────────────

describe('SpendingPaceBody', () => {
  // $900 household / 30 days = $30/day. Alice $360 → $12/day. Bob $540 → $18/day.
  it('averages the household spend over the window', () => {
    at(HOUSEHOLD_SCOPE, <SpendingPaceBody />)
    expect(screen.getByText('$3000')).toBeTruthy()
  })

  it("averages only the person's share", () => {
    at(personScope(ALICE), <SpendingPaceBody />)
    expect(screen.getByText('$1200')).toBeTruthy()
    expect(screen.queryByText('$3000')).toBeNull()
  })

  it('uses the STORED uneven share, not a recomputed even split', () => {
    // Bob's $540 is 150 + 90 + 300. An even-split recomputation would give him
    // 150 + 150 + 300 = $600 ($20/day), so this distinguishes the two.
    at(personScope(BOB), <SpendingPaceBody />)
    expect(screen.getByText('$1800')).toBeTruthy()
  })

  it('shows the calm empty state for a person with no expenses', () => {
    h.txns = [AUGUST[2]] // Cafe — Bob's alone
    at(personScope(ALICE), <SpendingPaceBody />)
    expect(screen.getByText('No expenses in the last 30 days.')).toBeTruthy()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// FR-007 — top merchants
// ─────────────────────────────────────────────────────────────────────────────

describe('TopMerchantsBody', () => {
  it('ranks every household merchant', () => {
    at(HOUSEHOLD_SCOPE, <TopMerchantsBody />)
    expect(screen.getByText('Costco')).toBeTruthy()
    expect(screen.getByText('Bistro')).toBeTruthy()
    expect(screen.getByText('Cafe')).toBeTruthy()
  })

  it('drops merchants the person never transacted at', () => {
    at(personScope(ALICE), <TopMerchantsBody />)
    expect(screen.queryByText('Cafe')).toBeNull()
  })

  it("ranks by the person's own spend", () => {
    // Household order is Costco/Bistro/Cafe (tied, insertion order). For Alice,
    // Bistro ($210) outranks Costco ($150) — the ordering itself is re-derived.
    at(personScope(ALICE), <TopMerchantsBody />)
    const names = screen.getAllByText(/Costco|Bistro/).map((n) => n.textContent)
    expect(names).toEqual(['Bistro', 'Costco'])
    expect(screen.getByText('$21000')).toBeTruthy()
    expect(screen.getByText('$15000')).toBeTruthy()
  })

  it('counts only visits the person was party to', () => {
    at(personScope(BOB), <TopMerchantsBody />)
    // Three merchants, one visit each — Bob shares all three.
    expect(screen.getAllByText('1 visit')).toHaveLength(3)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// FR-008 — savings trends (BOTH read paths)
// ─────────────────────────────────────────────────────────────────────────────

describe('SavingsTrendsBody', () => {
  it('reports the household savings rate', () => {
    // income $900, expenses $900 → 0%
    at(HOUSEHOLD_SCOPE, <SavingsTrendsBody />)
    expect(screen.getByText('0%')).toBeTruthy()
  })

  it("reports the person's savings rate", () => {
    // Alice: income $600, expenses $360 → 40%
    at(personScope(ALICE), <SavingsTrendsBody />)
    expect(screen.getByText('40%')).toBeTruthy()
  })

  it('shows a shortfall by sign, never by colour', () => {
    // Bob: income $300, expenses $540 → −80%
    at(personScope(BOB), <SavingsTrendsBody />)
    expect(screen.getByText('−80%')).toBeTruthy()
  })

  it('scopes the PREVIOUS-MONTH comparison too', () => {
    // This is the assertion that matters most in this block. `monthTotals` is a
    // SECOND, separate read of `transactions`; if it were missed, the headline
    // would be personal while the comparison beside it stayed household-wide —
    // the exact mixed-subject defect this feature exists to remove.
    scopeCtx.value = { ...scopeCtx.value, isSpecificMonth: true, selectedMonth: '2026-08' }

    at(HOUSEHOLD_SCOPE, <SavingsTrendsBody />)
    // July household: income $1000, expenses $500 → 50%
    expect(screen.getByTestId('savings-comparison').textContent).toContain('50%')
    cleanup()

    at(personScope(ALICE), <SavingsTrendsBody />)
    // July Alice: income $1000, expenses $250 → 75%
    expect(screen.getByTestId('savings-comparison').textContent).toContain('75%')
  })

  it('says "no comparison" when the PERSON has no prior month, though the household does', () => {
    // `availableMonths` is the TIME axis's, and the time axis reads the whole
    // household ledger — so under person scope a month can be listed while this
    // person has nothing in it. Without a guard, savingsRate(0, 0) is null and the
    // row reads "Last month —", which looks like a measurement that failed rather
    // than an absent one.
    scopeCtx.value = { ...scopeCtx.value, isSpecificMonth: true, selectedMonth: '2026-08' }
    h.txns = [
      ...AUGUST,
      // July belongs to Alice alone, so July is listed but Bob has nothing in it.
      tx({ id: 'jul-solo-pay', date: JUL_DAY, merchant: 'Employer', category: 'salary', kind: 'income', amount_cents: 100000, owner_ids: [ALICE], shares: { [ALICE]: 100000 } }),
    ]

    at(personScope(BOB), <SavingsTrendsBody />)
    expect(screen.getByTestId('savings-comparison').textContent).toBe('No comparison yet')
    expect(screen.getByTestId('savings-comparison').textContent).not.toContain('—')
    cleanup()

    // The household DOES have a July, and still reports it.
    at(HOUSEHOLD_SCOPE, <SavingsTrendsBody />)
    expect(screen.getByTestId('savings-comparison').textContent).toContain('100%')
  })

  it('shows the calm empty state for a person with no activity in the window', () => {
    h.txns = [AUGUST[2]] // Cafe — Bob's alone
    at(personScope(ALICE), <SavingsTrendsBody />)
    expect(screen.getByText('Not enough data yet.')).toBeTruthy()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// FR-009 — activity
// ─────────────────────────────────────────────────────────────────────────────

describe('ActivityBody', () => {
  it('lists the household feed at full amounts', () => {
    at(HOUSEHOLD_SCOPE, <ActivityBody />)
    expect(screen.getByText('Cafe')).toBeTruthy()
    expect(screen.getAllByText('$30000')).toHaveLength(3)
  })

  it("lists only rows the person is party to, at their share", () => {
    at(personScope(ALICE), <ActivityBody />)
    expect(screen.queryByText('Cafe')).toBeNull()
    expect(screen.getByText('$15000')).toBeTruthy() // Costco share
    expect(screen.getByText('$21000')).toBeTruthy() // Bistro share
  })

  it('shows the person as the owner of their projected rows', () => {
    // A consequence of projection setting owner_ids to [personId] — worth pinning
    // so the owner line is never read as "this was a solo purchase".
    at(personScope(ALICE), <ActivityBody />)
    expect(screen.getAllByText('Alice').length).toBeGreaterThan(0)
    expect(screen.queryByText('Alice & Bob')).toBeNull()
  })

  it('keeps ignoring the time window under person scope', () => {
    // spec 041 O-2: this widget is a live feed, deliberately unwindowed. The people
    // axis is independent of the time axis (C-4) and must not smuggle one in.
    h.txns = JULY // entirely outside the August interval
    at(personScope(ALICE), <ActivityBody />)
    expect(screen.getByText('Employer')).toBeTruthy()
  })

  it('shows the calm empty state for a person with no transactions', () => {
    h.txns = [AUGUST[2]] // Cafe — Bob's alone
    at(personScope(ALICE), <ActivityBody />)
    expect(screen.getByText('No transactions yet.')).toBeTruthy()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// FR-010 / FR-011 — budgets (BOTH halves)
// ─────────────────────────────────────────────────────────────────────────────

describe('BudgetsBody', () => {
  beforeEach(() => {
    h.budgets = [
      budget({ id: 'hh-groceries', category: 'groceries', monthly_limit_cents: 50000 }),
      budget({ id: 'alice-dining', category: 'dining', monthly_limit_cents: 20000, person_id: ALICE }),
    ]
  })

  it('shows only household limits against household spend', () => {
    at(HOUSEHOLD_SCOPE, <BudgetsBody />)
    // Groceries: $300 of $500. Alice's personal dining envelope must not appear.
    expect(screen.getByText(/\$30000/)).toBeTruthy()
    expect(screen.queryByText('Dining')).toBeNull()
  })

  it("shows the person's own limit against the person's own spend", () => {
    at(personScope(ALICE), <BudgetsBody />)
    // Alice's dining share is $210 against her $200 limit — both halves projected.
    expect(screen.getByText('Dining')).toBeTruthy()
    expect(screen.getByText(/\$21000/)).toBeTruthy()
    expect(screen.getByText('$1000 over')).toBeTruthy()
    // The household's grocery budget is not hers.
    expect(screen.queryByText('Groceries')).toBeNull()
  })

  it('NEVER falls back to a household limit for a person who set none', () => {
    // The single most important assertion here. Bob has no budgets; a household
    // allowance is sized for everyone, so measuring his share against it is the
    // spec-052 error class. "Not set" is the honest answer, not a borrowed number.
    at(personScope(BOB), <BudgetsBody />)
    expect(screen.getByText('No budgets yet.')).toBeTruthy()
    expect(screen.queryByText('Groceries')).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// FR-014 — the excluded widgets
// ─────────────────────────────────────────────────────────────────────────────

describe('excluded widgets are untouched by the people axis', () => {
  // financial-health and goals ship in their own PR. These are the two most
  // likely to be scoped by accident, so the exclusion is a CHECKED property
  // rather than an intention. Note the health widget already scopes internally
  // (spec 052) — but to the SIGNED-IN person, never the viewer's selection.
  it.each([
    ['FinancialHealthBody', <FinancialHealthBody key="a" />],
    ['GoalsBody', <GoalsBody key="b" />],
  ])('%s renders identically under household and person scope', (_name, node) => {
    const household = at(HOUSEHOLD_SCOPE, node).container.innerHTML
    cleanup()
    const person = at(personScope(BOB), node).container.innerHTML

    expect(person).toBe(household)
  })
})
