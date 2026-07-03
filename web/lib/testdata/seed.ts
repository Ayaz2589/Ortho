/**
 * The in-memory sample dataset for the "Use test data" flag (spec 015).
 *
 * Person-centric and CURRENT (owners are `household_people` ids, transactions
 * carry `paid_by`, there are budgets, a mortgaged home, a rental with payments,
 * and member-to-member reimbursement transfers) so every screen is populated
 * and member balances / settle-up are non-zero. It is the web counterpart of
 * the refreshed iOS `*.sample` factories.
 *
 * Shapes match `web/test/helpers/fixtures.ts` (which tracks `lib/types.ts`), but
 * this module ships in the app bundle, so — unlike the test helpers — it imports
 * nothing from vitest. It is only ever loaded behind `isTestBuild()`; its rows
 * live purely in memory and are never written to the live backend.
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

const iso = (daysAgo: number): string => {
  // Anchor to a fixed clock-independent base so the span is deterministic; the
  // 100-day spread guarantees ≥3 distinct months for the range/month pickers.
  const base = Date.UTC(2026, 5, 15, 12, 0, 0) // 2026-06-15T12:00:00Z
  return new Date(base - daysAgo * 24 * 60 * 60 * 1000).toISOString()
}

interface SeedTx {
  id: string
  merchant: string
  category: TransactionCategory
  kind: TransactionKind
  amount_cents: number
  source: string
  daysAgo: number
  owners: string[]
  /** who fronted the money (expense) or the sender (transfer) */
  paid_by: string
}

// ~16 rows across ~3 months. Joint rows fronted by one person create balances;
// two `transfer` rows are partial settle-ups so balances stay non-zero.
const TX: SeedTx[] = [
  { id: 'td-1', merchant: 'Blue Bottle Coffee', category: 'coffee', kind: 'expense', amount_cents: 640, source: 'Everyday Card', daysAgo: 2, owners: [P_ME], paid_by: P_ME },
  { id: 'td-2', merchant: 'Whole Foods', category: 'groceries', kind: 'expense', amount_cents: 8215, source: 'Joint Checking', daysAgo: 3, owners: [P_ME, P_PARTNER], paid_by: P_ME },
  { id: 'td-3', merchant: 'Rent — 124 Oak Lane', category: 'rent', kind: 'expense', amount_cents: 240000, source: 'Joint Checking', daysAgo: 5, owners: [P_ME, P_PARTNER], paid_by: P_PARTNER },
  { id: 'td-4', merchant: 'Shell', category: 'fuel', kind: 'expense', amount_cents: 5230, source: 'Everyday Card', daysAgo: 8, owners: [P_PARTNER], paid_by: P_PARTNER },
  { id: 'td-5', merchant: 'Tartine', category: 'dining', kind: 'expense', amount_cents: 9640, source: 'Everyday Card', daysAgo: 12, owners: [P_ME, P_PARTNER], paid_by: P_ME },
  { id: 'td-6', merchant: 'Con Edison', category: 'utilities', kind: 'expense', amount_cents: 14320, source: 'Joint Checking', daysAgo: 16, owners: [P_ME, P_PARTNER], paid_by: P_ME },
  { id: 'td-7', merchant: 'Acme Payroll', category: 'income', kind: 'income', amount_cents: 520000, source: 'Joint Checking', daysAgo: 20, owners: [P_ME], paid_by: P_ME },
  { id: 'td-8', merchant: 'Settle up', category: 'transfer', kind: 'transfer', amount_cents: 40000, source: 'Joint Checking', daysAgo: 22, owners: [P_ME], paid_by: P_PARTNER },
  { id: 'td-9', merchant: 'Netflix', category: 'subs', kind: 'expense', amount_cents: 1599, source: 'Everyday Card', daysAgo: 26, owners: [P_ME, P_PARTNER], paid_by: P_ME },
  { id: 'td-10', merchant: 'MTA', category: 'transit', kind: 'expense', amount_cents: 3300, source: 'Everyday Card', daysAgo: 34, owners: [P_ME], paid_by: P_ME },
  { id: 'td-11', merchant: 'Trader Joe’s', category: 'groceries', kind: 'expense', amount_cents: 6180, source: 'Joint Checking', daysAgo: 41, owners: [P_ME, P_PARTNER], paid_by: P_PARTNER },
  { id: 'td-12', merchant: 'CityMD', category: 'health', kind: 'expense', amount_cents: 4500, source: 'Everyday Card', daysAgo: 48, owners: [P_PARTNER], paid_by: P_PARTNER },
  { id: 'td-13', merchant: 'AMC Theatres', category: 'entertainment', kind: 'expense', amount_cents: 3800, source: 'Everyday Card', daysAgo: 55, owners: [P_ME, P_PARTNER], paid_by: P_ME },
  { id: 'td-14', merchant: 'Rent — 124 Oak Lane', category: 'rent', kind: 'expense', amount_cents: 240000, source: 'Joint Checking', daysAgo: 66, owners: [P_ME, P_PARTNER], paid_by: P_PARTNER },
  { id: 'td-15', merchant: 'Settle up', category: 'transfer', kind: 'transfer', amount_cents: 25000, source: 'Joint Checking', daysAgo: 72, owners: [P_PARTNER], paid_by: P_ME },
  { id: 'td-16', merchant: 'Costco', category: 'groceries', kind: 'expense', amount_cents: 12750, source: 'Joint Checking', daysAgo: 92, owners: [P_ME, P_PARTNER], paid_by: P_ME },
]

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

  const transactions: unknown[] = []
  const transaction_shares: unknown[] = []
  for (const tx of TX) {
    const date = iso(tx.daysAgo)
    transactions.push({
      id: tx.id,
      household_id: HH,
      merchant: tx.merchant,
      category: tx.category,
      kind: tx.kind,
      amount_cents: tx.amount_cents,
      source: tx.source,
      date,
      created_by: U_ME,
      created_at: date,
      updated_at: date,
      paid_by: tx.paid_by,
    })
    const shares = computeShares(tx.amount_cents, tx.owners, { method: 'even' })
    for (const pid of tx.owners) {
      transaction_shares.push({ transaction_id: tx.id, person_id: pid, amount_cents: shares[pid] ?? 0 })
    }
  }

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
    { id: 'testdata-budget-groceries', household_id: HH, category: 'groceries', monthly_limit_cents: 60000 },
    { id: 'testdata-budget-dining', household_id: HH, category: 'dining', monthly_limit_cents: 25000 },
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
      cards,
      properties,
      mortgage_info,
      lease_info,
      units,
      rental_payments,
      budgets,
    },
  }
}
