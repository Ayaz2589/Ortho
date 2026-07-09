// @vitest-environment jsdom
//
// spec 021 — the splash screen is hidden manually after first meaningful
// paint (bootstrap finishing, not a fixed timer — capacitor.config.ts sets
// launchAutoHide: false), so a slow cold boot never shows a blank flash
// between the splash and real content.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { makeSupabaseMock, primeFxCache, stubNoNetwork } from '../helpers/supabase-mock'

const { hide } = vi.hoisted(() => ({ hide: vi.fn(() => Promise.resolve()) }))
vi.mock('@capacitor/splash-screen', () => ({ SplashScreen: { hide } }))

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }))
vi.mock('@/lib/supabase/client', () => ({ createClient }))

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }),
}))

import AppLayout from '@/app/(app)/layout'

describe('splash screen hide-after-first-paint', () => {
  beforeEach(() => {
    localStorage.clear()
    primeFxCache()
    stubNoNetwork()
    hide.mockClear()
    vi.stubGlobal('location', { ...window.location, assign: vi.fn() })
    const mock = makeSupabaseMock({
      authUser: { id: 'u-me', email: 'me@example.com' },
      tables: { users: [{ id: 'u-me', name: 'Me', initial: 'M', color_key: 'sage' }] },
    })
    createClient.mockReturnValue(mock.client)
  })

  it('hides the splash screen once bootstrap finishes loading', async () => {
    render(<AppLayout>{<div>content</div>}</AppLayout>)
    await waitFor(() => expect(hide).toHaveBeenCalled())
  })
})
