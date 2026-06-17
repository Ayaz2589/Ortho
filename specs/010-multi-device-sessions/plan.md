# Implementation Plan: Multi-Device Sessions + 30-Day Session Cap

**Branch**: `010-multi-device-sessions` (working on `main`) | **Date**: 2026-06-17 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/010-multi-device-sessions/spec.md`

## Summary

Two auth changes, mirrored across iOS (canonical) and web:
1. **Remove the single-active-platform lock** so iOS and web can be signed in at once — strip every read /
   claim / release / yield of `platform_locks` from both clients (the table is kept, unused).
2. **Cap sessions at 30 days** via the auth provider's server-side **session timebox** (720h); the clients'
   existing failed-refresh → signed-out path (feature 008) surfaces the expiry as a return to sign-in.

No schema migration. The 8-digit OTP flow and valid-session restore are unchanged.

## Technical Context

**Language/Version**: TypeScript 5 / React 19 / Next.js 16 (web); Swift 5.9 / SwiftUI, iOS 17+ (iOS)

**Primary Dependencies**: web — Next App Router (`proxy.ts` middleware), `@supabase/ssr` + supabase-js;
iOS — supabase-swift (Auth), Observation (`@Observable AppState`)

**Storage**: Supabase Postgres. `platform_locks` table retained but no longer used. **No migration.**

**Auth config**: Supabase `[auth.sessions] timebox` in `supabase/config.toml` (currently commented at
`config.toml:267`) → set to `720h`. The production project must enable the same (dashboard → Auth →
Sessions → *Time-box user sessions*, or `supabase config push`). This setting is the enforcement point.

**Testing**: web — Vitest (`npm test`, Node ≥ 20.19/22.12); iOS — XCTest. The parity golden vectors are
finance-only and unaffected. The web `test/sign-in.test.tsx` (added in the sign-in fix) asserts the now-
removed `'web'` claim and must be updated.

**Target Platform**: iOS app + web app over one Supabase backend.

**Constraints**: Constitution (tokens-only, calm, test-first where logic changes); reconcile existing
behavior, no redesign; no schema change; keep the OTP flow intact.

**Scale/Scope**: ~9 FRs. Touches web `proxy.ts`, `lib/store.tsx`, `app/sign-in/page.tsx`,
`test/sign-in.test.tsx`, `lib/types.ts` (PlatformLock type now unused); iOS `App/AppState.swift`,
`Ortho_iOSApp.swift`, `Services/PlatformLocksAPI.swift`; `supabase/config.toml`; `PARITY.md`.

## Constitution Check

| Principle | Status | Notes |
|---|---|---|
| I. One Design System, Tokens Only | ✅ PASS | No new UI beyond removing the dead `ios_active` banner. |
| II. Calm Over Dense | ✅ PASS | Fewer surprise sign-outs = calmer. |
| III. Right Form Factor Per Canvas | ✅ PASS | No layout change. |
| IV. Plainspoken Voice & Money Formatting | ✅ PASS | Removes an alarmist "active on iOS" message; OTP copy unchanged. |
| V. Accessible & Interaction-Complete | ✅ PASS | Sign-in screen unchanged except a removed banner. |
| VI. Test-Driven & Regression-Safe | ✅ PASS | No finance/date logic changes; the only pure-logic delta is auth-flow code, covered by updating `sign-in.test.tsx` + running both suites. The 30-day cap is server-config; verified via the existing failed-refresh path + quickstart. |

**Result**: No violations. Net removal of code + one config line + doc update.

## Project Structure

### Documentation (this feature)

```text
specs/010-multi-device-sessions/
├── plan.md              # this file
├── research.md          # Phase 0 — decisions (R1–R3)
├── data-model.md        # Phase 1 — Session + retired lock
├── quickstart.md        # Phase 1 — how to validate
├── contracts/
│   └── auth-contract.md  # cross-client auth behavioral contract
├── checklists/requirements.md
└── tasks.md             # Phase 2
```

### Source Code (repository root)

```text
web/
├── proxy.ts                 # remove the platform_locks yield block (lines ~46-61)
├── lib/store.tsx            # remove the 'web' claim (:211-212) + release on sign-out (:837)
├── app/sign-in/page.tsx     # revert the 'web' claim in verify(); remove the ?reason=ios_active banner
├── test/sign-in.test.tsx    # update: no longer asserts a lock claim
└── lib/types.ts             # PlatformLock type becomes unused (leave or remove)

iOS/Ortho-iOS/
├── App/AppState.swift        # remove claim (:1142), release (:968), checkPlatformLockYield (:1082)
├── Ortho_iOSApp.swift        # remove the foreground checkPlatformLockYield() call (:64)
└── Services/PlatformLocksAPI.swift  # retire (delete the file + its references)

supabase/config.toml          # [auth.sessions] timebox = "720h"
PARITY.md                     # auth rows: lock removed + 30-day cap
```

**Structure Decision**: Existing mobile + web monorepo. Net deletion of the platform-lock machinery on
both clients, one Supabase config line, and a doc update. No new modules.

## Implementation Approach

**Story 1 — remove the single-active-platform lock**
- *Web*: in `proxy.ts`, delete the `if (user && !isAuthRoute && !isApiRoute) { … platform_locks … }` block
  (keep the unauth-redirect and the authed-on-/sign-in → /dashboard redirect). In `store.tsx`, delete the
  bootstrap `'web'` upsert and the sign-out `platform_locks` delete. In `sign-in/page.tsx`, revert
  `verify()` to plain `verifyOtp` → `router.replace('/dashboard')` (drop the lock upsert), and remove the
  `iosActive`/`?reason=ios_active` banner. Rewrite `test/sign-in.test.tsx` to assert verify → navigate
  (no lock claim).
- *iOS*: in `AppState.swift`, remove the `platformLocksAPI.claim` at bootstrap, the `.release` in
  `signOut()`, and the `checkPlatformLockYield()` method; in `Ortho_iOSApp.swift`, remove the foreground
  `checkPlatformLockYield()` call. Delete `Services/PlatformLocksAPI.swift`.
- The `platform_locks` table + the `PlatformLock` TS type are left in place (unused); RLS policies on the
  table are harmless. No migration.

**Story 2 — 30-day session cap**
- Set `[auth.sessions] timebox = "720h"` in `supabase/config.toml` (and document enabling it on the
  production project — the actual enforcement). No client code: iOS `resolveAuth` already → `.signedOut`
  when `refreshSession()` throws; web `proxy.ts` `getUser()` already → redirect `/sign-in` on an invalid
  session. Confirm both paths during verification.

**Story 3 — PARITY.md** (FR-009): update the auth rows/section.

## Complexity Tracking

> No Constitution violations. The only nuance is that the 30-day cap's true enforcement is a
> **production auth-provider setting** outside the codebase; the repo change is the local `config.toml`
> + documentation + confirming the clients already handle the resulting expiry. Called out in the spec
> Assumptions and the quickstart so it isn't mistaken for a pure-code guarantee.
