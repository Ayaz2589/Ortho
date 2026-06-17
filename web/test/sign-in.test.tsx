// @vitest-environment jsdom
//
// Web sign-in: a successful OTP verify navigates to /dashboard. Feature 010
// removed the single-active-platform lock, so verify() no longer writes a
// platform_locks row (it used to, to beat the middleware yield) — this test
// guards that the DB is not touched during verify.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const h = vi.hoisted(() => ({
  replace: vi.fn(),
  refresh: vi.fn(),
  signInWithOtp: vi.fn(() => Promise.resolve({ error: null })),
  verifyOtp: vi.fn(() => Promise.resolve({ data: { user: { id: 'user-123' } }, error: null })),
  from: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: h.replace, refresh: h.refresh }),
}))

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { signInWithOtp: h.signInWithOtp, verifyOtp: h.verifyOtp },
    from: h.from,
  }),
}))

import SignInPage from '@/app/sign-in/page'

describe('web sign-in', () => {
  beforeEach(() => vi.clearAllMocks())

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
})
