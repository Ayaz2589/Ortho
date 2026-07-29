// @vitest-environment jsdom
//
// Spec 032 US1 (Contract B): the New-form copy shortcut ranks the household's
// MOST COMMON merchants (one representative most-recent entry each), is relabeled
// "Copy from most common", prefills via onPick, and shows the empty state safely.
import { describe, expect, it, vi } from 'vitest'
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

import { TxCopyList, CopyFromCommonButton } from '@/components/web/TxForm'

function rowButtons(): HTMLElement[] {
  return screen.getAllByRole('button').filter((b) => b.classList.contains('ow-row'))
}

describe('Copy from most common — TxCopyList', () => {
  it('orders rows by merchant frequency, not recency', () => {
    store.transactions = [
      // a single, MOST-RECENT one-off — must not lead
      makeTx({ merchant: 'Airport Parking', date: '2026-06-25T12:00:00.000Z' }),
      makeTx({ merchant: 'Whole Foods', date: '2026-06-01T12:00:00.000Z' }),
      makeTx({ merchant: 'Whole Foods', date: '2026-06-05T12:00:00.000Z' }),
      makeTx({ merchant: 'Whole Foods', date: '2026-06-10T12:00:00.000Z' }),
    ]
    render(<TxCopyList onPick={vi.fn()} onBack={vi.fn()} />)
    const rows = rowButtons()
    expect(rows).toHaveLength(2) // one representative per merchant
    expect(rows[0]).toHaveTextContent('Whole Foods')
    expect(rows[1]).toHaveTextContent('Airport Parking')
  })

  it('is titled "Copy from most common"', () => {
    store.transactions = [makeTx({ merchant: 'Whole Foods' })]
    render(<TxCopyList onPick={vi.fn()} onBack={vi.fn()} />)
    expect(screen.getByText('Copy from most common')).toBeInTheDocument()
  })

  it('prefills via onPick with the merchant’s most-recent entry', async () => {
    store.transactions = [
      makeTx({ merchant: 'Whole Foods', amount_cents: 1000, date: '2026-06-01T12:00:00.000Z' }),
      makeTx({ merchant: 'Whole Foods', amount_cents: 3000, date: '2026-06-20T12:00:00.000Z' }),
    ]
    const onPick = vi.fn()
    render(<TxCopyList onPick={onPick} onBack={vi.fn()} />)
    await userEvent.setup().click(rowButtons()[0])
    expect(onPick).toHaveBeenCalledTimes(1)
    expect(onPick.mock.calls[0][0]).toMatchObject({ merchant: 'Whole Foods', amount_cents: 3000 })
  })

  it('excludes transfers / blank-merchant entries from the list', () => {
    store.transactions = [
      makeTx({ merchant: '', kind: 'transfer', category: 'transfer' }),
      makeTx({ merchant: 'Subway' }),
    ]
    render(<TxCopyList onPick={vi.fn()} onBack={vi.fn()} />)
    const rows = rowButtons()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toHaveTextContent('Subway')
  })

  it('shows the empty state on an empty ledger without erroring', () => {
    store.transactions = []
    render(<TxCopyList onPick={vi.fn()} onBack={vi.fn()} />)
    expect(screen.getByText('Nothing to copy yet')).toBeInTheDocument()
    expect(rowButtons()).toHaveLength(0)
  })
})

describe('Copy from most common — button', () => {
  it('reads "Copy from most common"', () => {
    store.transactions = []
    render(<CopyFromCommonButton onClick={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Copy from most common' })).toBeInTheDocument()
  })
})
