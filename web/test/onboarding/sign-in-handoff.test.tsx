// @vitest-environment jsdom
// spec 048 US1 — the hand-off, wired through the real sign-in form.
//
// test/sign-in.test.tsx is the spec 010/021-era regression lock and stays
// untouched (048 SC-006); this file states the same destinations as a *hand-off*
// requirement and adds the funnel-walker case it never had.
//
// Mirrors that file's hoisted-mock shape deliberately, so the two read alike.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { markFunnelEntry, readFunnelEntry } from '@/lib/onboarding/funnel'
import { hasSeenAnnouncement } from '@/components/announcements/announcementsSeen'
import { FINANCIAL_HEALTH_ANNOUNCEMENT_ID } from '@/components/announcements/registry'

const h = vi.hoisted(() => ({
  replace: vi.fn(),
  refresh: vi.fn(),
  signInWithOtp: vi.fn(() => Promise.resolve({ error: null })),
  verifyOtp: vi.fn(() => Promise.resolve({ data: { user: { id: 'user-123' } }, error: null })),
  from: vi.fn(),
  getUser: vi.fn(
    (): Promise<{ data: { user: { id: string } | null }; error: null }> =>
      Promise.resolve({ data: { user: null }, error: null })
  ),
  hide: vi.fn(() => Promise.resolve()),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: h.replace, refresh: h.refresh }),
}))

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { signInWithOtp: h.signInWithOtp, verifyOtp: h.verifyOtp, getUser: h.getUser },
    from: h.from,
  }),
}))

vi.mock('@capacitor/splash-screen', () => ({ SplashScreen: { hide: h.hide } }))

import SignInPage from '@/app/sign-in/page'

/** Drive the real two-step OTP form through to a successful verify. */
async function signIn() {
  const user = userEvent.setup()
  render(<SignInPage />)
  await user.type(screen.getByPlaceholderText('you@example.com'), 'me@example.com')
  await user.click(screen.getByRole('button', { name: /send code/i }))
  const codeInput = await screen.findByPlaceholderText('12345678')
  await user.type(codeInput, '12345678')
  await user.click(screen.getByRole('button', { name: /^verify$/i }))
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  h.getUser.mockResolvedValue({ data: { user: null }, error: null })
})

describe('sign-in hand-off — a funnel walker (US1)', () => {
  it('lands on the financial-health questionnaire instead of the dashboard', async () => {
    markFunnelEntry()
    await signIn()
    await waitFor(() => expect(h.replace).toHaveBeenCalledWith('/welcome/financial-profile'))
    expect(h.replace).not.toHaveBeenCalledWith('/dashboard')
  })

  it('consumes the marker, so signing in again goes to the dashboard', async () => {
    markFunnelEntry()
    await signIn()
    await waitFor(() => expect(h.replace).toHaveBeenCalledWith('/welcome/financial-profile'))
    expect(readFunnelEntry()).toBe(false)
  })

  it('suppresses the announcement that would offer the same questionnaire', async () => {
    markFunnelEntry()
    await signIn()
    await waitFor(() => expect(h.replace).toHaveBeenCalled())
    expect(hasSeenAnnouncement(FINANCIAL_HEALTH_ANNOUNCEMENT_ID)).toBe(true)
  })

  it('still refreshes after navigating, and still never touches the DB', async () => {
    markFunnelEntry()
    await signIn()
    await waitFor(() => expect(h.refresh).toHaveBeenCalled())
    expect(h.from).not.toHaveBeenCalled()
  })
})

describe('sign-in hand-off — everyone else is untouched (US2)', () => {
  it('lands on the dashboard when the device never walked the funnel', async () => {
    await signIn()
    await waitFor(() => expect(h.replace).toHaveBeenCalledWith('/dashboard'))
    expect(h.replace).not.toHaveBeenCalledWith('/welcome/financial-profile')
  })

  it("leaves the announcement unseen, so their 'what's new' popup still fires", async () => {
    // Spec 042 replaced spec 041's forced redirect with this announcement on
    // purpose. Marking it seen for a non-funnel user would silently rob them of
    // it — the exact way this feature's reversal could leak.
    await signIn()
    await waitFor(() => expect(h.replace).toHaveBeenCalledWith('/dashboard'))
    expect(hasSeenAnnouncement(FINANCIAL_HEALTH_ANNOUNCEMENT_ID)).toBe(false)
  })

  it('writes nothing to storage at all on the ordinary path', async () => {
    await signIn()
    await waitFor(() => expect(h.replace).toHaveBeenCalledWith('/dashboard'))
    expect(localStorage.length).toBe(0)
  })

  it('does not hand off a user who was already signed in, even with a marker set', async () => {
    // The mount bounce fires for someone who already had a session — by definition
    // not a newcomer. Routing it through the hand-off would let a stale per-device
    // marker greet a returning user with a questionnaire (FR-009).
    markFunnelEntry()
    h.getUser.mockResolvedValue({ data: { user: { id: 'user-already-in' } }, error: null })
    render(<SignInPage />)

    await waitFor(() => expect(h.replace).toHaveBeenCalledWith('/dashboard'))
    expect(h.replace).not.toHaveBeenCalledWith('/welcome/financial-profile')
    // The marker is left intact for a genuine sign-in later.
    expect(readFunnelEntry()).toBe(true)
    expect(hasSeenAnnouncement(FINANCIAL_HEALTH_ANNOUNCEMENT_ID)).toBe(false)
  })
})
