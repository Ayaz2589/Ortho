# Quickstart — Validating Multi-Device Sessions + 30-Day Cap

## Build / test

```bash
cd web && npm test          # Vitest (Node >= 20.19/22.12) — incl. updated sign-in.test.tsx
cd web && npx tsc --noEmit  # typecheck
cd iOS && xcodebuild test -scheme Ortho-iOS \
  -destination 'platform=iOS Simulator,id=C71B4B53-7775-48F4-A016-D0B051D6B937'
```

## Story 1 — concurrent iOS + web (lock removed)

- Code check: `web/proxy.ts` has no `platform_locks` query/redirect; `web/lib/store.tsx` has no
  `platform_locks` upsert/delete; `web/app/sign-in/page.tsx` `verify()` does `verifyOtp` →
  `router.replace('/dashboard')` with no lock write and no `?reason=ios_active` banner; iOS `AppState`
  has no `platformLocksAPI` use and `Ortho_iOSApp.swift` has no `checkPlatformLockYield()` call;
  `Services/PlatformLocksAPI.swift` is gone.
- `web/test/sign-in.test.tsx` passes (asserts verify → navigate, no lock claim).
- Manual: sign in on iOS, then sign in on web with the same account → both reach data, neither bounces.
  Sign out on web → iOS stays signed in.

## Story 2 — 30-day cap (server timebox)

- `supabase/config.toml` has `[auth.sessions] timebox = "720h"`.
- **Production**: confirm the project's *Time-box user sessions* = 720h (dashboard / `supabase config
  push`). This is the enforcement; without it the cap is not active in production.
- Behavior (already-present, confirm): iOS `AppState.resolveAuth` → `.signedOut` when `refreshSession()`
  throws; web `proxy.ts` `getUser()` null → redirect `/sign-in`. A >30-day session therefore lands on
  sign-in on next open. (Hard to exercise live without waiting 30 days or temporarily shortening the
  timebox; verified by the config + the existing failed-refresh path.)

## Story 3 — PARITY.md

- The auth rows read: single-active-platform lock **removed** (both platforms may be signed in at once);
  a **30-day max session (server timebox)** applies (both clients sign out → sign-in on expiry).

## Definition of done

- Web `npm test` green + `tsc` clean; iOS `xcodebuild test` green (compiles with PlatformLocks removed).
- `npm run gen:vectors` still a no-op (no finance change).
- Manual multi-device sign-in shows no forced sign-out between clients.
- `PARITY.md` updated.
