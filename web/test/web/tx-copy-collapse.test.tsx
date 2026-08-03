// @vitest-environment jsdom
//
// "Copy from most common" category sections are collapsible, and the collapse
// state is remembered across opens (persisted per browser). Collapsing a section
// hides its rows but keeps the header; the choice survives a remount.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Transaction } from '@/lib/types'
import { makeTx } from '../helpers/fixtures'

const store = { transactions: [] as Transaction[] }

vi.mock('@/lib/store', () => ({
  useApp: () => ({
    transactions: store.transactions,
    formatMoney: (c: number) => `$${(c / 100).toFixed(2)}`,
    ownersDisplay: () => ({ label: 'Alice' }),
    locale: 'en-US',
    t: (k: string, ...a: Array<string | number>) =>
      a.length ? k.replace(/\{(\d+)\}/g, (m, i) => String(a[Number(i)] ?? m)) : k,
  }),
}))

import { TxCopyList } from '@/components/web/TxForm'

function rowButtons(): HTMLElement[] {
  return screen.getAllByRole('button').filter((b) => b.classList.contains('ow-row'))
}

// Header disclosures are the buttons carrying aria-expanded.
function header(name: RegExp): HTMLElement {
  return screen.getByRole('button', { name, expanded: undefined }) as HTMLElement
}
function headerByExpanded(): HTMLElement[] {
  return screen.getAllByRole('button').filter((b) => b.hasAttribute('aria-expanded'))
}

describe('Copy from most common — collapsible categories', () => {
  beforeEach(() => {
    localStorage.clear()
    store.transactions = [
      makeTx({ merchant: 'Whole Foods', category: 'groceries' }),
      makeTx({ merchant: 'Aldi', category: 'groceries' }),
      makeTx({ merchant: 'Chipotle', category: 'dining' }),
    ]
  })

  it('renders a disclosure header per category, all expanded by default', () => {
    render(<TxCopyList onPick={vi.fn()} onBack={vi.fn()} />)
    const headers = headerByExpanded()
    expect(headers).toHaveLength(2) // dining, groceries
    expect(headers.every((h) => h.getAttribute('aria-expanded') === 'true')).toBe(true)
    expect(rowButtons()).toHaveLength(3)
  })

  it('collapsing a category hides its rows but keeps the header', async () => {
    const user = userEvent.setup()
    render(<TxCopyList onPick={vi.fn()} onBack={vi.fn()} />)
    await user.click(header(/Groceries/))
    // groceries rows (Aldi, Whole Foods) gone; dining (Chipotle) remains
    const rows = rowButtons()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toHaveTextContent('Chipotle')
    expect(header(/Groceries/).getAttribute('aria-expanded')).toBe('false')
  })

  it('toggling a collapsed category expands it again', async () => {
    const user = userEvent.setup()
    render(<TxCopyList onPick={vi.fn()} onBack={vi.fn()} />)
    await user.click(header(/Dining/))
    expect(rowButtons()).toHaveLength(2) // groceries only
    await user.click(header(/Dining/))
    expect(rowButtons()).toHaveLength(3) // all back
  })

  it('remembers collapsed sections across a remount (persisted)', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<TxCopyList onPick={vi.fn()} onBack={vi.fn()} />)
    await user.click(header(/Groceries/))
    expect(rowButtons()).toHaveLength(1)
    unmount()

    // Re-open the panel: groceries should still be collapsed.
    render(<TxCopyList onPick={vi.fn()} onBack={vi.fn()} />)
    expect(header(/Groceries/).getAttribute('aria-expanded')).toBe('false')
    const rows = rowButtons()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toHaveTextContent('Chipotle')
  })

  it('a category not previously collapsed stays open on remount', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<TxCopyList onPick={vi.fn()} onBack={vi.fn()} />)
    await user.click(header(/Groceries/)) // collapse groceries only
    unmount()
    render(<TxCopyList onPick={vi.fn()} onBack={vi.fn()} />)
    expect(header(/Dining/).getAttribute('aria-expanded')).toBe('true')
  })

  it('picking a row inside an expanded category still prefills', async () => {
    const user = userEvent.setup()
    const onPick = vi.fn()
    render(<TxCopyList onPick={onPick} onBack={vi.fn()} />)
    await user.click(rowButtons()[0])
    expect(onPick).toHaveBeenCalledTimes(1)
  })
})
