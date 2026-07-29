// @vitest-environment jsdom
//
// Spec 032 US2 (Contract C): the add/edit transaction form's name input offers
// kind-aware merchant/payer suggestions (a native <datalist>) on both Add and
// Edit, for expense and income, while free-form typing still works.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Transaction, User } from '@/lib/types'
import { makeTx } from '../helpers/fixtures'

const ALICE: User = { id: 'u1', name: 'Alice', initial: 'A', color_key: 'sage', created_at: '' }

const store = {
  transactions: [] as Transaction[],
}

vi.mock('@/lib/store', () => ({
  useApp: () => ({
    currency: 'usd',
    rate: () => 1,
    cards: [{ id: 'c1', household_id: 'h1', name: 'Visa', created_at: '' }],
    currentHousehold: { id: 'h1', owner_id: 'u1', name: 'Home', created_at: '' },
    currentUserId: 'u1',
    currentPersonId: 'u1',
    householdMembers: [ALICE],
    transactions: store.transactions,
    addTransaction: vi.fn(),
    updateTransaction: vi.fn(),
    tags: [],
    addTag: (name: string) => ({ id: `tag-${name}`, household_id: 'h1', name, created_at: '' }),
    formatMoney: (c: number) => `$${(c / 100).toFixed(2)}`,
    t: (k: string, ...a: Array<string | number>) =>
      a.length ? k.replace(/\{(\d+)\}/g, (m, i) => String(a[Number(i)] ?? m)) : k,
  }),
}))

import { useTxForm, TxFormFields, type TxFormApi } from '@/components/web/TxForm'

function Harness({ editing = null, onApi }: { editing?: Transaction | null; onApi?: (a: TxFormApi) => void }) {
  const form = useTxForm({ editing })
  onApi?.(form)
  return <TxFormFields form={form} />
}

function setup(props: { editing?: Transaction | null } = {}) {
  let api: TxFormApi | null = null
  render(<Harness {...props} onApi={(a) => (api = a)} />)
  return { user: userEvent.setup(), getApi: () => api as TxFormApi }
}

/** The datalist an input is bound to via its `list=` id (a per-instance useId). */
function suggestionsFor(input: HTMLInputElement): string[] {
  const id = input.getAttribute('list')
  const dl = id ? document.getElementById(id) : null
  return dl ? [...dl.querySelectorAll('option')].map((o) => (o as HTMLOptionElement).value) : []
}

beforeEach(() => {
  store.transactions = [
    makeTx({ merchant: 'Whole Foods', kind: 'expense' }),
    makeTx({ merchant: 'Whole Foods', kind: 'expense' }),
    makeTx({ merchant: 'Subway', kind: 'expense' }),
    makeTx({ merchant: 'Acme Co. payroll', kind: 'income', category: 'income' }),
  ]
})
afterEach(() => {
  store.transactions = []
})

describe('merchant suggestions — expense', () => {
  it('associates the merchant input with a datalist of known expense merchants (Add)', () => {
    setup()
    const input = screen.getByPlaceholderText('e.g. Whole Foods') as HTMLInputElement
    expect(input.getAttribute('list')).toBeTruthy()
    const values = suggestionsFor(input)
    expect(values).toContain('Whole Foods')
    expect(values).toContain('Subway')
    expect(values).not.toContain('Acme Co. payroll') // income payer excluded
  })

  it('offers the same suggestions on the Edit form', () => {
    setup({ editing: makeTx({ merchant: 'Corner Store', kind: 'expense', paid_by: 'u1', owner_ids: ['u1'] }) })
    const input = screen.getByPlaceholderText('e.g. Whole Foods') as HTMLInputElement
    expect(input.getAttribute('list')).toBeTruthy()
    expect(suggestionsFor(input)).toContain('Whole Foods')
  })
})

describe('merchant suggestions — income (kind-aware)', () => {
  it('suggests income payers and excludes expense merchants when kind=income', () => {
    const h = setup()
    act(() => h.getApi().setDir('income'))
    const input = screen.getByPlaceholderText('e.g. Acme Co. payroll') as HTMLInputElement
    expect(input.getAttribute('list')).toBeTruthy()
    const values = suggestionsFor(input)
    expect(values).toContain('Acme Co. payroll')
    expect(values).not.toContain('Whole Foods')
    expect(values).not.toContain('Subway')
  })
})

describe('free-form entry preserved', () => {
  it('accepts a brand-new name that is not in the suggestions', async () => {
    const h = setup()
    const input = screen.getByPlaceholderText('e.g. Whole Foods') as HTMLInputElement
    await h.user.type(input, 'Brand New Cafe')
    expect(h.getApi().merchant).toBe('Brand New Cafe')
  })
})
