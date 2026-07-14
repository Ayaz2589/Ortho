// spec 021 — the Supabase client's session-storage backend is chosen by
// platform. @supabase/ssr's createBrowserClient DISCARDS a caller-provided
// auth.storage — it builds its own document.cookie adapter and spreads it after
// ...options.auth, so it clobbers the Keychain adapter. That put the native
// session in evictable WKWebView cookies at https://localhost, which don't
// round-trip across the post-sign-in navigation, so the dashboard's client read
// no session and the app bounced back to /sign-in after a successful OTP verify.
// The Capacitor build therefore uses raw @supabase/supabase-js createClient
// (which forwards auth.storage to GoTrueClient → the Keychain is actually used);
// desktop/mobile web keeps the @supabase/ssr cookie path unchanged.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

interface ClientOptions {
  auth: {
    storage?: unknown
    autoRefreshToken?: boolean
    persistSession?: boolean
    detectSessionInUrl?: boolean
    flowType?: string
  }
}

// Typed params so `mock.calls[0][2]` is a known tuple element — vitest strips
// types, but CI runs `tsc --noEmit` over test/** and an untyped vi.fn() infers
// a zero-arg tuple ('has no element at index 2').
const { createBrowserClient, createSupabaseClient, isNativePlatform } = vi.hoisted(() => ({
  createBrowserClient: vi.fn((_url: string, _key: string, _options: ClientOptions) => ({ mock: 'ssr' })),
  createSupabaseClient: vi.fn((_url: string, _key: string, _options: ClientOptions) => ({ mock: 'supabase-js' })),
  isNativePlatform: vi.fn((): boolean => false),
}))

vi.mock('@supabase/ssr', () => ({ createBrowserClient }))
vi.mock('@supabase/supabase-js', () => ({ createClient: createSupabaseClient }))
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform } }))
vi.mock('@/lib/test-build', () => ({ isTestBuild: () => false }))

describe('createClient — session storage backend (spec 021)', () => {
  beforeEach(() => {
    vi.resetModules() // reset the native-client singleton between cases
    createBrowserClient.mockClear()
    createSupabaseClient.mockClear()
    isNativePlatform.mockReset()
    isNativePlatform.mockReturnValue(false)
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://ref.supabase.co')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key')
  })
  afterEach(() => vi.unstubAllEnvs())

  it('web: uses @supabase/ssr createBrowserClient with the default cookie path (storage undefined)', async () => {
    isNativePlatform.mockReturnValue(false)
    const { createClient } = await import('@/lib/supabase/client')

    createClient()

    expect(createSupabaseClient).not.toHaveBeenCalled()
    expect(createBrowserClient).toHaveBeenCalledTimes(1)
    const [, , options] = createBrowserClient.mock.calls[0]
    expect(options.auth.storage).toBeUndefined()
    expect(options.auth.persistSession).toBe(true)
    expect(options.auth.autoRefreshToken).toBe(true)
    expect(options.auth.detectSessionInUrl).toBe(false)
  })

  it('native: uses raw supabase-js createClient with the Keychain adapter (ssr would discard it)', async () => {
    isNativePlatform.mockReturnValue(true)
    const { createClient } = await import('@/lib/supabase/client')
    const { keychainStorageAdapter } = await import('@/lib/auth/keychainStorage')

    createClient()

    expect(createBrowserClient).not.toHaveBeenCalled()
    expect(createSupabaseClient).toHaveBeenCalledTimes(1)
    const [, , options] = createSupabaseClient.mock.calls[0]
    // The whole fix: auth.storage is the Keychain adapter (referential identity),
    // so the session is written where the next client instance can read it back.
    expect(options.auth.storage).toBe(keychainStorageAdapter)
    expect(options.auth.persistSession).toBe(true)
    expect(options.auth.autoRefreshToken).toBe(true)
    expect(options.auth.detectSessionInUrl).toBe(false)
  })

  it('native: caches a single client across repeated createClient() calls', async () => {
    isNativePlatform.mockReturnValue(true)
    const { createClient } = await import('@/lib/supabase/client')

    const a = createClient()
    const b = createClient()

    expect(createSupabaseClient).toHaveBeenCalledTimes(1)
    expect(a).toBe(b)
  })
})
