// @vitest-environment jsdom
// spec 048 — the questionnaire's entry guard (FR-004), and the promises spec 042
// made that this feature must not undo (FR-007, FR-008).
//
// Why the guard is HERE and not at sign-in: app/sign-in/page.tsx renders outside
// AppStateProvider and cannot read userFinancialProfile, so it can only answer
// "did this device walk the funnel?". Whether the account already HAS a profile is
// answered at the destination, where useApp() is available. That split is why the
// spec separates FR-004 from FR-001.
//
// test/financial-health-onboarding.test.tsx is the spec 041/042 lock on the
// stepper itself and stays untouched (SC-006); this file covers only the guard.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const h = vi.hoisted(() => ({
  saveFinancialHealth: vi.fn((_args: unknown) => Promise.resolve()),
  replace: vi.fn(),
  app: {
    loading: false,
    userFinancialProfile: null as unknown,
  },
}))

vi.mock('@/lib/store', () => ({
  useApp: () => ({
    t: (k: string, ...a: unknown[]) =>
      k.replace(/\{(\d+)\}/g, (_: string, i: string) => String(a[Number(i)] ?? '')),
    currency: 'usd',
    rate: () => 1,
    formatMoney: (c: number) => `$${c}`,
    loading: h.app.loading,
    userFinancialProfile: h.app.userFinancialProfile,
    userFixedCosts: [],
    userDimensionWeights: [],
    transactions: [],
    budgets: [],
    goals: [],
    goalContributions: [],
    routines: [],
    saveFinancialHealth: h.saveFinancialHealth,
  }),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: h.replace, push: vi.fn() }) }))

import Page from '@/app/(app)/welcome/financial-profile/page'

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  h.app.loading = false
  h.app.userFinancialProfile = null
})
afterEach(cleanup)

describe('questionnaire entry guard — the account already has a profile (FR-004)', () => {
  it('sends them to the dashboard instead of asking again', async () => {
    h.app.userFinancialProfile = { id: 'p1' }
    render(<Page />)
    await waitFor(() => expect(h.replace).toHaveBeenCalledWith('/dashboard'))
  })

  it('renders nothing — the stepper must not flash before the bounce', () => {
    // Rendering a five-step questionnaire for one frame before redirecting is
    // exactly the un-calm moment Principle II rules out.
    h.app.userFinancialProfile = { id: 'p1' }
    render(<Page />)
    expect(screen.queryByRole('heading', { name: 'Financial health' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Skip for now' })).toBeNull()
  })

  it('writes nothing on the way out', async () => {
    h.app.userFinancialProfile = { id: 'p1' }
    render(<Page />)
    await waitFor(() => expect(h.replace).toHaveBeenCalled())
    expect(h.saveFinancialHealth).not.toHaveBeenCalled()
  })

  it('waits for the store to settle before deciding', async () => {
    // `null` must mean "no profile", never "not fetched yet". The (app) Shell
    // already gates children on loading, so this cannot happen today — the guard
    // reads `loading` anyway so it cannot silently invert if that gate moves.
    h.app.loading = true
    h.app.userFinancialProfile = { id: 'p1' }
    render(<Page />)
    await Promise.resolve()
    expect(h.replace).not.toHaveBeenCalled()
  })
})

describe('questionnaire entry guard — no profile yet (FR-011)', () => {
  it('renders the questionnaire and navigates nowhere', () => {
    render(<Page />)
    expect(screen.getByRole('heading', { name: 'Financial health' })).toBeTruthy()
    expect(screen.getByText('Monthly take-home')).toBeTruthy()
    expect(h.replace).not.toHaveBeenCalled()
  })

  it('keeps Skip dismiss-only — no profile written (FR-007)', async () => {
    // Spec 042 made Skip dismiss-only because a zero-income neutral-defaults write
    // produced a misleading score from no data. Reintroducing a hand-off must not
    // reintroduce that, so the promise is restated here at the guard's seam.
    const user = userEvent.setup()
    render(<Page />)
    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'Skip for now' }))
    })
    expect(h.saveFinancialHealth).not.toHaveBeenCalled()
    expect(h.replace).toHaveBeenCalledWith('/dashboard')
  })

  it('revives no dismissal key — the spec 041 onboarding gate stays retired', async () => {
    const user = userEvent.setup()
    render(<Page />)
    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'Skip for now' }))
    })
    expect(localStorage.getItem('ortho.fhOnboardingDismissed')).toBeNull()
  })
})
