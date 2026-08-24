// @vitest-environment jsdom
//
// Review 2026-08-24 (minor, csv-scan-import): loadFromScanCandidate converted
// non-USD candidates with a hardcoded /100 — but scan minor units are
// per-currency (fractionDigits('jpy') === 0), so a ¥1,234 receipt prefilled at
// 1/100 of the real amount. The divisor must be 10^fractionDigits(currency).
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render } from '@testing-library/react'
import type { User } from '@/lib/types'
import type { ParsedCandidate } from '@/lib/scan/scanModels'

const ALICE: User = { id: 'u1', name: 'Alice', initial: 'A', color_key: 'sage', created_at: '2026-01-01' }

vi.mock('@/lib/store', () => ({
  useApp: () => ({
    currency: 'usd',
    rate: (c: string) => (c === 'jpy' ? 147 : 1),
    cards: [],
    depositAccounts: [],
    currentHousehold: { id: 'h1', owner_id: 'u1', name: 'Home', created_at: '2026-01-01' },
    currentUserId: 'u1',
    currentPersonId: 'u1',
    householdMembers: [ALICE],
    resolveUser: () => ALICE,
    addTransaction: vi.fn(),
    updateTransaction: vi.fn(),
    formatMoney: (c: number) => `$${(c / 100).toFixed(2)}`,
    t: (k: string) => k,
  }),
}))

import { useTxForm, type TxFormApi } from '@/components/web/TxForm'

function Harness({ onApi }: { onApi: (api: TxFormApi) => void }) {
  const form = useTxForm({ editing: null, copying: null })
  onApi(form)
  return null
}

function candidate(over: Partial<ParsedCandidate>): ParsedCandidate {
  return {
    id: 'cand-1',
    merchantRaw: 'Lawson',
    merchant: 'Lawson',
    date: null,
    amountCents: 1234,
    direction: 'debit',
    currency: 'jpy',
    originalAmount: '1234',
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
  if (!('randomUUID' in (globalThis.crypto ?? {}))) {
    // @ts-expect-error test shim
    globalThis.crypto = { ...globalThis.crypto, randomUUID: () => 'test-uuid' }
  }
})

describe('scan handoff for zero-decimal currencies', () => {
  it('a ¥1,234 candidate at rate 147 prefills ≈ $8.39, not $0.08', () => {
    let api: TxFormApi = null as never
    render(<Harness onApi={(a) => (api = a)} />)

    act(() => {
      api.loadFromScanCandidate(candidate({}))
    })

    // 1234 yen / 147 (JPY per USD) = $8.3946… → 839 cents.
    expect(api.cents).toBe(839)
  })
})
