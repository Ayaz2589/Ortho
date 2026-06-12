// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// DatePicker reads only `locale` from the app store.
vi.mock('@/lib/store', () => ({
  useApp: () => ({ locale: 'en-US' }),
}))

import { DatePicker } from '@/components/inputs'

function renderPicker(value = '2026-06-12', ariaLabel = 'Choose date') {
  const onChange = vi.fn()
  const utils = render(<DatePicker value={value} onChange={onChange} ariaLabel={ariaLabel} />)
  return { onChange, ...utils }
}

describe('DatePicker', () => {
  it('renders the formatted selected date with dialog popup semantics', () => {
    renderPicker('2026-06-12')
    const trigger = screen.getByRole('button', { name: 'Choose date' })
    expect(trigger).toHaveTextContent('Jun 12, 2026')
    expect(trigger).toHaveAttribute('aria-haspopup', 'dialog')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })

  it('opens a dialog and reflects expanded state when the trigger is clicked', async () => {
    const user = userEvent.setup()
    renderPicker('2026-06-12')
    const trigger = screen.getByRole('button', { name: 'Choose date' })

    expect(screen.queryByRole('dialog')).toBeNull()
    await user.click(trigger)

    const dialog = screen.getByRole('dialog', { name: 'Choose date' })
    expect(dialog).toBeInTheDocument()
    expect(trigger).toHaveAttribute('aria-expanded', 'true')

    // The grid shows day cells for the value's month (June has a "12" and "30").
    expect(within(dialog).getByRole('button', { name: '12' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: '30' })).toBeInTheDocument()
    expect(within(dialog).getByText('June 2026')).toBeInTheDocument()
  })

  it('calls onChange with the correct LOCAL ISO string when a day is picked (no TZ shift)', async () => {
    const user = userEvent.setup()
    const { onChange } = renderPicker('2026-06-12')
    await user.click(screen.getByRole('button', { name: 'Choose date' }))

    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: '20' }))

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith('2026-06-20')
    // Picking a day closes the dialog.
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('navigates between months via Previous/Next month buttons', async () => {
    const user = userEvent.setup()
    renderPicker('2026-06-12')
    await user.click(screen.getByRole('button', { name: 'Choose date' }))

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('June 2026')).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: 'Previous month' }))
    expect(within(dialog).getByText('May 2026')).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: 'Next month' }))
    await user.click(within(dialog).getByRole('button', { name: 'Next month' }))
    expect(within(dialog).getByText('July 2026')).toBeInTheDocument()
  })

  describe("Today button", () => {
    beforeEach(() => {
      // Fake only Date so `new Date()` is deterministic, while userEvent's own
      // timers/microtasks keep running on the real clock.
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date(2026, 5, 12))
    })
    afterEach(() => {
      vi.useRealTimers()
    })

    it("calls onChange with today's ISO", async () => {
      const user = userEvent.setup()
      const { onChange } = renderPicker('2026-01-01')
      await user.click(screen.getByRole('button', { name: 'Choose date' }))

      const dialog = screen.getByRole('dialog')
      await user.click(within(dialog).getByRole('button', { name: 'Today' }))

      expect(onChange).toHaveBeenCalledWith('2026-06-12')
    })
  })

  it('closes the dialog when Escape is pressed', async () => {
    const user = userEvent.setup()
    renderPicker('2026-06-12')
    await user.click(screen.getByRole('button', { name: 'Choose date' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('closes the dialog when clicking outside', async () => {
    const user = userEvent.setup()
    const outside = document.createElement('button')
    outside.textContent = 'outside'
    document.body.appendChild(outside)

    renderPicker('2026-06-12')
    await user.click(screen.getByRole('button', { name: 'Choose date' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    await user.click(outside)
    expect(screen.queryByRole('dialog')).toBeNull()

    outside.remove()
  })
})
