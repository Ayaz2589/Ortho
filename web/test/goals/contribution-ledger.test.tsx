// @vitest-environment jsdom
//
// spec 059 US3 — the collapsible contribution list.
//
// This is what makes removing the always-visible ledger safe rather than a
// regression: the common case (fix a wrong amount) must not become harder than
// it was when three rows sat on the front of every card.
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import type { GoalContribution } from '@/lib/types'

vi.mock('@/lib/store', () => ({
  useApp: () => ({
    formatMoney: (c: number) => `$${(c / 100).toFixed(2)}`,
    locale: 'en-US',
    t: (k: string, ...a: Array<string | number>) =>
      a.length ? k.replace(/\{(\d+)\}/g, (m, i) => String(a[Number(i)] ?? m)) : k,
  }),
}))

import { ContributionLedger } from '@/components/goals/ContributionLedger'

const contrib = (date: string, cents: number, id = date): GoalContribution => ({
  id,
  goal_id: 'g1',
  amount_cents: cents,
  date,
  note: null,
  created_by: 'u1',
  created_at: `${date}T00:00:00.000Z`,
})

afterEach(cleanup)

describe('ContributionLedger', () => {
  const three = [contrib('2026-02-01', 60_000), contrib('2026-03-01', 60_000), contrib('2026-04-01', 60_000)]

  it('lists contributions newest first', () => {
    render(<ContributionLedger contributions={three} />)
    const rows = screen.getAllByTestId('ledger-row')
    expect(rows).toHaveLength(3)
    expect(rows[0]).toHaveTextContent('Apr')
    expect(rows[2]).toHaveTextContent('Feb')
  })

  it('closes with a total that reconciles against the card headline', () => {
    render(<ContributionLedger contributions={three} />)
    const total = screen.getByTestId('ledger-total')
    expect(total).toHaveTextContent('Total contributed')
    expect(total).toHaveTextContent('$1800.00')
  })

  it('offers edit and delete per row when handlers are given', () => {
    const onEdit = vi.fn()
    const onDelete = vi.fn()
    render(<ContributionLedger contributions={three} onEdit={onEdit} onDelete={onDelete} />)

    const first = screen.getAllByTestId('ledger-row')[0]
    fireEvent.click(within(first).getByLabelText('Edit contribution'))
    expect(onEdit).toHaveBeenCalledWith(three[2]) // 2026-04-01, the newest

    fireEvent.click(within(first).getByLabelText('Delete contribution'))
    expect(onDelete).toHaveBeenCalledWith(three[2])
  })

  it('shows no row actions when no handlers are given', () => {
    render(<ContributionLedger contributions={three} />)
    expect(screen.queryByLabelText('Edit contribution')).toBeNull()
    expect(screen.queryByLabelText('Delete contribution')).toBeNull()
  })

  it('caps at 12 rows and offers the detail page for the rest', () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      contrib(`2026-${String((i % 12) + 1).padStart(2, '0')}-01`, 60_000, `c${i}`)
    )
    render(<ContributionLedger contributions={many} maxRows={12} seeAllHref="/planning/goals?id=g1" />)
    expect(screen.getAllByTestId('ledger-row')).toHaveLength(12)
    expect(screen.getByText('See all in detail')).toBeTruthy()
  })

  it('shows every row when uncapped, as the detail page needs', () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      contrib(`2026-${String((i % 12) + 1).padStart(2, '0')}-01`, 60_000, `c${i}`)
    )
    render(<ContributionLedger contributions={many} />)
    expect(screen.getAllByTestId('ledger-row')).toHaveLength(20)
    expect(screen.queryByText('See all in detail')).toBeNull()
  })

  it('renders a note beside its date when one is recorded', () => {
    render(<ContributionLedger contributions={[{ ...contrib('2026-02-01', 60_000), note: 'extra payment' }]} />)
    expect(screen.getByTestId('ledger-row')).toHaveTextContent('extra payment')
  })

  it('says so calmly when there is nothing to list', () => {
    render(<ContributionLedger contributions={[]} />)
    expect(screen.getByText('No contributions yet')).toBeTruthy()
    expect(screen.queryByTestId('ledger-total')).toBeNull()
  })
})
