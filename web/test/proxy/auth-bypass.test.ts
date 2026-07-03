// spec 015 — the server-side half of auth bypass (contract C-TD-4/C-FF-4).
// The proxy normally bounces a session-less request to /sign-in; on a test build
// the `ortho_bypass_auth` cookie lets it through, and in production the cookie is
// ignored so the gate is unchanged.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

// The proxy builds its own server client; force "no user" so the gate engages.
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: null }, error: null }) },
  }),
}))

import { proxy } from '@/proxy'

function request(path: string, cookie?: string) {
  const req = new NextRequest(new URL(`http://localhost${path}`))
  if (cookie) req.cookies.set('ortho_bypass_auth', cookie)
  return req
}

describe('proxy auth bypass', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon'
  })
  afterEach(() => vi.unstubAllEnvs())

  it('redirects a session-less request to /sign-in with no bypass cookie', async () => {
    const res = await proxy(request('/dashboard'))
    expect(res.headers.get('location')).toContain('/sign-in')
  })

  it('lets a session-less request through when the bypass cookie is set (test build)', async () => {
    const res = await proxy(request('/dashboard', '1'))
    expect(res.headers.get('location')).toBeNull()
  })

  it('ignores the bypass cookie in production', async () => {
    vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', 'production')
    const res = await proxy(request('/dashboard', '1'))
    expect(res.headers.get('location')).toContain('/sign-in')
  })
})
