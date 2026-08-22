// SimpleFIN transaction sync (spec 028, US2): window building, defensive txn parsing,
// dedupe, pending detection, in-band warnings, and upsert-payload mapping.
import { describe, expect, it } from 'vitest'
import {
  buildAccountsQuery,
  buildSyncWindow,
  dedupeKey,
  ledgerId,
  MAX_WINDOW_SECONDS,
  parseSimpleFinAccounts,
  SYNC_OVERLAP_SECONDS,
  toUpsertPayload,
  type SimpleFinTransaction,
  type UpsertContext,
} from '../src/index'

const DAY = 24 * 60 * 60

describe('buildAccountsQuery', () => {
  it('emits epoch start/end and pending=1 by default', () => {
    expect(buildAccountsQuery(1000, 2000)).toBe('start-date=1000&end-date=2000&pending=1')
  })

  it('clamps the window to ≤ 90 days', () => {
    const end = 1_000_000_000
    const q = buildAccountsQuery(0, end)
    expect(q).toBe(`start-date=${end - MAX_WINDOW_SECONDS}&end-date=${end}&pending=1`)
  })

  it('supports balances-only', () => {
    expect(buildAccountsQuery(1000, 2000, true)).toBe('start-date=1000&end-date=2000&balances-only=1')
  })
})

describe('buildSyncWindow', () => {
  const now = 1_700_000_000
  it('first sync spans the last 90 days', () => {
    expect(buildSyncWindow(null, now)).toEqual({ start: now - MAX_WINDOW_SECONDS, end: now })
  })

  it('subsequent sync uses last-synced minus a 3-day overlap', () => {
    const last = now - 5 * DAY
    expect(buildSyncWindow(last, now)).toEqual({ start: last - SYNC_OVERLAP_SECONDS, end: now })
  })

  it('never exceeds a 90-day span even after a long gap', () => {
    const last = now - 200 * DAY
    expect(buildSyncWindow(last, now).start).toBe(now - MAX_WINDOW_SECONDS)
  })
})

describe('parseSimpleFinAccounts — transactions', () => {
  const payload = {
    errors: ['Connection to Demo Bank may need attention'],
    accounts: [
      {
        id: 'acct-1',
        name: 'Checking',
        currency: 'USD',
        org: { name: 'Demo Bank' },
        transactions: [
          { id: 't1', posted: 1_700_000_100, amount: '-33.45', description: 'Coffee', payee: 'Cafe' },
          { id: 't2', posted: 1_700_000_200, amount: '2500.00', description: 'Paycheck' },
          { id: 't3', posted: 0, transacted_at: 1_700_000_300, amount: '-9.99', description: 'Pending sub', pending: true },
        ],
      },
    ],
  }

  it('normalizes sign→kind and abs cents; prefers payee for merchant', () => {
    const { transactions } = parseSimpleFinAccounts(payload)
    expect(transactions[0]).toMatchObject({
      providerAccountId: 'acct-1',
      providerTxnId: 't1',
      amountCents: 3345,
      kind: 'expense',
      description: 'Cafe',
      pending: false,
    })
    expect(transactions[1]).toMatchObject({ amountCents: 250000, kind: 'income', description: 'Paycheck' })
  })

  it('flags pending (explicit flag OR posted=0) and uses transacted_at when posted is 0', () => {
    const { transactions } = parseSimpleFinAccounts(payload)
    expect(transactions[2]).toMatchObject({ pending: true, postedAt: 1_700_000_300 })
  })

  it('surfaces in-band errors as warnings', () => {
    expect(parseSimpleFinAccounts(payload).warnings).toContain('Connection to Demo Bank may need attention')
  })

  it('warns and skips a transaction with an unparseable amount', () => {
    const bad = { accounts: [{ id: 'a', transactions: [{ id: 'x', amount: '1,000', posted: 1 }] }] }
    const parsed = parseSimpleFinAccounts(bad)
    expect(parsed.transactions).toEqual([])
    expect(parsed.warnings.some((w) => w.includes('x'))).toBe(true)
  })

  it('skips transactions missing id or amount', () => {
    const p = { accounts: [{ id: 'a', transactions: [{ amount: '1.00' }, { id: 'y' }] }] }
    expect(parseSimpleFinAccounts(p).transactions).toEqual([])
  })
})

describe('toUpsertPayload — ledger mapping + default split (research D6/D7)', () => {
  const ctx: UpsertContext = {
    householdId: 'hh-1',
    createdBy: 'user-1',
    defaultPersonId: 'person-1',
    defaultExpenseCategory: 'entertainment',
  }
  const txn: SimpleFinTransaction = {
    providerAccountId: 'acct-1',
    providerTxnId: 't1',
    amountCents: 3345,
    kind: 'expense',
    postedAt: 1_700_000_100,
    description: 'Cafe',
    memo: 'oat latte',
    pending: false,
  }

  it('produces a deterministic id and a single full-amount share', () => {
    const p = toUpsertPayload(txn, ctx)
    expect(p.tx.id).toBe(ledgerId('hh-1', 'acct-1', 't1'))
    expect(p.tx).toMatchObject({
      household_id: 'hh-1',
      merchant: 'Cafe',
      category: 'entertainment',
      kind: 'expense',
      amount_cents: 3345,
      source: dedupeKey('acct-1', 't1'),
      created_by: 'user-1',
      // spec 053 — the connected account's owning person, so synced rows reach the balance
      // engine instead of being invisible to it.
      paid_by: 'person-1',
      notes: 'oat latte',
    })
    expect(p.shares).toEqual([{ person_id: 'person-1', amount_cents: 3345 }])
    // shares sum equals total (upsert_transaction invariant)
    expect(p.shares.reduce((s, r) => s + r.amount_cents, 0)).toBe(p.tx.amount_cents)
  })

  it('leaves income with no payer — income has no payer (spec 053 FR-006)', () => {
    const income = toUpsertPayload({ ...txn, kind: 'income' as const }, ctx)
    expect(income.tx.paid_by).toBeNull()
  })

  it('maps postedAt to an ISO date', () => {
    expect(toUpsertPayload(txn, ctx).tx.date).toBe(new Date(1_700_000_100 * 1000).toISOString())
  })

  it('re-syncing the same txn yields the same ledger id (idempotent upsert)', () => {
    expect(toUpsertPayload(txn, ctx).tx.id).toBe(toUpsertPayload(txn, ctx).tx.id)
  })

  it('falls back to a placeholder merchant when description is empty', () => {
    expect(toUpsertPayload({ ...txn, description: '' }, ctx).tx.merchant).toBe('Bank transaction')
  })

  it('maps income to the income category regardless of the expense default', () => {
    const income: SimpleFinTransaction = { ...txn, kind: 'income', amountCents: 250000 }
    expect(toUpsertPayload(income, ctx).tx.category).toBe('income')
  })
})
