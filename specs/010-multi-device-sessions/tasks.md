# Tasks: Multi-Device Sessions + 30-Day Session Cap

**Input**: `/specs/010-multi-device-sessions/` (plan, spec, research, data-model, contracts, quickstart)
**Tests**: update the existing web sign-in test; run both suites. No new golden vectors (auth-only).
**Organization**: by user story (US1 P1 → US3 P3). Net-removal feature.

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: US1 — Remove the single-active-platform lock (P1) 🎯

**Goal**: iOS and web can be signed in at once; no client reads/claims/releases/yields the lock.
**Independent test**: sign in on both → neither bounces; `web/test/sign-in.test.tsx` green.

- [ ] T001 [US1] Web middleware: delete the `platform_locks` query + `lock==='ios'` signOut/redirect block
  in `web/proxy.ts` (keep the unauth → `/sign-in` redirect and the authed-on-`/sign-in` → `/dashboard`).
- [ ] T002 [US1] Web store: remove the `'web'` `platform_locks` upsert on bootstrap (`web/lib/store.tsx:~211`)
  and the `platform_locks` delete on sign-out (`~:837`).
- [ ] T003 [US1] Web sign-in: revert `web/app/sign-in/page.tsx` `verify()` to `verifyOtp` →
  `router.replace('/dashboard')` (drop the `'web'` lock upsert); remove the `iosActive` /
  `?reason=ios_active` banner + its `useSearchParams` usage if now unused.
- [ ] T004 [US1] Update `web/test/sign-in.test.tsx`: assert verify → navigates to `/dashboard` (and does
  NOT write a platform lock); drop the lock-claim assertions/mocks.
- [ ] T005 [P] [US1] iOS `App/AppState.swift`: remove the `platformLocksAPI.claim` at bootstrap (`~:1142`),
  the `.release` in `signOut()` (`~:968`), the `checkPlatformLockYield()` method (`~:1082`), and the
  `platformLocksAPI` accessor.
- [ ] T006 [P] [US1] iOS `Ortho_iOSApp.swift`: remove the foreground `checkPlatformLockYield()` call (`~:64`).
- [ ] T007 [US1] Delete `iOS/Ortho-iOS/Services/PlatformLocksAPI.swift` and any remaining references; ensure
  it compiles (the file is in a filesystem-synchronized group, so removal needs no pbxproj edit).
- [ ] T008 [US1] Leave the `platform_locks` table + `web/lib/types.ts` `PlatformLock` type in place (unused);
  no migration. (Optional: a comment noting it's retired-but-unused.)

**Checkpoint**: both build/compile; web suite green; manual concurrent sign-in works.

---

## Phase 2: US2 — 30-day session cap (P2)

**Goal**: sessions expire at 30 days → sign-in, via the server timebox; clients already handle it.
**Independent test**: config set; confirm the failed-refresh → sign-in paths exist on both clients.

- [ ] T009 [US2] Set `[auth.sessions] timebox = "720h"` in `supabase/config.toml` (uncomment + value).
- [ ] T010 [US2] Confirm (read-only) the existing expiry handling: iOS `AppState.resolveAuth`
  `refreshSession()` catch → `.signedOut`; web `proxy.ts` `getUser()` null → `/sign-in`. No code change;
  note in quickstart that production must enable the same timebox (the enforcement point).

**Checkpoint**: config in place; expiry paths confirmed.

---

## Phase 3: US3 — Parity doc (P3)

- [ ] T011 [US3] Update `PARITY.md`: change the "Single-active-platform lock" row to **removed — both
  platforms may be signed in at once**; add a **30-day max session (server timebox)** row (both clients
  sign out → sign-in on expiry); update the auth section prose + the matrix legend as needed.

---

## Phase 4: Verify + ship

- [ ] T012 Run `cd web && npm test` (green) and `npx tsc --noEmit` (clean).
- [ ] T013 Run `cd iOS && xcodebuild test -scheme Ortho-iOS` (green; compiles with PlatformLocks removed).
- [ ] T014 `cd web && npm run gen:vectors` → confirm no-op diff (no finance change).
- [ ] T015 Commit (spec + plan + tasks + code + PARITY.md) and push to `main`.

## Dependencies

- US1 web track (T001–T004) and iOS track (T005–T007) are independent ([P] across clients); T004 after T003.
- US2 (T009–T010) independent of US1.
- US3 (T011) after US1/US2 land (so the doc matches).
- Phase 4 after all stories.

## Notes

- Net-removal change; the main risk is iOS compilation after deleting `PlatformLocksAPI` — fix any leftover
  references. Commit after US1 (the behavioral core), then US2/US3/doc, or as one logical commit.
