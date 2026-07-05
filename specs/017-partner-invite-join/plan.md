# Implementation Plan: Partner Invite & Join

**Branch**: `017-partner-invite-join` | **Date**: 2026-07-05 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/017-partner-invite-join/spec.md`

## Summary

The second person of the two-person household finally signs in. Owners generate a one-time,
7-day invite code from Settings (copy/link on web, ShareLink on iOS) and can list/revoke
invites; the partner signs in with their own email OTP and joins — web via a pre-bootstrap
"Join with a code / Start fresh" choice (plus a `/join?code=` link), iOS via a Settings →
"Join a household" sheet (no bootstrap interception). During join the partner claims their
existing unclaimed roster Person (or creates one), so historical splits, paid-by, and
settle-up balances attribute to them instantly. Both apps then deterministically reopen the
joined household (persisted preference replaces the `.limit(1)` / first-row pick). A grafted
manual refresh (discreet control on web, `.refreshable` pull on the iOS ledger) re-invokes the
existing one-shot loaders so two live sessions can converge without relaunching.

**Zero backend schema changes** — rides `pending_invites`, `accept_invite(p_token)`,
the `role` enum, owner/member RLS policies, and `household_people.linked_user_id`, all shipped
in the v1 initial migration (`supabase/migrations/20260521120000_initial_schema.sql:57,500`).
**Zero golden-vector changes** — no money/date math is touched.

## Technical Context

**Language/Version**: TypeScript 5 (web, Next.js 16.2.9 / React 19.2.4, Node 22) + Swift 5 (iOS 26.2 target, SwiftUI, Observation)

**Primary Dependencies**: `@supabase/supabase-js` + `@supabase/ssr` (web), `supabase-swift` (iOS — first `.rpc()` call site in the app), Web Crypto (`crypto.getRandomValues`, `crypto.subtle.digest`) / CryptoKit (SHA256), SwiftUI `ShareLink`

**Storage**: existing hosted Supabase Postgres (project `brujhxmtzfgowimprueo`) — tables `pending_invites`, `household_members`, `household_people`, `households`; RPC `public.accept_invite(p_token text) returns uuid`. No migrations.

**Testing**: web — Vitest 4 (`cd web && npm test`, 731 baseline green), mocked store integration via `test/helpers/supabase-mock.ts` (already supports `rpc`/`rpcErrors`), `stubNoNetwork`, jsdom component suites; iOS — XCTest pure-logic only (spec-015 pattern, never a live AppState), auto-discovered by the filesystem-synchronized pbxproj (objectVersion 77 — **no pbxproj edits needed**), verified exclusively on GitHub Actions macOS CI.

**Target Platform**: web (compact→desktop responsive) + iOS. Linux sandbox builds/tests everything JS locally; iOS compile/test feedback only via `.github/workflows/ios-ci.yml` (batch all iOS work into ONE early push; budget 2 fix-up rounds; fallback ladder below).

**Project Type**: monorepo, two app surfaces over one backend

**Performance Goals**: join flow ≤ 3 min end-to-end (SC-001); refresh visible ≤ 10 s (SC-003); no new perf-sensitive paths (all reads reuse the existing bootstrap loaders)

**Constraints**: zero schema / zero vectors; hosted Supabase unreachable from the sandbox (network default-deny) → live verification ships as operator-runnable scripts (FR-026); ~35 new i18n strings ×6 languages ×both catalogs in the same change (catalog-parity lock); constitution II & VI non-negotiable

**Scale/Scope**: ~15 new/changed web files (store + 5 new components + route + scripts), ~6 new/changed iOS files (InvitesAPI, InviteCodec, 2 sheets + HouseholdView rows, AppState seams), 2 test-convention mirrors, PARITY.md + docs updates

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Principle | Status | How this plan complies |
|---|---|---|---|
| I | One Design System, Tokens Only | ✅ PASS | All new UI (invite card, join choice, claim picker, refresh control) composes existing primitives: web `FormGroup`/`FieldRow`/`SectionLabel`/`Drawer`/`PrimaryButton` + `globals.css` vars; iOS `AppTheme` + the `AddUserSheet`/`HouseholdView` row idioms. No new colors, no new type sizes. Status is text ("Pending · expires in 6 days"), never a colored badge. |
| II | Calm Over Dense (NON-NEGOTIABLE) | ✅ PASS | Invite area is one quiet Settings card + a small text list; errors are single calm sentences ("That code is invalid, already used, or expired."); the refresh control is a discreet icon button / native pull gesture — no banners, no spinner theater, no red. Failed refresh keeps data and says so plainly. |
| III | Right Form Factor Per Canvas | ✅ PASS | Web: drawer/modal + `/join` page + choice screen in the app shell; iOS: sheets with `presentationDetents`, ShareLink, `.refreshable`. Deliberate per-canvas divergence (web pre-bootstrap choice vs iOS Settings redeem) documented in PARITY.md (FR-029). |
| IV | Plainspoken Voice & Money Formatting | ✅ PASS | No money formatting is touched. Copy is second-person and plain ("Ask your partner for a code", "This code is shown only once"). All ~35 strings ship in 6 languages, both catalogs, same change. |
| V | Accessible & Interaction-Complete | ✅ PASS | Real `<button>`/labelled inputs, focus-visible rings (existing tokens), drawers/modals inherit the spec-audit focus traps, hit targets ≥40px, `aria-live` used for the one-time code reveal and refresh feedback. |
| VI | Test-Driven & Regression-Safe (NON-NEGOTIABLE) | ✅ PASS | Every behavior lands test-first: failing Vitest specs for codec, store invite/join/claim/refresh/bootstrap-choice, component specs for the new UI; amended (not weakened) bootstrap suites prove solo sign-in unchanged (FR-024/SC-004); iOS pure-logic XCTests mirror the codec convention with identical literal cases. No golden vector is generated or changed; the vector-drift CI gate stays green (SC-006). |

**Additional constraints check**: no new deps; no API routes (browser→Supabase direct, RLS is authz); one state layer per surface (store.tsx / AppState); optimistic-with-rollback mutations via the existing error banner / `dataError`; Next 16 `proxy.ts` (not middleware) gains only a `next=` redirect param; no production build while a dev server runs.

**Result: PASS — no Complexity Tracking entries required.**

## Project Structure

### Documentation (this feature)

```text
specs/017-partner-invite-join/
├── spec.md
├── plan.md              # this file
├── research.md          # Phase 0: decisions (code format, hashing convention, RPC nuances)
├── data-model.md        # Phase 1: entities, states, transitions
├── quickstart.md        # Phase 1: validation guide incl. operator-pending scripts
├── contracts/
│   ├── invite-code.md   # cross-surface code/canonicalization/hash convention (hand-mirrored)
│   └── store-api.md     # web store + iOS AppState/API surface contracts
├── checklists/requirements.md
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
web/
├── lib/
│   ├── invites.ts                    # NEW: pure invite-code codec (generate/canonicalize/hash/format) + status derivation
│   ├── store.tsx                     # MODIFIED: bootstrap choice + memberships(role) + persisted pick;
│   │                                 #   invites state + createInvite/revokeInvite; redeemInvite/startFresh/
│   │                                 #   claimPerson; needsPersonClaim gate; refresh(); pending_invites in loadAll
│   └── types.ts                      # MODIFIED: PendingInvite row type (+ MembershipRow helper type)
├── app/
│   ├── (app)/join/page.tsx           # NEW: /join?code=… confirm-and-redeem page (authed)
│   └── sign-in/page.tsx              # MODIFIED: honor safe ?next= after OTP verify
├── proxy.ts                          # MODIFIED: preserve original path+query as ?next= on the /sign-in redirect
├── components/
│   ├── HouseholdGate.tsx             # NEW: shell gate — "Join with a code / Start fresh" + claim-person step
│   ├── RefreshControl.tsx            # NEW: discreet refresh button (Sidebar footer + compact Transactions header)
│   └── settings/InviteCard.tsx       # NEW: owner-only invite card — create/one-time reveal/copy/link + status list + revoke
├── scripts/ops/
│   ├── invite-probe.ts               # NEW: [OPERATOR-PENDING] read-only hosted rails probe
│   └── invite-smoke.ts               # NEW: [OPERATOR-PENDING] live E2E — mint disposable partner via GoTrue admin, redeem real invite
└── test/
    ├── invites.test.ts               # NEW: codec unit tests (incl. the shared literal convention cases)
    ├── invite-flows.test.tsx         # NEW: mocked-store create/reveal/revoke/list statuses
    ├── join-flows.test.tsx           # NEW: bootstrap choice, redeem (ok/already-member/errors), claim picker, persisted pick
    ├── refresh.test.tsx              # NEW: refresh success atomicity / failure keeps data / no form clobber
    └── store.test.tsx (+ friends)    # AMENDED: solo-bootstrap suites updated for the choice screen (FR-024)

iOS/Ortho-iOS/
├── Services/InvitesAPI.swift         # NEW: fetch/create/revoke + redeem via .rpc("accept_invite") + role fetch
├── Services/HouseholdsAPI.swift      # MODIFIED: findOrCreate reads all memberships(+role), prefers persisted id, returns role
├── App/AppState.swift                # MODIFIED: role state; join/claim entry points; ensureAccountPerson gated to owner;
│                                     #   currentHouseholdID set on join; invites collection + mutations
├── Features/Settings/InviteSheet.swift     # NEW: create + one-time reveal + ShareLink/copy + pending list + revoke
├── Features/Settings/JoinHouseholdSheet.swift  # NEW: code entry → redeem → claim-person picker
├── Features/Settings/HouseholdView.swift  # MODIFIED: owner "Invite your partner" row + universal "Join a household" row
├── Features/Transactions/TransactionsView.swift  # MODIFIED: .refreshable → loadAllFromServer()
├── Shared/InviteCodec.swift          # NEW: canonicalize/hash/format/generate — hand-mirror of web/lib/invites.ts
└── Localizable.xcstrings             # MODIFIED: ~35 new keys ×6 languages

iOS/Ortho-iOSTests/
└── InviteCodecTests.swift            # NEW: pure-logic, identical literal cases to web/test/invites.test.ts

web/lib/i18n/{bn,es,ja,zh,ko}.ts      # MODIFIED: same ~35 keys (shared block for cross-surface keys)
PARITY.md, docs/web.md, docs/ios.md, docs/index.md  # MODIFIED: capability rows, divergence note, test counts
```

**Structure Decision**: both app surfaces change in place following each surface's canonical
layering (pure lib/codec → service/API → store/state → view). The only cross-surface artifact
is the **invite-code convention** (contracts/invite-code.md), hand-mirrored like the spec-014
ScanHeuristics tables and locked by identical literal test cases on both sides — deliberately
NOT a golden vector (no money/date math; keeps SC-006 "zero vector changes" true).

## Key design decisions (details in research.md)

1. **Code format & hashing (cross-surface contract)**: 10 chars from the Crockford base32
   alphabet (no I/L/O/U), displayed `XXXXX-XXXXX` (~50 bits). Canonical form = uppercase,
   `O→0`, `I→1`, `L→1`, strip non-alphanumerics. `token_hash` = lowercase hex SHA-256 of the
   canonical string; the canonical string is what's passed to `accept_invite` (whose
   `digest(p_token,'sha256')` must reproduce the stored hash). Both surfaces implement this
   identically; a code minted on either surface redeems on both.
2. **Bootstrap choice (web)**: `runBootstrap` no longer auto-creates on empty membership; it
   sets `membershipStatus='none'` and the shell's new `HouseholdGate` offers Join/Start-fresh.
   `startFresh()` performs today's exact create path (FR-024). Membership read drops
   `.limit(1)` for a full `household_id, role, created_at` read ordered by `created_at`;
   pick = `localStorage.preferredHouseholdId` if still a membership, else first row.
3. **Claim gating via role**: the account-person **auto-create** (`ensureAccountPersonAndFoldLegacy`
   on web, `ensureAccountPerson` inside `loadPeopleFromServer` on iOS) runs only when the
   user's role in the chosen household is `owner` (all existing users — behavior preserved).
   For `member` role with no linked person, the claim step is (re-)presented (FR-016);
   claiming = `UPDATE household_people SET linked_user_id = auth.uid()` guarded by
   `linked_user_id IS NULL` (0-rows-updated ⇒ lost race ⇒ picker refreshes), or a
   `createPerson` insert. The `unique(household_id, linked_user_id)` constraint backstops.
4. **Already-a-member redemption (FR-013)**: the RPC consumes the invite and no-ops the
   membership; the client detects "household already in my memberships" post-redeem and shows
   the calm already-a-member message (spec amended — pending state is not preservable without
   schema change).
5. **iOS bootstrap freeze**: `bootstrapUserSession` is not intercepted. The only
   bootstrap-adjacent diff is `HouseholdsAPI.findOrCreate` reading all memberships (+role),
   preferring the UserDefaults `currentHouseholdID`, and returning the role. Join success sets
   `currentHouseholdID` (existing persistence) and re-runs the standard load path.
6. **Refresh**: web `refresh()` re-invokes `loadAll` (already all-or-nothing: every read is
   `orThrow`n before any `setState`) with a separate `refreshing` flag — never the boot
   spinner; failure keeps data and surfaces the existing error banner. iOS adds `.refreshable`
   on the Transactions `List` awaiting the existing `loadAllFromServer()` seam. Controls: web
   Sidebar household footer (desktop) + compact Transactions header icon; both `aria-label`ed.
7. **Test-data mode (spec 015)**: memory client's `rpc()` returns `{data:null}` ⇒ redeem in
   test mode fails calmly (invalid-code path); invite create/revoke write-swallow like every
   other mutation. No isolation hole: flag-on sessions never reach the live backend.
8. **`/join` link survival**: `proxy.ts` appends `?next=<original path+query>` when bouncing
   to `/sign-in`; sign-in honors `next` only for same-origin relative paths (`/…`, not `//…`).

## iOS CI batching & fallback ladder

All iOS work lands as **one early push** (right after the web core is green locally), watched
via `GH_TOKEN=placeholder gh run watch --exit-status`; budget **2 fix-up rounds**. If the
budget exhausts: ship iOS **invite-create + code-redeem only** (InviteSheet + JoinHouseholdSheet
minus the claim picker), defer the claim picker as a documented fast-follow in tasks.md
`[DEFERRED]`, and record the temporary divergence in PARITY.md. The web surface is never
gated on iOS CI.

## Operator-pending verification (FR-026)

The sandbox cannot reach the hosted backend (default-deny network policy; only GitHub has a
path). Two scripts ship with the feature and are run by the operator from a networked host:

1. `web/scripts/ops/invite-probe.ts` — read-only: swagger root lists `pending_invites` +
   `rpc/accept_invite`; column probes for `household_people.linked_user_id`; exits non-zero
   with a plain report if any rail is missing.
2. `web/scripts/ops/invite-smoke.ts` — live E2E: service-role GoTrue admin mints a disposable
   `+invite-smoke` user, an invite is created for a scratch household, redeemed via the real
   RPC, the person-claim update is exercised, and everything is cleaned up. `DRY_RUN=1`
   supported; never touches non-scratch rows.

Until those run, verification rests on the mocked suites + test-data mode + static evidence
(the rails shipped in the v1 initial migration whose sibling tables the apps exercise daily).

## Complexity Tracking

> No constitution violations — table intentionally empty.
