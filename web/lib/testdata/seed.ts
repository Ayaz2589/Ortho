/**
 * The in-memory sample dataset for the "Use test data" flag (spec 015, 030).
 *
 * spec 030 removed the old hand-typed 16-row transaction array (the "dummy data
 * I input by hand") in favor of a small deterministic GENERATOR: a recurring
 * monthly basket over several months, plus goals, tags, and a linked bank — so
 * the offline in-memory mode populates every screen (Goals, Tags/Notes,
 * Linked-banks), not just the ledger. It mirrors the design of the real-DB demo
 * household (web/test/corpus/realism.ts) but is a SEPARATE, self-contained
 * module: it ships in the app bundle (behind isTestBuild()), so — unlike the
 * corpus — it must not import test/corpus and imports nothing from vitest. It
 * reuses only `lib/splits` (already bundle-safe). Its rows live purely in memory
 * and are never written to the live backend.
 *
 * The PRIMARY local/stage path is now auto-login against a REAL seeded backend
 * (spec 030); this in-memory mode is the zero-backend fallback.
 */
import { computeShares } from '@/lib/splits'
import type { TransactionCategory, TransactionKind } from '@/lib/types'

const HH = 'testdata-hh'
const U_ME = 'testdata-user-ava'
const U_PARTNER = 'testdata-user-ben'
const P_ME = 'testdata-person-ava'
const P_PARTNER = 'testdata-person-ben'

/** Auth user the seeded client reports — matches the account-holder person. */
export const SEED_AUTH_USER = { id: U_ME, email: 'tester@ortho.test' }

const DAY = 24 * 60 * 60 * 1000
// Anchor to a fixed clock-independent base so the span is deterministic; the
// multi-month spread guarantees ≥3 distinct months for the range/month pickers.
const BASE = Date.UTC(2026, 5, 15, 12, 0, 0) // 2026-06-15T12:00:00Z
const iso = (daysAgo: number): string => new Date(BASE - daysAgo * DAY).toISOString()
const ymd = (daysAgo: number): string => iso(daysAgo).slice(0, 10)

interface BasketItem {
  merchant: string
  category: TransactionCategory
  cents: number
  /** day within the month (added to the month's base daysAgo). */
  offset: number
  joint: boolean
  /** overrides for a single-owner item */
  owner?: string
  payer?: string
  tags?: string[]
  notes?: string | null
}

const T_REIMB = 'testdata-tag-reimbursable'
const T_VACATION = 'testdata-tag-vacation'

// One recurring basket, replayed across three months. Whole Foods anchors the
// grocery category (asserted by test-data-isolation.test.tsx).
const BASKET: BasketItem[] = [
  { merchant: 'Whole Foods', category: 'groceries', cents: 8215, offset: 2, joint: true, tags: [T_REIMB], notes: 'Split with the Nguyens' },
  { merchant: 'Blue Bottle Coffee', category: 'coffee', cents: 640, offset: 4, joint: false, owner: P_ME, payer: P_ME },
  { merchant: 'Shell', category: 'fuel', cents: 5230, offset: 6, joint: false, owner: P_PARTNER, payer: P_PARTNER },
  { merchant: 'Tartine', category: 'dining', cents: 6480, offset: 9, joint: true },
  { merchant: 'Con Edison', category: 'utilities', cents: 14320, offset: 12, joint: true },
  { merchant: 'Netflix', category: 'subs', cents: 1599, offset: 15, joint: true },
  { merchant: 'MTA', category: 'transit', cents: 3300, offset: 18, joint: false, owner: P_ME, payer: P_ME },
]

interface BuiltRow {
  tx: Record<string, unknown>
  shares: Array<Record<string, unknown>>
  tagIds: string[]
}

function buildTx(
  id: string,
  merchant: string,
  category: TransactionCategory,
  kind: TransactionKind,
  cents: number,
  source: string,
  daysAgo: number,
  owners: string[],
  paidBy: string | null,
  tags: string[] = [],
  notes: string | null = null
): BuiltRow {
  const date = iso(daysAgo)
  const shareMap = computeShares(cents, owners, { method: 'even' })
  return {
    tx: {
      id, household_id: HH, merchant, category, kind, amount_cents: cents, source, date,
      created_by: U_ME, created_at: date, updated_at: date, paid_by: paidBy, notes,
    },
    shares: owners.map((pid) => ({ transaction_id: id, person_id: pid, amount_cents: shareMap[pid] ?? 0 })),
    tagIds: tags,
  }
}

/** Build the full table map + auth user the in-memory client serves. */
export function buildSeedTables(): { authUser: typeof SEED_AUTH_USER; tables: Record<string, unknown[]> } {
  const users = [
    { id: U_ME, name: 'Ava', initial: 'A', color_key: 'sage', created_at: iso(200) },
    { id: U_PARTNER, name: 'Ben', initial: 'B', color_key: 'slate', created_at: iso(200) },
  ]
  const household_people = [
    { id: P_ME, household_id: HH, name: 'Ava', initial: 'A', color_key: 'sage', linked_user_id: U_ME, sort_order: 0, removed_at: null, created_at: iso(200) },
    { id: P_PARTNER, household_id: HH, name: 'Ben', initial: 'B', color_key: 'slate', linked_user_id: U_PARTNER, sort_order: 1, removed_at: null, created_at: iso(200) },
  ]
  const household_members = [
    { household_id: HH, user_id: U_ME, role: 'owner', created_at: iso(200) },
    { household_id: HH, user_id: U_PARTNER, role: 'member', created_at: iso(200) },
  ]
  const households = [{ id: HH, owner_id: U_ME, name: 'Test Household', created_at: iso(200) }]

  // Replay the basket over three months; front joint expenses by one person so
  // member balances are non-zero.
  const transactions: unknown[] = []
  const transaction_shares: unknown[] = []
  const transaction_tags: unknown[] = []
  let n = 0
  for (const monthBase of [0, 30, 60]) {
    for (const item of BASKET) {
      const owners = item.joint ? [P_ME, P_PARTNER] : [item.owner ?? P_ME]
      const payer = item.payer ?? owners[0]
      const built = buildTx(
        `td-${n++}`, item.merchant, item.category, 'expense', item.cents,
        item.category === 'subs' || item.category === 'coffee' ? 'Everyday Card' : 'Joint Checking',
        monthBase + item.offset, owners, payer,
        // Only tag the most recent month so the ledger isn't uniformly tagged.
        monthBase === 0 ? item.tags ?? [] : [], monthBase === 0 ? item.notes ?? null : null
      )
      transactions.push(built.tx)
      transaction_shares.push(...built.shares)
      for (const tagId of built.tagIds) transaction_tags.push({ transaction_id: built.tx.id, tag_id: tagId })
    }
    // Monthly income + a partial settle-up so balances stay non-zero.
    const income = buildTx(`td-income-${monthBase}`, 'Acme Payroll', 'salary', 'income', 520000, 'Joint Checking', monthBase + 1, [P_ME], null)
    transactions.push(income.tx)
    transaction_shares.push(...income.shares)
  }
  const settle = buildTx('td-settle', 'Settle up', 'transfer', 'transfer', 40000, 'Joint Checking', 22, [P_ME], P_PARTNER)
  transactions.push(settle.tx)
  transaction_shares.push(...settle.shares)
  // A vacation flight this month, tagged + noted.
  const flight = buildTx('td-flight', 'Delta Air Lines', 'transit', 'expense', 48600, 'Everyday Card', 5, [P_ME, P_PARTNER], P_ME, [T_VACATION, T_REIMB], 'Flights for the spring trip')
  transactions.push(flight.tx)
  transaction_shares.push(...flight.shares)
  for (const tagId of flight.tagIds) transaction_tags.push({ transaction_id: flight.tx.id, tag_id: tagId })

  const tags = [
    { id: T_REIMB, household_id: HH, name: 'Reimbursable', created_at: iso(200) },
    { id: T_VACATION, household_id: HH, name: 'Vacation', created_at: iso(200) },
  ]

  const cards = [
    { id: 'testdata-card-1', household_id: HH, name: 'Everyday Card', created_at: iso(200) },
    { id: 'testdata-card-2', household_id: HH, name: 'Joint Checking', created_at: iso(200) },
  ]

  const properties = [
    { id: 'testdata-prop-home', household_id: HH, kind: 'primary_home', address: '124 Oak Lane', nickname: 'Home', created_at: iso(200), updated_at: iso(200) },
    { id: 'testdata-prop-rental', household_id: HH, kind: 'rental', address: '88 Birch Street', nickname: 'Birch rental', created_at: iso(200), updated_at: iso(200) },
  ]
  const mortgage_info = [
    { property_id: 'testdata-prop-home', purchase_price_cents: 62000000, original_loan_cents: 49600000, annual_interest_rate_percent: 6.25, loan_term_years: 30, closing_date: iso(900), auto_pay_source: 'Joint Checking' },
  ]
  const lease_info = [
    { property_id: 'testdata-prop-rental', monthly_rent_cents: 285000, lease_start: iso(180), lease_end: iso(-185), security_deposit_cents: 285000, paid_with_source: 'Joint Checking' },
  ]
  const units: unknown[] = []
  const rental_payments = [
    { id: 'testdata-rp-1', property_id: 'testdata-prop-rental', amount_cents: 285000, date: iso(6), note: null, created_at: iso(6) },
    { id: 'testdata-rp-2', property_id: 'testdata-prop-rental', amount_cents: 285000, date: iso(37), note: 'On time', created_at: iso(37) },
  ]

  const budgets = [
    // groceries is a Flex bucket (spec 027) so test-data mode exercises rollover;
    // dining stays Fixed. created_at anchors carry accrual a few months back.
    { id: 'testdata-budget-groceries', household_id: HH, category: 'groceries', monthly_limit_cents: 60000, budget_type: 'flex', rollover_cap_cents: null, created_at: iso(120) },
    { id: 'testdata-budget-dining', household_id: HH, category: 'dining', monthly_limit_cents: 25000, budget_type: 'fixed', rollover_cap_cents: null, created_at: iso(120) },
  ]

  // spec 030 — populate Goals and Linked-banks screens in test-data mode too.
  const linked_institutions = [
    { id: 'testdata-inst', household_id: HH, provider: 'simplefin', provider_item_id: 'td-sf-item', provider_institution_id: null, institution_name: 'Community Credit Union', status: 'active', created_by: U_ME, created_at: iso(150), updated_at: iso(2), disconnected_at: null, last_synced_at: iso(1), last_manual_refresh_at: null, sync_cursor: 'td-cursor' },
  ]
  const linked_accounts = [
    { id: 'testdata-acct-checking', institution_id: 'testdata-inst', provider_account_id: 'td-acc-1', name: 'Everyday Checking', official_name: null, mask: '1188', account_type: 'depository', account_subtype: 'checking', currency: 'USD', created_at: iso(150) },
    { id: 'testdata-acct-savings', institution_id: 'testdata-inst', provider_account_id: 'td-acc-2', name: 'Savings', official_name: null, mask: '4821', account_type: 'depository', account_subtype: 'savings', currency: 'USD', created_at: iso(150) },
  ]
  const goals = [
    { id: 'testdata-goal-emergency', household_id: HH, name: 'Emergency fund', kind: 'savings', target_cents: 600000, target_date: ymd(-180), linked_account_id: null, linked_category: null, created_by: U_ME, created_at: iso(180), updated_at: iso(2) },
    { id: 'testdata-goal-card', household_id: HH, name: 'Pay off the card', kind: 'debt_payoff', target_cents: 300000, target_date: ymd(-120), linked_account_id: 'testdata-acct-checking', linked_category: null, created_by: U_ME, created_at: iso(180), updated_at: iso(2) },
  ]
  const goal_contributions = [
    { id: 'testdata-gc-1', goal_id: 'testdata-goal-emergency', amount_cents: 150000, date: ymd(120), note: null, created_by: U_ME, created_at: iso(120) },
    { id: 'testdata-gc-2', goal_id: 'testdata-goal-emergency', amount_cents: 120000, date: ymd(30), note: null, created_by: U_ME, created_at: iso(30) },
    { id: 'testdata-gc-3', goal_id: 'testdata-goal-card', amount_cents: 90000, date: ymd(60), note: null, created_by: U_ME, created_at: iso(60) },
  ]

  return {
    authUser: SEED_AUTH_USER,
    tables: {
      users,
      household_people,
      household_members,
      households,
      transactions,
      transaction_shares,
      transaction_tags,
      tags,
      cards,
      properties,
      mortgage_info,
      lease_info,
      units,
      rental_payments,
      budgets,
      linked_institutions,
      linked_accounts,
      goals,
      goal_contributions,
    },
  }
}
