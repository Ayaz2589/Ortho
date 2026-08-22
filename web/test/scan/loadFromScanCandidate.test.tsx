// @vitest-environment jsdom
//
// spec 021 — bridges a scanned ParsedCandidate into the existing transaction
// form (T053), mirroring the established `loadFrom(tx)` pattern: prefill
// merchant/amount/category/owners/date, never touch splits beyond resetting
// to even. Non-USD candidates convert through USD cents first, exactly like
// every other amount this form ever stores.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render } from '@testing-library/react'
import type { User } from '@/lib/types'
import type { ParsedCandidate } from '@/lib/scan/scanModels'

const ALICE: User = { id: 'u1', name: 'Alice', initial: 'A', color_key: 'sage', created_at: '' }
const BOB: User = { id: 'u2', name: 'Bob', initial: 'B', color_key: 'slate', created_at: '' }

const addTransaction = vi.fn()
const updateTransaction = vi.fn()
const rates: Record<string, number> = { usd: 1, eur: 0.92 }
const store = { currency: 'usd' as string }

vi.mock('@/lib/store', () => ({
  useApp: () => ({
    currency: store.currency,
    rate: (c: string) => rates[c] ?? 1,
    cards: [{ id: 'c1', household_id: 'h1', name: 'Visa', created_at: '' }],
    depositAccounts: [],
    currentHousehold: { id: 'h1', owner_id: 'u1', name: 'Home', created_at: '' },
    currentUserId: 'u1',
    currentPersonId: 'u1',
    householdMembers: [ALICE, BOB],
    addTransaction,
    updateTransaction,
    formatMoney: (c: number) => `$${(c / 100).toFixed(2)}`,
    t: (k: string) => k,
  }),
}))

import { useTxForm, TxFormFields, type TxFormApi } from '@/components/web/TxForm'

function Harness({ onApi }: { onApi: (api: TxFormApi) => void }) {
  const form = useTxForm({})
  onApi(form)
  return <TxFormFields form={form} />
}

function setup() {
  let api: TxFormApi | null = null
  render(<Harness onApi={(a) => (api = a)} />)
  return () => api as TxFormApi
}

function candidate(over: Partial<ParsedCandidate> = {}): ParsedCandidate {
  return {
    id: 'cand-1',
    merchantRaw: 'BLUE BOTTLE',
    merchant: 'Blue Bottle',
    date: { year: 2026, month: 7, day: 1 },
    amountCents: 650,
    direction: 'debit',
    currency: 'usd',
    originalAmount: null,
    isPaymentRow: false,
    guesses: new Set(),
    categoryGuess: null,
    ownersGuess: null,
    paidByGuess: null,
    duplicateOf: null,
    ...over,
  }
}

beforeEach(() => {
  store.currency = 'usd'
  if (!('randomUUID' in (globalThis.crypto ?? {}))) {
    // @ts-expect-error test shim
    globalThis.crypto = { ...globalThis.crypto, randomUUID: () => 'test-uuid' }
  }
})

afterEach(() => {
  addTransaction.mockClear()
  updateTransaction.mockClear()
})

describe('loadFromScanCandidate', () => {
  it('prefills merchant, amount, category, and date from a USD candidate', () => {
    const getApi = setup()
    act(() =>
      getApi().loadFromScanCandidate(
        candidate({ merchant: 'Blue Bottle', amountCents: 650, categoryGuess: 'coffee' })
      )
    )
    const api = getApi()
    expect(api.merchant).toBe('Blue Bottle')
    expect(api.cents).toBe(650)
    expect(api.category).toBe('coffee')
    expect(api.date).toBe('2026-07-01')
    expect(api.direction).toBe('expense')
  })

  it('a credit candidate prefills as income', () => {
    const getApi = setup()
    act(() => getApi().loadFromScanCandidate(candidate({ direction: 'credit' })))
    expect(getApi().direction).toBe('income')
  })

  it('converts a foreign-currency candidate to USD cents via the app FX rate', () => {
    const getApi = setup()
    // 23.50 EUR at rate 0.92 (units of EUR per 1 USD) -> 23.50 / 0.92 = 25.5435 USD -> 2554 cents
    act(() =>
      getApi().loadFromScanCandidate(
        candidate({ amountCents: 2350, currency: 'eur', originalAmount: '23.50' })
      )
    )
    expect(getApi().cents).toBe(2554)
  })

  it('adopts a valid ownersGuess, falling back to the household default when guessed owners are not current members', () => {
    const getApi = setup()
    act(() => getApi().loadFromScanCandidate(candidate({ ownersGuess: ['u2'] })))
    expect(getApi().owners).toEqual(['u2'])

    // spec 050 — the fallback is the household DEFAULT, which is now the whole household.
    // A scanned receipt whose remembered owners have all left should not quietly become a
    // solo row for whoever happens to be signed in.
    act(() => getApi().loadFromScanCandidate(candidate({ ownersGuess: ['not-a-member'] })))
    expect(getApi().owners).toEqual(['u1', 'u2'])
  })

  // spec 053 — the payer travels with the owners.
  it('adopts a remembered payer when it is still a household member', () => {
    const getApi = setup()
    act(() => getApi().loadFromScanCandidate(candidate({ paidByGuess: 'u2' })))
    expect(getApi().paidBy).toBe('u2')
  })

  it('ignores a remembered payer who has left the household', () => {
    const getApi = setup()
    const before = getApi().paidBy
    act(() => getApi().loadFromScanCandidate(candidate({ paidByGuess: 'not-a-member' })))
    expect(getApi().paidBy).toBe(before)
  })

  it('leaves category untouched when categoryGuess is null', () => {
    const getApi = setup()
    const before = getApi().category
    act(() => getApi().loadFromScanCandidate(candidate({ categoryGuess: null })))
    expect(getApi().category).toBe(before)
  })

  it('leaves the date untouched when the candidate has no date', () => {
    const getApi = setup()
    const before = getApi().date
    act(() => getApi().loadFromScanCandidate(candidate({ date: null })))
    expect(getApi().date).toBe(before)
  })
})
