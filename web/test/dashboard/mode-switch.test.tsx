// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@/lib/store', () => ({
  useApp: () => ({ t: (k: string) => k }),
}))

import { ModeSwitch } from '@/components/dashboard/ModeSwitch'

afterEach(cleanup)

describe('ModeSwitch', () => {
  it('renders two real buttons and marks the active one', () => {
    render(<ModeSwitch mode="overview" onChange={() => {}} />)
    const overview = screen.getByRole('button', { name: 'Overview' })
    const reports = screen.getByRole('button', { name: 'Reports' })
    expect(overview).toBeTruthy()
    expect(reports).toBeTruthy()
    // active state is exposed to assistive tech
    expect(overview.getAttribute('aria-pressed')).toBe('true')
    expect(reports.getAttribute('aria-pressed')).toBe('false')
  })

  it('calls onChange with the chosen mode', async () => {
    const onChange = vi.fn()
    render(<ModeSwitch mode="overview" onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: 'Reports' }))
    expect(onChange).toHaveBeenCalledWith('reports')
  })

  it('reflects the reports mode as active when selected', () => {
    render(<ModeSwitch mode="reports" onChange={() => {}} />)
    expect(screen.getByRole('button', { name: 'Reports' }).getAttribute('aria-pressed')).toBe(
      'true'
    )
  })
})
