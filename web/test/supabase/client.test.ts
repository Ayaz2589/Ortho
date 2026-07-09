// spec 021 — the browser Supabase client gets a native-only Keychain storage
// adapter (contracts/session-storage-adapter.md); desktop/mobile web keeps
// the default @supabase/ssr cookie-based path (`storage: undefined`).
import { describe, it, expect, beforeEach, vi } from 'vitest'

interface ClientOptions {
  auth: {
    storage?: { getItem: unknown; setItem: unknown; removeItem: unknown }
    autoRefreshToken?: boolean
    persistSession?: boolean
    detectSessionInUrl?: boolean
  }
}

const { createBrowserClient, isNativePlatform } = vi.hoisted(() => ({
  createBrowserClient: vi.fn((_url: string, _key: string, _options: ClientOptions) => ({
    auth: {},
  })),
  isNativePlatform: vi.fn(() => false),
}))

vi.mock('@supabase/ssr', () => ({ createBrowserClient }))
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform } }))
vi.mock('@/lib/test-build', () => ({ isTestBuild: () => false }))

import { createClient } from '@/lib/supabase/client'

describe('createClient — session storage adapter', () => {
  beforeEach(() => {
    createBrowserClient.mockClear()
    isNativePlatform.mockReturnValue(false)
  })

  it('passes storage: undefined on non-native platforms (keeps the default cookie path)', () => {
    isNativePlatform.mockReturnValue(false)
    createClient()
    const [, , options] = createBrowserClient.mock.calls[0]
    expect(options.auth.storage).toBeUndefined()
  })

  it('passes the Keychain adapter as storage on the native (Capacitor) platform', () => {
    isNativePlatform.mockReturnValue(true)
    createClient()
    const [, , options] = createBrowserClient.mock.calls[0]
    const storage = options.auth.storage
    expect(storage).toBeDefined()
    expect(typeof storage!.getItem).toBe('function')
    expect(typeof storage!.setItem).toBe('function')
    expect(typeof storage!.removeItem).toBe('function')
  })

  it('always sets persistSession/autoRefreshToken and disables detectSessionInUrl', () => {
    createClient()
    const [, , options] = createBrowserClient.mock.calls[0]
    expect(options.auth.persistSession).toBe(true)
    expect(options.auth.autoRefreshToken).toBe(true)
    expect(options.auth.detectSessionInUrl).toBe(false)
  })
})
