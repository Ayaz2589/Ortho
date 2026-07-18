import { describe, it, expect } from 'vitest'
import { isLocalSupabaseUrl, checkSeedTarget } from './seed-guard'

describe('seed-corpus safe-target guard (spec 026, FR-009)', () => {
  it('recognizes local Supabase URLs', () => {
    expect(isLocalSupabaseUrl('http://localhost:54321')).toBe(true)
    expect(isLocalSupabaseUrl('http://127.0.0.1:54321')).toBe(true)
    expect(isLocalSupabaseUrl('http://[::1]:54321')).toBe(true)
    expect(isLocalSupabaseUrl('http://supabase.local')).toBe(true)
  })

  it('rejects hosted / remote URLs', () => {
    expect(isLocalSupabaseUrl('https://abcdefgh.supabase.co')).toBe(false)
    expect(isLocalSupabaseUrl('https://ortho.example.com')).toBe(false)
    expect(isLocalSupabaseUrl('not a url')).toBe(false)
  })

  it('allows local targets unconditionally', () => {
    expect(checkSeedTarget({ url: 'http://localhost:54321', overrideFlag: false, allowRemoteEnv: false })).toEqual({
      ok: true,
    })
  })

  it('refuses a non-local target without the double opt-in', () => {
    const r = checkSeedTarget({ url: 'https://abc.supabase.co', overrideFlag: false, allowRemoteEnv: false })
    expect(r.ok).toBe(false)
  })

  it('still refuses with only the flag OR only the env (needs BOTH)', () => {
    expect(checkSeedTarget({ url: 'https://abc.supabase.co', overrideFlag: true, allowRemoteEnv: false }).ok).toBe(false)
    expect(checkSeedTarget({ url: 'https://abc.supabase.co', overrideFlag: false, allowRemoteEnv: true }).ok).toBe(false)
  })

  it('allows a non-local target only with BOTH the flag and the env', () => {
    expect(checkSeedTarget({ url: 'https://abc.supabase.co', overrideFlag: true, allowRemoteEnv: true })).toEqual({
      ok: true,
    })
  })

  it('refuses when the URL is missing', () => {
    const r = checkSeedTarget({ url: undefined, overrideFlag: true, allowRemoteEnv: true })
    expect(r.ok).toBe(false)
  })
})
