// @vitest-environment jsdom
// Vercel PREVIEW deploys build with NO NEXT_PUBLIC_SUPABASE_* (the vars are
// Production-scoped), and the static-export prerender constructs the client
// while rendering every (app) page — an env-less build must therefore still
// produce a client (the Capacitor iOS CI proves placeholder builds work).
// Repro before the fix: `next build` with no env died prerendering
// /settings/household with "@supabase/ssr: Your project's URL and API key are
// required to create a Supabase client!".
import { describe, it, expect, afterEach, vi } from 'vitest'

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }))

import { createClient } from '@/lib/supabase/client'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('createClient without build-time env (preview/prerender safety)', () => {
  it('falls back to placeholders instead of throwing', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', undefined)
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', undefined)
    expect(() => createClient()).not.toThrow()
    expect(createClient()).toBeTruthy()
  })

  it('still uses the real env when present', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://real.supabase.co')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'sb_publishable_real')
    expect(() => createClient()).not.toThrow()
  })
})
