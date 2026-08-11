// @vitest-environment jsdom
// spec 041 US3 — Settings → Financial profile: the form pre-fills from the stored
// profile, and saving persists updated answers (incl. a changed importance weight)
// plus a fresh baseline snapshot, then returns to Settings.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, waitFor, act, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const h = vi.hoisted(() => ({
  saveFinancialHealth: vi.fn((_args: unknown) => Promise.resolve()),
  push: vi.fn(),
}))

const profile = {
  id: 'p', user_id: 'u', monthly_income_cents: 400000, income_is_variable: false,
  income_low_estimate_cents: null, housing_type: 'rent', housing_cost_cents: 200000,
  housing_share_fraction: 1, savings_target_fraction: 0.1, emergency_fund_level: '1_3m',
  created_at: 'x', updated_at: 'x',
}

vi.mock('@/lib/store', () => ({
  useApp: () => ({
    t: (k: string, ...a: unknown[]) => k.replace(/\{(\d+)\}/g, (_: string, i: string) => String(a[Number(i)] ?? '')),
    currency: 'usd',
    rate: () => 1,
    formatMoney: (c: number) => `$${c}`,
    userFinancialProfile: profile,
    userFixedCosts: [],
    userDimensionWeights: [{ id: 'w', user_id: 'u', dimension: 'cash_flow', weight: 3, created_at: 'x' }],
    transactions: [],
    budgets: [],
    goals: [],
    goalContributions: [],
    saveFinancialHealth: h.saveFinancialHealth,
  }),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: h.push, replace: vi.fn() }) }))

import Page from '@/app/(app)/settings/financial-profile/page'

beforeEach(() => {
  h.saveFinancialHealth.mockClear()
  h.push.mockClear()
})
afterEach(cleanup)

describe('Financial Health settings page', () => {
  it('pre-fills the form from the stored profile', () => {
    render(<Page />)
    // 400000 cents at usd rate 1 → "4000"
    expect(screen.getByDisplayValue('4000')).toBeTruthy()
    expect(screen.getByDisplayValue('2000')).toBeTruthy() // housing cost 200000
  })

  it('saving persists an updated importance weight and records a snapshot, then returns to Settings', async () => {
    const user = userEvent.setup()
    render(<Page />)
    // Raise the Cash flow importance from 3 → 5.
    const cashFlowGroup = screen.getByRole('radiogroup', { name: 'Cash flow' })
    await user.click(within(cashFlowGroup).getByRole('radio', { name: '5 out of 5' }))
    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'Save profile' }))
    })
    await waitFor(() => expect(h.saveFinancialHealth).toHaveBeenCalledTimes(1))
    const arg = h.saveFinancialHealth.mock.calls[0][0] as {
      weights: Array<{ dimension: string; weight: number }>
      score: number
      band: string
    }
    expect(arg.weights.find((w) => w.dimension === 'cash_flow')?.weight).toBe(5)
    expect(typeof arg.score).toBe('number')
    expect(typeof arg.band).toBe('string')
    expect(h.push).toHaveBeenCalledWith('/settings')
  })

  it('renders a sixth Routine awareness weight control alongside the original five', () => {
    render(<Page />)
    expect(screen.getByRole('radiogroup', { name: 'Routine awareness' })).toBeTruthy()
  })

  it('saving a changed routine-awareness weight persists it', async () => {
    const user = userEvent.setup()
    render(<Page />)
    const group = screen.getByRole('radiogroup', { name: 'Routine awareness' })
    await user.click(within(group).getByRole('radio', { name: '5 out of 5' }))
    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'Save profile' }))
    })
    await waitFor(() => expect(h.saveFinancialHealth).toHaveBeenCalledTimes(1))
    const arg = h.saveFinancialHealth.mock.calls[0][0] as { weights: Array<{ dimension: string; weight: number }> }
    expect(arg.weights.find((w) => w.dimension === 'routine_awareness')?.weight).toBe(5)
  })
})
