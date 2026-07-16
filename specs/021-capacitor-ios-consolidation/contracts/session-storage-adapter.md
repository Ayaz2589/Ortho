# Contract: Supabase Session Storage Adapter

Replaces cookie-based session persistence with Keychain-backed storage on the Capacitor build only.
See `research.md` Decision 3 for the rationale.

## Interface

`supabase-js`'s documented non-browser storage contract — any object with these three
`Promise`-returning methods:

```ts
interface SupabaseAuthStorageAdapter {
  getItem(key: string): Promise<string | null>
  setItem(key: string, value: string): Promise<void>
  removeItem(key: string): Promise<void>
}
```

## Implementation: `web/lib/auth/keychainStorage.ts`

Delegates to `@aparajita/capacitor-secure-storage`'s Keychain-backed `getItem`/`setItem`/
`removeItem`. Wired into the Supabase client factory (`web/lib/supabase/client.ts`):

```ts
const supabase = createBrowserClient(url, anonKey, {
  auth: {
    storage: Capacitor.isNativePlatform() ? keychainStorageAdapter : undefined, // undefined => existing cookie path
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})
```

`storage: undefined` on desktop/mobile web is intentional — it preserves the existing
`@supabase/ssr` cookie-based path exactly as-is; this adapter is additive, not a replacement, for
non-Capacitor builds.

## Keychain accessibility class (implementation decision, not deferred to spec)

Use a `kSecAttrAccessible*ThisDeviceOnly` class so a fresh app install always starts a fresh session
(no silent credential survival across delete+reinstall) — consistent with how a user would expect
"delete and reinstall" to behave, and avoids surprising a QA/rollback flow (FR-021) with a
stale-looking signed-in state after reinstalling the frozen native app as a fallback.

## Liveness gap closed for the Capacitor build

Add an `@capacitor/app` `appStateChange` listener so foregrounding the app re-validates the session
the same way the native Swift app's launch-time `authStateChanges` subscription does today:

```ts
App.addListener('appStateChange', ({ isActive }) => {
  if (isActive) void supabase.auth.getSession()
})
```

This closes the documented (`docs/parity-audit-2026-07-02.md`) web-vs-iOS liveness gap specifically
for the Capacitor build, satisfying FR-003's "at least as reliably as the current native app" bar.
Desktop/mobile web's existing `onAuthStateChange`-only-on-`SIGNED_OUT` behavior is unchanged — this
listener is native-only, added alongside the storage adapter, not a global behavior change.

## Non-goals

- No change to the OTP sign-in flow itself (`signInWithOtp`/`verifyOtp`) — confirmed no browser
  hand-off/deep-link machinery is involved for the 8-digit code flow (research.md source report §5.3).
- No change to the 30-day session timebox — enforced server-side by Supabase Auth (GoTrue),
  identical regardless of client or storage adapter.
