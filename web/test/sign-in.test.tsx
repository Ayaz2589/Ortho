// @vitest-environment jsdom
//
// Regression: after a successful OTP verify, the web sign-in must CLAIM the
// 'web' platform lock before navigating. The proxy middleware yields to an
// 'ios' lock (signs out + redirects to sign-in) and runs before the client
// store can claim 'web' — so without claiming here, a user whose last active
// platform was iOS verifies successfully and is then bounced straight back to
// sign-in. (See web/proxy.ts platform-lock check.)
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const h = vi.hoisted(() => ({
  replace: vi.fn(),
  refresh: vi.fn(),
  signInWithOtp: vi.fn(() => Promise.resolve({ error: null })),
  verifyOtp: vi.fn(() => Promise.resolve({ data: { user: { id: 'user-123' } }, error: null })),
  upsert: vi.fn((_payload?: unknown) => Promise.resolve({ error: null })),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: h.replace, refresh: h.refresh }),
  useSearchParams: () => ({ get: () => null }),
}))

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { signInWithOtp: h.signInWithOtp, verifyOtp: h.verifyOtp },
    from: (table: string) => ({
      upsert: (payload: unknown) => (table === 'platform_locks' ? h.upsert(payload) : Promise.resolve({ error: null })),
    }),
  }),
}))

import SignInPage from '@/app/sign-in/page'

describe('web sign-in', () => {
  beforeEach(() => vi.clearAllMocks())

  it('claims the web platform lock on verify, then navigates to /dashboard', async () => {
    const user = userEvent.setup()
    render(<SignInPage />)

    await user.type(screen.getByPlaceholderText('you@example.com'), 'me@example.com')
    await user.click(screen.getByRole('button', { name: /send code/i }))

    const codeInput = await screen.findByPlaceholderText('12345678')
    await user.type(codeInput, '12345678')
    await user.click(screen.getByRole('button', { name: /^verify$/i }))

    // The lock is claimed for web (so the proxy won't bounce us)...
    await waitFor(() =>
      expect(h.upsert).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'user-123', platform: 'web' }))
    )
    // ...and only then do we navigate to the app.
    expect(h.verifyOtp).toHaveBeenCalledWith(expect.objectContaining({ token: '12345678', type: 'email' }))
    expect(h.replace).toHaveBeenCalledWith('/dashboard')
  })

  it('does not navigate if the lock claim fails (avoids a silent bounce loop)', async () => {
    h.upsert.mockResolvedValueOnce({ error: { message: 'lock failed' } } as never)
    const user = userEvent.setup()
    render(<SignInPage />)

    await user.type(screen.getByPlaceholderText('you@example.com'), 'me@example.com')
    await user.click(screen.getByRole('button', { name: /send code/i }))
    const codeInput = await screen.findByPlaceholderText('12345678')
    await user.type(codeInput, '12345678')
    await user.click(screen.getByRole('button', { name: /^verify$/i }))

    await waitFor(() => expect(screen.getByText('lock failed')).toBeInTheDocument())
    expect(h.replace).not.toHaveBeenCalled()
  })
})
