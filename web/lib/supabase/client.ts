import { createBrowserClient } from '@supabase/ssr'
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js'
import { Capacitor } from '@capacitor/core'
import { isTestBuild } from '@/lib/test-build'
import { effectiveUseTestData, readFlags } from '@/lib/flags'
import { createMemoryClient } from '@/lib/testdata/memory-client'
import { keychainStorageAdapter } from '@/lib/auth/keychainStorage'

// spec 021: on the Capacitor iOS build the Supabase session MUST persist in the
// Keychain — a WKWebView's cookie/localStorage is best-effort and gets evicted
// (contracts/session-storage-adapter.md). We cannot get there through
// @supabase/ssr's `createBrowserClient`: it *discards* a caller-provided
// `auth.storage`. It builds its own `document.cookie`-backed adapter and spreads
// it AFTER `...options.auth`, so last-key-wins clobbers the Keychain adapter
// (verified in node_modules/@supabase/ssr/dist/main/createBrowserClient.js @
// 0.12.0). The session then landed in `https://localhost` WKWebView cookies that
// don't round-trip across the post-sign-in navigation, so the dashboard's client
// instance read no session and the app bounced straight back to /sign-in after a
// successful OTP verify.
//
// Raw `@supabase/supabase-js` `createClient` forwards `auth.storage` straight to
// GoTrueClient (`if (settings.storage) this.storage = settings.storage`), so the
// Keychain adapter is actually used. Cached as a module singleton — mirroring
// ssr's own `cachedBrowserClient` — so repeated `createClient()` calls (sign-in
// page, then the dashboard AppStateProvider) don't spawn duplicate GoTrueClients
// with duplicate auto-refresh tickers / navigator.locks contention.
let nativeClient: SupabaseClient | undefined

export function createClient() {
  // Test builds only: when "Use test data" (or "Bypass auth", which implies it)
  // is on, every read/write funnels through an in-memory seeded client, so
  // nothing touches the live backend (spec 015, contract C-TD-1). In production
  // `isTestBuild()` is a build-time `false`, so this branch dead-code-eliminates.
  if (isTestBuild() && typeof window !== 'undefined' && effectiveUseTestData(readFlags())) {
    return createMemoryClient() as unknown as ReturnType<typeof createBrowserClient>
  }

  // Missing build-time env falls back to placeholders instead of throwing:
  // Vercel PREVIEW builds have no NEXT_PUBLIC_SUPABASE_* (Production-scoped
  // vars), and the static-export prerender constructs this client while
  // rendering every (app) page — the '!' assertions killed every preview
  // deploy at "Generating static pages". Same pattern as the Capacitor iOS
  // CI build (ci-placeholder.supabase.co). A placeholder bundle renders but
  // can't sign in; scope real values to Preview in Vercel for live previews.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://env-missing.supabase.co'
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'sb_publishable_env_missing'

  // Capacitor iOS: raw supabase-js so `auth.storage` (Keychain) is honored.
  if (Capacitor.isNativePlatform()) {
    if (!nativeClient) {
      nativeClient = createSupabaseClient(url, key, {
        auth: {
          storage: keychainStorageAdapter,
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
          // Match @supabase/ssr's browser default so the OTP/magic-link
          // code-verifier storage stays consistent across build targets.
          flowType: 'pkce',
          // storageKey intentionally omitted: supabase-js derives
          // `sb-<ref>-auth-token` from the URL — identical to what @supabase/ssr
          // defaults to on web, so the session key never diverges between targets.
        },
      })
    }
    return nativeClient as unknown as ReturnType<typeof createBrowserClient>
  }

  // Desktop / mobile web: unchanged @supabase/ssr cookie path (normal-origin
  // cookies persist fine in a real browser, so no Keychain is needed there).
  return createBrowserClient(url, key, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  })
}
