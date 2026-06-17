# Phase 0 Research — Decisions

## R1 — Remove the single-active-platform lock (both clients)

**Finding**: The "one active platform" guarantee is enforced by the `platform_locks` table:
- Web: `proxy.ts:46-61` reads the lock and, if `platform === 'ios'`, signs the user out + redirects to
  `/sign-in?reason=ios_active`; `store.tsx:211` claims `'web'` on bootstrap and `:837` releases on
  sign-out; `sign-in/page.tsx verify()` claims `'web'` (added in the sign-in fix to beat the middleware).
- iOS: `AppState.swift` claims `'ios'` on bootstrap (`:1142`), releases on sign-out (`:968`), and yields on
  foreground via `checkPlatformLockYield()` (`:1082`, called from `Ortho_iOSApp.swift:64`); the API is
  `Services/PlatformLocksAPI.swift`.

**Decision**: Remove all of it from both clients so neither reads/claims/releases/yields. Keep the
`platform_locks` table and the `PlatformLock` TS type in place but unused — **no migration** (zero schema
risk, fully reversible if the guarantee is ever wanted back). Removing the web middleware block also makes
the `verify()` lock-claim and the `?reason=ios_active` banner dead, so those are reverted/removed too.

**Result**: iOS and web sessions become fully independent — concurrent sign-in allowed, and signing out
one does not touch the other.

## R2 — 30-day cap via server-side session timebox

**Finding**: Sessions today renew indefinitely (Supabase access token `jwt_expiry = 3600`, refresh token
auto-renews — `config.toml:160`). There is no maximum session age. Supabase supports an absolute session
**timebox** (`[auth.sessions] timebox`, commented at `config.toml:267`).

**Decision** (chosen with the user): enforce the 30-day cap with the **server-side timebox = `720h`**
rather than client-side bookkeeping. Set it in `supabase/config.toml`, and enable the same on the
**production project** (dashboard → Auth → Sessions → *Time-box user sessions*, or `supabase config push`)
— that production setting is the real enforcement; local config + code alone cannot cap a production
session. Rationale over a client-side timestamp: server-enforced (cannot be bypassed by clearing local
storage), no fragile per-client clock/bookkeeping, and **no new client login code** — the clients already
sign out on a rejected refresh.

**Result**: after 30 days the refresh token is rejected; the next launch / navigation / refresh on either
client surfaces that as a return to the sign-in screen via existing handling (R3-confirmed).

## R3 — The clients already surface an expired session (no new code)

**Finding**: Feature 008 made both clients fail safe on an unusable session:
- iOS `AppState.resolveAuth` refreshes an expired access token and falls to `.signedOut` only when
  `refreshSession()` throws — exactly what a timeboxed-out session does.
- Web `proxy.ts` calls `getUser()`; an invalid/expired session returns no user → redirect to `/sign-in`.

**Decision**: rely on these existing paths to surface the 30-day expiry; add no new client login code for
the cap. **Confirm** both behaviors during verification (they are the mechanism, so they must hold). This
is why the cap needs no iOS/web code change — only the timebox config + the lock removal.
