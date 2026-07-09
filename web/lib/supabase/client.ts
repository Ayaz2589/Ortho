import { createBrowserClient } from '@supabase/ssr'
import { Capacitor } from '@capacitor/core'
import { isTestBuild } from '@/lib/test-build'
import { effectiveUseTestData, readFlags } from '@/lib/flags'
import { createMemoryClient } from '@/lib/testdata/memory-client'
import { keychainStorageAdapter } from '@/lib/auth/keychainStorage'

export function createClient() {
  // Test builds only: when "Use test data" (or "Bypass auth", which implies it)
  // is on, every read/write funnels through an in-memory seeded client, so
  // nothing touches the live backend (spec 015, contract C-TD-1). In production
  // `isTestBuild()` is a build-time `false`, so this branch dead-code-eliminates.
  if (isTestBuild() && typeof window !== 'undefined' && effectiveUseTestData(readFlags())) {
    return createMemoryClient() as unknown as ReturnType<typeof createBrowserClient>
  }
  // spec 021: on the Capacitor iOS build, persist the session in the Keychain
  // instead of the default cookie/localStorage path — a WKWebView's storage is
  // best-effort and can be evicted, unlike Keychain (contracts/session-storage-adapter.md).
  // `undefined` on desktop/mobile web preserves the existing @supabase/ssr cookie path exactly.
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: {
      storage: Capacitor.isNativePlatform() ? keychainStorageAdapter : undefined,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  })
}
