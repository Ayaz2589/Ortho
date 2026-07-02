// @vitest-environment jsdom
//
// MonthPicker — the dashboard stepper + month list (US1). Stepping is clamped to
// the available months; the label opens a list to jump; "Latest" returns to the
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

  it('shows the selected month and steps to adjacent months', async () => {
    const user = userEvent.setup()
    const { onSelectMonth } = setup({ selectedMonth: '2026-05' })
    expect(screen.getByRole('button', { expanded: false })).toHaveTextContent('May 2026')

    await user.click(screen.getByRole('button', { name: 'Previous month' }))
    expect(onSelectMonth).toHaveBeenCalledWith('2026-04') // older

    await user.click(screen.getByRole('button', { name: 'Next month' }))
    expect(onSelectMonth).toHaveBeenCalledWith('2026-06') // newer
  })

  it('disables Previous at the earliest month', () => {
    setup({ selectedMonth: '2026-04' })
    expect(screen.getByRole('button', { name: 'Previous month' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Next month' })).toBeEnabled()
  })

  it('disables Next at the latest month', () => {
    setup({ selectedMonth: '2026-06' })
    expect(screen.getByRole('button', { name: 'Next month' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Previous month' })).toBeEnabled()
  })

  it('opens the list and jumps to a chosen month', async () => {
    const user = userEvent.setup()
    const { onSelectMonth } = setup({ selectedMonth: '2026-05' })
    await user.click(screen.getByRole('button', { expanded: false }))
    const list = screen.getByRole('listbox')
    expect(within(list).getByRole('option', { name: 'June 2026' })).toBeInTheDocument()
    await user.click(within(list).getByRole('option', { name: 'April 2026' }))
    expect(onSelectMonth).toHaveBeenCalledWith('2026-04')
  })

  it('"Latest" returns to the relative range', async () => {
    const user = userEvent.setup()
    const { onClear } = setup({ selectedMonth: '2026-05' })
    await user.click(screen.getByRole('button', { name: 'Latest' }))
    expect(onClear).toHaveBeenCalled()
  })

  it('with no month selected, the stepper arrows are disabled', () => {
    setup({ selectedMonth: null })
    expect(screen.getByRole('button', { name: 'Previous month' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Next month' })).toBeDisabled()
    expect(screen.getByRole('button', { expanded: false })).toHaveTextContent('Pick a month')
  })
})
