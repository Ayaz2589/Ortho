// @vitest-environment jsdom
//
// MonthPicker — the dashboard's specific-month control. It used to be a
// prev/next stepper AND a jump list AND a separate "Latest" button: three
// affordances for one choice, two of which only became usable once a month was
// already picked. It is now just the dropdown — the trigger shows the active
// month, and the list carries every month plus "Latest" to return to the
// relative range.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// `t` mirrors the store's English identity behavior (key in, key out).
vi.mock('@/lib/store', () => ({ useApp: () => ({ locale: 'en-US', t: (key: string) => key }) }))

import { MonthPicker } from '@/components/dashboard/MonthPicker'

const MONTHS = ['2026-06', '2026-05', '2026-04'] // newest-first

function setup(props: Partial<React.ComponentProps<typeof MonthPicker>> = {}) {
  const onSelectMonth = vi.fn()
  const onClear = vi.fn()
  render(
    <MonthPicker
      availableMonths={MONTHS}
      selectedMonth="2026-05"
      onSelectMonth={onSelectMonth}
      onClear={onClear}
      {...props}
    />
  )
  return { onSelectMonth, onClear }
}

beforeEach(() => vi.clearAllMocks())

describe('MonthPicker', () => {
  it('renders nothing when there are no months', () => {
    const { container } = render(
      <MonthPicker availableMonths={[]} selectedMonth={null} onSelectMonth={vi.fn()} onClear={vi.fn()} />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('is a single control — no stepper arrows, no separate Latest button', () => {
    setup({ selectedMonth: '2026-05' })
    expect(screen.queryByRole('button', { name: 'Previous month' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Next month' })).toBeNull()
    // Exactly one button before the list is opened: the trigger.
    expect(screen.getAllByRole('button')).toHaveLength(1)
  })

  it('shows the selected month', () => {
    setup({ selectedMonth: '2026-05' })
    expect(screen.getByRole('button', { expanded: false })).toHaveTextContent('May 2026')
  })

  it('prompts to pick when no month is selected', () => {
    setup({ selectedMonth: null })
    expect(screen.getByRole('button', { expanded: false })).toHaveTextContent('Pick a month')
  })

  it('opens the list and jumps to a chosen month', async () => {
    const user = userEvent.setup()
    const { onSelectMonth } = setup({ selectedMonth: '2026-05' })
    await user.click(screen.getByRole('button', { expanded: false }))
    const list = screen.getByRole('listbox')
    expect(within(list).getByRole('option', { name: 'June 2026' })).toBeInTheDocument()
    expect(within(list).getByRole('option', { name: 'May 2026' })).toHaveAttribute('aria-selected', 'true')

    await user.click(within(list).getByRole('option', { name: 'April 2026' }))
    expect(onSelectMonth).toHaveBeenCalledWith('2026-04')
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('offers "Latest" inside the list to return to the relative range', async () => {
    const user = userEvent.setup()
    const { onClear } = setup({ selectedMonth: '2026-05' })
    await user.click(screen.getByRole('button', { expanded: false }))
    await user.click(within(screen.getByRole('listbox')).getByRole('option', { name: 'Latest' }))
    expect(onClear).toHaveBeenCalled()
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('omits "Latest" when already on the relative range', async () => {
    const user = userEvent.setup()
    setup({ selectedMonth: null })
    await user.click(screen.getByRole('button', { expanded: false }))
    expect(within(screen.getByRole('listbox')).queryByRole('option', { name: 'Latest' })).toBeNull()
  })

  it('closes on Escape', async () => {
    const user = userEvent.setup()
    setup({ selectedMonth: '2026-05' })
    await user.click(screen.getByRole('button', { expanded: false }))
    expect(screen.getByRole('listbox')).toBeTruthy()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('listbox')).toBeNull()
  })
})
