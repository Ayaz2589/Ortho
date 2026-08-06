// @vitest-environment jsdom
// spec 041 US1 — first-run questionnaire stepper: Income is required before
// advancing; completing writes the profile + baseline and lands on the dashboard;
// "Skip — use neutral defaults" writes defaults and leaves.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const h = vi.hoisted(() => ({
  saveFinancialHealth: vi.fn((_args: unknown) => Promise.resolve()),
  replace: vi.fn(),
}))

vi.mock('@/lib/store', () => ({
  useApp: () => ({
    t: (k: string, ...a: unknown[]) => k.replace(/\{(\d+)\}/g, (_: string, i: string) => String(a[Number(i)] ?? '')),
    currency: 'usd',
    rate: () => 1,
    formatMoney: (c: number) => `$${c}`,
    userFinancialProfile: null,
    userFixedCosts: [],
    userDimensionWeights: [],
    transactions: [],
    budgets: [],
    goals: [],
    goalContributions: [],
    saveFinancialHealth: h.saveFinancialHealth,
  }),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: h.replace, push: vi.fn() }) }))

import Page from '@/app/(app)/welcome/financial-profile/page'

beforeEach(() => {
  h.saveFinancialHealth.mockClear()
  h.replace.mockClear()
  localStorage.clear()
})
afterEach(cleanup)

describe('Financial Health onboarding stepper', () => {
  it('blocks advancing past Income until an income is entered', async () => {
    const user = userEvent.setup()
    render(<Page />)
    expect(screen.getByText('Monthly take-home')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Continue' })).toHaveProperty('disabled', true)
    await user.type(screen.getByPlaceholderText('0.00'), '3000')
    expect(screen.getByRole('button', { name: 'Continue' })).toHaveProperty('disabled', false)
  })

  it('walks all five sections and writes the profile + snapshot on completion', async () => {
    const user = userEvent.setup()
    render(<Page />)
    await user.type(screen.getByPlaceholderText('0.00'), '3000')
    // Income → Housing → Commitments → Safety net → Weights
    for (const heading of ['Housing', 'Monthly commitments', 'Safety net', 'What matters to you']) {
      await user.click(screen.getByRole('button', { name: 'Continue' }))
      expect(screen.getByRole('heading', { name: heading })).toBeTruthy()
    }
    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'See my score' }))
    })
    await waitFor(() => expect(h.saveFinancialHealth).toHaveBeenCalledTimes(1))
    const arg = h.saveFinancialHealth.mock.calls[0][0] as { profile: { monthly_income_cents: number }; band: string }
    expect(arg.profile.monthly_income_cents).toBe(300000)
    expect(typeof arg.band).toBe('string')
    expect(h.replace).toHaveBeenCalledWith('/dashboard')
  })

  it('Skip writes neutral defaults, marks dismissal, and leaves', async () => {
    const user = userEvent.setup()
    render(<Page />)
    await user.type(screen.getByPlaceholderText('0.00'), '3000')
    await user.click(screen.getByRole('button', { name: 'Continue' })) // to Housing (skip visible)
    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'Skip — use neutral defaults' }))
    })
    await waitFor(() => expect(h.saveFinancialHealth).toHaveBeenCalledTimes(1))
    const arg = h.saveFinancialHealth.mock.calls[0][0] as { profile: { monthly_income_cents: number } }
    expect(arg.profile.monthly_income_cents).toBe(0) // neutral defaults
    expect(localStorage.getItem('ortho.fhOnboardingDismissed')).toBe('1')
    expect(h.replace).toHaveBeenCalledWith('/dashboard')
  })
})
