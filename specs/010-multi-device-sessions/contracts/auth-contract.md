# Auth Contract — Multi-Device Sessions + 30-Day Cap

Both clients (iOS canonical, web mirror) MUST satisfy these identically. Behavioral (runtime) contracts —
no golden vectors (auth is not pure-function logic).

## C1 — Concurrent multi-device sign-in

A person may hold a valid session on iOS and web at the same time. Signing in on one client MUST NOT
invalidate or sign out the other. Neither client reads, writes, or yields to a single-active-platform
lock. Signing out on one client MUST leave the other signed in.

## C2 — 30-day absolute session cap

A session is valid for at most 30 days from sign-in. After 30 days it MUST be treated as expired; the next
launch / navigation / token refresh on either client MUST sign the person out and present the sign-in
screen. A subsequent sign-in starts a new session and a fresh 30-day window. Enforcement is the auth
provider's server-side session timebox (`720h`); the clients surface it via their existing
failed-refresh → signed-out handling.

## C3 — Unchanged auth behavior (reaffirmed)

- 8-digit email-OTP sign-in flow is unchanged on both clients.
- A valid (<30-day) stored session restores to the person's data on cold launch (no sign-in flash) — the
  feature-008 behavior is preserved.
- An unusable/refused session lands the person on sign-in cleanly (now also the 30-day-expiry path).

## Contract test mapping

| Contract | Web | iOS |
|---|---|---|
| C1 multi-device | `proxy.ts` no longer redirects on a peer session; `store.tsx` claims/releases nothing; `test/sign-in.test.tsx` asserts verify → `/dashboard` with no lock write | `AppState` no claim/release/yield; build green |
| C2 30-day cap | server timebox 720h; `proxy.ts` `getUser()` null → `/sign-in` on expiry (quickstart) | server timebox 720h; `resolveAuth` `refreshSession()` throw → `.signedOut` (quickstart) |
| C3 unchanged | OTP + restore unchanged | OTP + restore unchanged |
