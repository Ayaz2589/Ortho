// @vitest-environment jsdom
//
// Web sign-in: a successful OTP verify navigates to /dashboard. Feature 010
// removed the single-active-platform lock, so verify() no longer writes a
// platform_locks row (it used to, to beat the middleware yield) — this test
// guards that the DB is not touched during verify.
//
// Spec 021: the sign-in page also now redirects away on mount when a user is
// already signed in (replaces the deleted `proxy.ts`'s `isAuthRoute` branch,
// unsupported under `output: 'export'`).
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

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

describe('web sign-in', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    h.getUser.mockResolvedValue({ data: { user: null }, error: null })
  })

  it('navigates to /dashboard on a successful OTP verify, with no platform-lock write', async () => {
    const user = userEvent.setup()
    render(<SignInPage />)

    await user.type(screen.getByPlaceholderText('you@example.com'), 'me@example.com')
    await user.click(screen.getByRole('button', { name: /send code/i }))

    const codeInput = await screen.findByPlaceholderText('12345678')
    await user.type(codeInput, '12345678')
    await user.click(screen.getByRole('button', { name: /^verify$/i }))

    await waitFor(() => expect(h.replace).toHaveBeenCalledWith('/dashboard'))
    expect(h.verifyOtp).toHaveBeenCalledWith(expect.objectContaining({ token: '12345678', type: 'email' }))
    // Single-active-platform lock removed (feature 010): verify must not hit the DB.
    expect(h.from).not.toHaveBeenCalled()
  })

  it('redirects to /dashboard on mount when a user is already signed in', async () => {
    h.getUser.mockResolvedValue({ data: { user: { id: 'user-already-in' } }, error: null })
    render(<SignInPage />)

    await waitFor(() => expect(h.replace).toHaveBeenCalledWith('/dashboard'))
  })

  it('does not redirect on mount when no user is signed in', async () => {
    render(<SignInPage />)

    await waitFor(() => expect(h.getUser).toHaveBeenCalled())
    expect(h.replace).not.toHaveBeenCalled()
  })

  // spec 021: a signed-out launch lands here, outside the (app) Shell whose
  // hide() dismisses the launchAutoHide:false splash. Without this the
  // Capacitor splash covers the sign-in screen forever (regression guard).
  it('hides the Capacitor splash on mount', async () => {
    render(<SignInPage />)

    await waitFor(() => expect(h.hide).toHaveBeenCalled())
  })
})
