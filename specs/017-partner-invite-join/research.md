# Research: Partner Invite & Join (017)

All unknowns from Technical Context resolved. Each entry: Decision / Rationale / Alternatives.

## R1. Invite-code format & entropy

**Decision**: 10 characters drawn from the Crockford base32 alphabet
(`0123456789ABCDEFGHJKMNPQRSTVWXYZ` — excludes I, L, O, U), generated with
`crypto.getRandomValues` (web) / `SystemRandomNumberGenerator` via CryptoKit-adjacent
`SecRandomCopyBytes`-free Swift `UInt8.random(in:using:)` (iOS), displayed grouped
`XXXXX-XXXXX`.

**Rationale**: 32^10 = 2^50 ≈ 1.1e15 — unguessable online even with no rate limit on the RPC
(at a hostile 1k req/s, expected time-to-hit ≈ 18k years). Crockford's exclusions kill the
worst confusables; the two remaining (`0`/`O`, `1`/`I`/`L`) are handled by input
normalization (R2), which Crockford's own decode profile prescribes. 5 bits/char means
`getRandomValues` bytes map bias-free via `byte & 31`… (6.25 bits discarded per byte —
irrelevant). Human-typeable on a phone from a partner's message.

**Alternatives considered**: UUID token in the link only (not typeable on iOS Settings entry —
rejected); 6-char code (30 bits — too thin without rate limiting — rejected); words-based
(BIP39-style) codes (not localizable across 6 languages — rejected).

## R2. Canonicalization & hashing convention (the cross-surface contract)

**Decision**: `canonicalize(input)` = uppercase → map `O→0`, `I→1`, `L→1` → strip every
non-alphanumeric. `hash` = lowercase-hex SHA-256 over the canonical string's UTF-8 bytes.
The **canonical string** (not the pretty-printed form) is (a) what's hashed into
`pending_invites.token_hash` at creation, and (b) what's passed as `p_token` to
`accept_invite`, whose `encode(digest(p_token,'sha256'),'hex')` (pgcrypto) reproduces the
stored hex exactly. Implemented twice — `web/lib/invites.ts` and
`iOS/Ortho-iOS/Shared/InviteCodec.swift` — with **identical literal test cases** in both
suites (the spec-014 ScanHeuristics convention-mirror pattern), NOT a golden vector.

**Rationale**: pgcrypto's `digest(text,'sha256')` hashes the exact bytes it is given and
`encode(…,'hex')` emits lowercase — Web Crypto `subtle.digest('SHA-256', bytes)` and CryptoKit
`SHA256.hash(data:)` produce the same 32 bytes, so hex-lowercase everywhere makes the three
implementations byte-compatible. Canonicalizing on BOTH create and redeem means a code minted
on web redeems on iOS and vice versa regardless of how the user types it. Keeping it out of
`shared/test-vectors/` preserves SC-006 (zero vector changes) and the vectors' "money/date
math only" charter.

**Alternatives considered**: hash the pretty format with dash (one stray keyboard dash breaks
redemption — rejected); raw token as `p_token` without canonicalization (case-sensitivity
footgun across keyboards — rejected); adding an eighth golden vector (violates the vector
charter and the zero-vector claim — rejected).

## R3. `accept_invite` RPC semantics (verified from migration source)

**Decision**: treat the RPC as-is; no backend change. Client behavior derived from
`supabase/migrations/20260521120000_initial_schema.sql:500-537`:

- Requires an authenticated caller (`auth.uid()` re-check) — safe to expose in UI.
- Fails with `raise exception 'Invite is invalid, redeemed, or expired'` for unknown/expired/
  redeemed hashes → surfaces to supabase-js as an error whose message we map to the single
  calm string (FR-012's "no probing" requirement is satisfied by the RPC's own single
  message).
- Idempotent membership insert (`on conflict do nothing`) + unconditional
  `redeemed_at = now()` → an already-member redeemer consumes the code with no membership
  change (FR-013 as amended). Client detects this by checking whether the returned
  `household_id` was already in its membership list before the call.
- Returns the joined `household_id` (uuid) — used to set the persisted preference and load
  the household.
- `security definer` + `grant execute to authenticated` — the joiner needs NO other grants;
  RLS opens up automatically once the membership row exists (`is_household_member`).

**Rationale**: zero-DDL is the feature's crispest deploy property; every needed behavior is
already in the shipped function.

**Alternatives considered**: new `create_invite`/`revoke_invite` RPCs for symmetry (needs a
migration — rejected tonight); pre-checking invite validity client-side (impossible — SELECT
on `pending_invites` is owner-only by RLS, and that's correct).

## R4. Invite creation & revocation writes (RLS-verified)

**Decision**: plain PostgREST writes from the owner's session:
`insert into pending_invites {household_id, role:'member', token_hash, expires_at: now+7d,
created_by: auth.uid()}` and `delete from pending_invites where id = …`. Listing rides a new
`pending_invites` select in `loadAll` (web) / `InvitesAPI.fetch` (iOS).

**Rationale**: the v1 policies (`initial_schema.sql:326-338`) are exactly
owner-select/owner-insert/owner-delete — members receive zero rows (calm empty list; the UI
additionally hides the card for non-owners via role, FR-004). No UPDATE policy exists —
"revoke" is honestly a delete (spec Assumptions).

**Alternatives considered**: soft-revoke via `expires_at` update (no UPDATE policy — rejected
without DDL); surfacing invites to members read-only (RLS forbids; also not in spec).

## R5. Web bootstrap restructure (choice, role, persisted pick)

**Decision**: `runBootstrap` reads **all** memberships
(`.select('household_id, role, created_at').order('created_at')`, no `.limit(1)`), then:
membership list empty → `membershipStatus='none'`, stop (no writes), `HouseholdGate` renders;
non-empty → pick `localStorage['preferredHouseholdId']` when it's still a membership, else
first row; stash `currentRole` from the picked row; run the person auto-create **only when
`currentRole==='owner'`**; `loadAll` as today (+ `pending_invites` as a 12th parallel read).
`startFresh()` = exactly today's create block (uuid household + owner membership +
`ensureAccountPersonAndFoldLegacy` + `loadAll`), then sets the preference.
`redeemInvite(code)` = canonicalize → `rpc('accept_invite')` → error→calm map / success→
already-member check → set preference → reload memberships → claim step if needed.
`claimPerson(id | {name,color})` = guarded update (`.is('linked_user_id', null)`) or insert →
refresh people. `needsPersonClaim` = signed-in ∧ member-role ∧ no person linked to me.

**Rationale**: verified against `web/lib/store.tsx:244-329` — the auto-create at 304-316 is
cleanly separable into `startFresh`; the `.limit(1)` at 291 is the household roulette the
spec kills (FR-018). Role-gating the auto-create is what makes the claim step reachable at
all (otherwise `ensureAccountPersonAndFoldLegacy:365-386` would insert a duplicate Person for
every joiner) while leaving every existing user (always `owner` of their own household)
byte-identically on the old path (FR-024).

**Alternatives considered**: intercepting at the page/router level instead of the store
(splits household state across layers — violates the one-state-layer boundary); a separate
`/onboarding` route (the gate must also re-present mid-claim on any route — shell gate is
strictly more correct).

## R6. `/join` link through the auth gate

**Decision**: `proxy.ts` bounce to `/sign-in` carries `?next=<encodeURIComponent(pathname+search)>`;
the sign-in page, after `verifyOtp`, `router.replace(next)` only when `next` starts with `/`
and not `//` (else `/dashboard`). `/join/page.tsx` lives inside `(app)` (authed), reads
`?code=`, pre-fills confirm-and-join UI; if the user is mid-choice (`membershipStatus==='none'`)
the gate itself consumes the code as its Join pre-fill.

**Rationale**: verified `proxy.ts:43-47` (plain redirect today, loses path) and
`app/sign-in/page.tsx:52` (hard-coded `/dashboard`). The open-redirect guard is the standard
relative-path allowlist.

**Alternatives considered**: cookie-stashed pending code (more state, worse debuggability);
making `/join` an unauthenticated route that stores the code then bounces (needless split of
the redeem flow).

## R7. iOS integration seams (explorer-verified)

**Decision**:
- `HouseholdsAPI.findOrCreate` (Services/HouseholdsAPI.swift:26-65) reads all membership rows
  (`household_id, role`, ordered), prefers the UserDefaults `currentHouseholdID`
  (AppState.swift:98-109 — existing persistence), returns `(id, name, role)`. This is the ONLY
  bootstrap-adjacent change; `bootstrapUserSession` (1231-1300) is otherwise frozen.
- `ensureAccountPerson` call inside `loadPeopleFromServer` (AppState.swift:475-493) is gated
  on `currentRole == .owner` — the iOS mirror of R5's claim-step enabler.
- New `Services/InvitesAPI.swift` (CardsAPI struct pattern): `fetch(householdID:)`,
  `create(row)`, `revoke(id:)`, `redeem(canonicalToken:) -> UUID` — the app's first
  `.rpc("accept_invite", params: ["p_token": …])` call.
- Join success: set `currentHouseholdID = joined` (persists via didSet), refetch
  household name + role, `loadAllFromServer()` (460-472), then claim sheet when
  `role == .member` ∧ no linked person.
- `.refreshable { await appState.loadAllFromServer() }` on the Transactions `List`
  (TransactionsView.swift:328 — native List, `.listStyle(.plain)`) — replaces at completion
  per collection (the existing seam's semantics; consistent when the gesture's await returns).
- New source/test files need **no pbxproj edits** (objectVersion 77 filesystem-synchronized
  groups, explorer-verified) — this removes the historically riskiest iOS step.
- Test-data mode: every new AppState mutation guards `!testDataEnabled` like
  AppState.swift:282/296/311 et al.

**Rationale**: smallest reviewable iOS diff that still ships all four P1 stories; every seam
named here was verified by line number tonight.

**Alternatives considered**: iOS pre-bootstrap join interception (explicitly cut — bricking
risk on the CI-only surface); making iOS refresh atomic-swap (touches the bootstrap loader
shared with `-uiDemo`; deferred with a note in PARITY.md).

## R8. Refresh placement & semantics (web)

**Decision**: one `refresh()` store method — guards `household != null`, sets
`refreshing=true` (never the boot `loading`), re-reads the household name (display-only,
non-fatal) then awaits `loadAll`; on throw, `setError` and keep data. Controls:
`RefreshControl` icon button in the Sidebar household footer (desktop ≥640px) and in the
compact Transactions page header; `aria-label="Refresh"`, `aria-live="polite"` "Updated"
announcement, disabled while in flight.

**Rationale**: `loadAll` (store.tsx:407-480) is already all-or-nothing — every read is
`orThrow`n (436-438) before the first `setState` (440) — so FR-021's atomic swap is free on
web. A failed refresh throws before any state mutation: prior data provably intact.
Sidebar footer is the only persistent desktop chrome (Sidebar.tsx:66-92); compact web mirrors
iOS by putting the affordance on the activity surface.

**Alternatives considered**: refetch-on-focus (explicitly out of scope — manual by design,
FR-022); a global header bar (no such chrome exists on web — inventing one for a button
violates calm-over-dense).

## R9. Test strategy per layer

**Decision**:
- **Codec (pure)**: `web/test/invites.test.ts` — format/entropy/canonicalize/hash, plus the
  shared literal cases table (e.g. `canonical("abcde-23456") = "ABCDE23456"`,
  `sha256hex("ABCDE23456") = <fixed>`); `InviteCodecTests.swift` asserts the SAME literals.
- **Store flows (mocked)**: `makeSupabaseMock` with `tables['household_members']` carrying
  `role`/`created_at`, `rpc: {accept_invite: '<uuid>'}` / `rpcErrors` for the failure paths;
  render the REAL `AppStateProvider`; `stubNoNetwork` + `primeFxCache` as house style.
  Bootstrap-choice, redeem, claim (incl. lost-race 0-rows), persisted-pick, refresh
  (success/failure/form-preservation), invite create/reveal-once/revoke.
- **Amended suites**: existing bootstrap tests that assert auto-create for a fresh user are
  amended to assert the choice screen, and `startFresh()` is asserted to produce today's exact
  insert sequence (FR-024/SC-004 traceability).
- **i18n**: the catalog-parity suite automatically enforces the ~35 new keys on both catalogs;
  render-locale checks extend to the gate + invite card.
- **iOS**: pure-logic only (`InviteCodecTests`) — no live AppState (spec-015 lesson); UI
  verified by CI compile + `-uiDemo` screenshots.

**Rationale**: matches Constitution VI and the house recipes exactly; the mock already
supports `rpc`/`rpcErrors` (test/helpers/supabase-mock.ts:17-20,137-140) — zero new test
infrastructure needed.

**Alternatives considered**: Playwright E2E (no browser-e2e layer exists in the repo — out of
scope tonight, noted as Gap 19 for the future); live-backend integration tests (unreachable
from the sandbox; that's what the operator smoke script is for).

## R10. Operator scripts (probe + smoke)

**Decision**: two `tsx`-run scripts under `web/scripts/ops/` reusing the CLI's env loading
(`web/.env.local`): `invite-probe.ts` (anon/service-role GET of the PostgREST swagger root +
column probes; read-only; exit 0/1 with a plain table) and `invite-smoke.ts` (service-role
GoTrue admin: create disposable user, mint invite in a scratch household, redeem via RPC as
that user, claim a scratch person, verify, then delete everything; `DRY_RUN=1` prints the
plan). Both are documented in quickstart.md and marked `[OPERATOR-PENDING]` in tasks.md.

**Rationale**: FR-026; converts tonight's network constraint into a first-class deliverable
instead of a silent gap. Modeled on the repo's existing dry-run-first script convention
(`make repair-dates`, spec 013).

**Alternatives considered**: skipping live verification (dishonest); asking the user to open
the network policy mid-run (they're asleep; also the scripts remain valuable for every future
deploy).
