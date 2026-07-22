// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { makeTx } from '../helpers/fixtures'

vi.mock('@/lib/store', () => ({
  useAppServices: () => ({
    formatMoney: (c: number) => `$${(c / 100).toFixed(2)}`,
    resolveUser: (id: string) => ({ id: id || 'u', name: 'Ayaz', initial: 'A', color_key: 'sage' }),
    t: (k: string) => k,
  }),
}))

import { TransactionRow } from '@/components/transactions/TransactionRow'

describe('TransactionRow — long merchant handling', () => {
  it('truncates the name in a shrinkable row so the amount is never clipped', () => {
    render(
      <TransactionRow
        tx={makeTx({ merchant: 'Aplpay Exxonmobil Long Island C Ny', amount_cents: 2890, owner_ids: ['u1'] })}
        onOpen={() => {}}
        onCopy={() => {}}
        onDelete={() => {}}
      />
    )

    // The amount is present (it used to get pushed off the row edge and clipped).
    expect(screen.getByText('$28.90')).toBeInTheDocument()

    // The merchant sits in a truncating cell, and its clickable button can shrink
    // (min-w-0) so the ellipsis engages instead of expanding the row.
    const name = screen.getByText('Aplpay Exxonmobil Long Island C Ny')
    expect(name).toHaveClass('truncate')
    const button = name.closest('button')
    expect(button).toHaveClass('min-w-0')

    // The hover menu is taken out of the flow (absolute) so it reserves no slot
    // to the right of the amount.
    const menuContainer = screen.getByLabelText('Transaction actions').parentElement
    expect(menuContainer).toHaveClass('absolute')
  })
})
