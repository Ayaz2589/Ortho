// @vitest-environment jsdom
//
// Every picker on the New/Edit transaction form is the SAME in-card disclosure
// (`AccordionRow`) the date and category pickers already use — no native
// `<select>`, and no control whose height depends on how much is selected.
//
// The reported bug: picking a different number of owners re-flowed the wrapping
// avatar-chip row, so the Owners section (and the card, and everything below it)
// jumped height on every click. A collapsed accordion row is a fixed-height
// summary, so the layout no longer moves; the member list lives inside the
// expanded panel.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within, fireEvent, act } from '@testing-library/react'
import type { User } from '@/lib/types'

const ALICE: User = { id: 'u1', name: 'Alice', initial: 'A', color_key: 'sage', created_at: '2026-01-01' }
const BOB: User = { id: 'u2', name: 'Bob', initial: 'B', color_key: 'sky', created_at: '2026-01-01' }
const CARA: User = { id: 'u3', name: 'Cara', initial: 'C', color_key: 'slate', created_at: '2026-01-01' }

const addTransaction = vi.fn()
const updateTransaction = vi.fn()

vi.mock('@/lib/store', () => ({
  useApp: () => ({
    currency: 'usd',
    rate: () => 1,
    cards: [
      { id: 'c1', household_id: 'h1', name: 'Visa', created_at: '2026-01-01' },
      { id: 'c2', household_id: 'h1', name: 'Amex', created_at: '2026-01-01' },
    ],
    depositAccounts: [{ id: 'd1', household_id: 'h1', name: 'Checking', created_at: '2026-01-01' }],
    currentHousehold: { id: 'h1', owner_id: 'u1', name: 'Home', created_at: '2026-01-01' },
    currentUserId: 'u1',
    currentPersonId: 'u1',
    householdMembers: [ALICE, BOB, CARA],
    resolveUser: (id: string) => ({ id, name: id, initial: id[0], color_key: 'sage', created_at: '2026-01-01' }),
    addTransaction,
    updateTransaction,
    transactions: [],
    routines: [],
    tags: [],
    addTag: vi.fn(),
    locale: 'en-US',
    formatMoney: (c: number) => `$${(c / 100).toFixed(2)}`,
    t: (k: string, ...a: Array<string | number>) =>
      a.length ? k.replace(/\{(\d+)\}/g, (m, i) => String(a[Number(i)] ?? m)) : k,
  }),
}))

import { useTxForm, TxFormFields, SaveAndAddAnotherButton, type TxFormApi } from '@/components/web/TxForm'

function Harness({ onApi }: { onApi?: (api: TxFormApi) => void }) {
  const form = useTxForm({})
  onApi?.(form)
  return (
    <div>
      <TxFormFields form={form} />
      <SaveAndAddAnotherButton form={form} />
    </div>
  )
}

/** The accordion header button whose accessible name is `name`. */
function row(name: string): HTMLElement {
  return screen.getByRole('button', { name, expanded: false }) as HTMLElement
}

/** The panel a disclosure row reveals — the sibling that follows its header. */
function panelOf(header: HTMLElement): HTMLElement {
  const panel = header.nextElementSibling
  if (!(panel instanceof HTMLElement)) throw new Error('disclosure row revealed no panel')
  return panel
}

beforeEach(() => {
  if (!('randomUUID' in (globalThis.crypto ?? {}))) {
    // @ts-expect-error test shim
    globalThis.crypto = { ...globalThis.crypto, randomUUID: () => 'test-uuid' }
  }
})
afterEach(() => {
  addTransaction.mockClear()
  updateTransaction.mockClear()
  vi.useRealTimers()
})

describe('tx form — every picker is the shared accordion row', () => {
  it('renders no native <select> anywhere on an expense', () => {
    const { container } = render(<Harness />)
    expect(container.querySelectorAll('select')).toHaveLength(0)
  })

  it('renders no native <select> anywhere on a transfer', () => {
    let api: TxFormApi | null = null
    const { container } = render(<Harness onApi={(a) => (api = a)} />)
    act(() => api!.setDir('transfer'))
    expect(container.querySelectorAll('select')).toHaveLength(0)
  })

  it('Owners is a collapsed disclosure row summarizing the selection', () => {
    render(<Harness />)
    const header = row('Owners')
    expect(header).toHaveAttribute('aria-expanded', 'false')
    // Default owner is the current person only.
    expect(header).toHaveTextContent('Alice')
    expect(header).not.toHaveTextContent('Bob')
  })

  it('the Owners row keeps ONE summary line however many owners are picked', () => {
    let api: TxFormApi | null = null
    render(<Harness onApi={(a) => (api = a)} />)

    // 1 owner → their name. 2 → both names. 3+ → a count, so the summary can
    // never grow to a second line (the height-jump bug).
    expect(row('Owners')).toHaveTextContent('Alice')
    act(() => api!.toggleOwner('u2'))
    expect(row('Owners')).toHaveTextContent('Alice, Bob')
    act(() => api!.toggleOwner('u3'))
    expect(row('Owners')).toHaveTextContent('3 people')
    expect(row('Owners')).not.toHaveTextContent('Cara')
  })

  it('expanding Owners lists every member and toggles selection', () => {
    let api: TxFormApi | null = null
    render(<Harness onApi={(a) => (api = a)} />)

    fireEvent.click(row('Owners'))
    const header = screen.getByRole('button', { name: 'Owners', expanded: true })
    const panel = panelOf(header)

    for (const name of ['Alice', 'Bob', 'Cara']) {
      expect(within(panel).getByRole('button', { name })).toBeTruthy()
    }
    // Selection state is exposed, not just painted.
    expect(within(panel).getByRole('button', { name: 'Alice' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(panel).getByRole('button', { name: 'Bob' })).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(within(panel).getByRole('button', { name: 'Bob' }))
    expect(api!.owners).toContain('u2')
    // Multi-select: the panel stays open so a second owner can be added.
    expect(screen.getByRole('button', { name: 'Owners', expanded: true })).toBeTruthy()
  })

  it('the last owner cannot be deselected', () => {
    let api: TxFormApi | null = null
    render(<Harness onApi={(a) => (api = a)} />)
    fireEvent.click(row('Owners'))
    const panel = panelOf(screen.getByRole('button', { name: 'Owners', expanded: true }))
    fireEvent.click(within(panel).getByRole('button', { name: 'Alice' }))
    expect(api!.owners).toEqual(['u1'])
  })

  it('Paid by is a disclosure row that picks a member and closes', () => {
    let api: TxFormApi | null = null
    render(<Harness onApi={(a) => (api = a)} />)

    const header = row('Paid by')
    expect(header).toHaveTextContent('Alice')
    fireEvent.click(header)
    const panel = panelOf(screen.getByRole('button', { name: 'Paid by', expanded: true }))
    fireEvent.click(within(panel).getByRole('button', { name: 'Bob' }))

    expect(api!.paidBy).toBe('u2')
    // Single-select closes on pick.
    expect(screen.getByRole('button', { name: 'Paid by', expanded: false })).toHaveTextContent('Bob')
  })

  it('Paid with is a disclosure row that picks a card and closes', () => {
    let api: TxFormApi | null = null
    render(<Harness onApi={(a) => (api = a)} />)

    const header = row('Paid with')
    expect(header).toHaveTextContent('Visa')
    fireEvent.click(header)
    const panel = panelOf(screen.getByRole('button', { name: 'Paid with', expanded: true }))
    fireEvent.click(within(panel).getByRole('button', { name: 'Amex' }))

    expect(api!.source).toBe('Amex')
    expect(screen.getByRole('button', { name: 'Paid with', expanded: false })).toHaveTextContent('Amex')
  })

  it('income swaps the source row to Deposit to, still a disclosure row', () => {
    let api: TxFormApi | null = null
    render(<Harness onApi={(a) => (api = a)} />)
    act(() => api!.setDir('income'))

    expect(screen.queryByRole('button', { name: 'Paid with' })).toBeNull()
    expect(row('Deposit to')).toHaveTextContent('Checking')
  })

  it('transfer From/To are disclosure rows that pick members', () => {
    let api: TxFormApi | null = null
    render(<Harness onApi={(a) => (api = a)} />)
    act(() => api!.setDir('transfer'))

    fireEvent.click(row('From'))
    const panel = panelOf(screen.getByRole('button', { name: 'From', expanded: true }))
    fireEvent.click(within(panel).getByRole('button', { name: 'Cara' }))

    expect(api!.transferFrom).toBe('u3')
    expect(screen.getByRole('button', { name: 'From', expanded: false })).toHaveTextContent('Cara')
    expect(row('To')).toBeTruthy()
  })

  it('at most one picker is open at a time', () => {
    render(<Harness />)
    fireEvent.click(row('Owners'))
    expect(screen.getByRole('button', { name: 'Owners', expanded: true })).toBeTruthy()

    fireEvent.click(row('Category'))
    expect(screen.getByRole('button', { name: 'Category', expanded: true })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Owners', expanded: false })).toBeTruthy()
  })
})

describe('tx form — "Save and add another" confirms the save', () => {
  it('shows no confirmation before saving', () => {
    render(<Harness />)
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('confirms after a successful save, then fades on its own', () => {
    vi.useFakeTimers()
    let api: TxFormApi | null = null
    render(<Harness onApi={(a) => (api = a)} />)

    act(() => {
      api!.setAmount('12.00')
      api!.setMerchant('Costco')
    })
    fireEvent.click(screen.getByRole('button', { name: /Save and add another/ }))

    expect(addTransaction).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('status')).toHaveTextContent('Saved')

    act(() => void vi.advanceTimersByTime(2500))
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('does not confirm when the form cannot be saved', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: /Save and add another/ }))
    expect(addTransaction).not.toHaveBeenCalled()
    expect(screen.queryByRole('status')).toBeNull()
  })
})
