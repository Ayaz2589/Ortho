# Tasks: Partner Invite & Join

**Input**: Design documents from `/specs/017-partner-invite-join/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: TDD is NON-NEGOTIABLE here (Constitution VI): every ⊗-marked test task MUST be
written and observed FAILING before its paired implementation task starts. Web suite baseline:
731 green. Vector-drift gate must stay at zero throughout (SC-006).

**Organization**: execution-ordered for tonight — web first (full local loop), then the iOS
batch as ONE contiguous group → ONE early CI push (budget: 2 fix-up rounds; fallback ladder in
plan.md), then operator scripts, then docs. Story labels map to spec.md (US1 invite, US2 join,
US3 claim, US4 refresh, US5 manage invites, US6 solo-unchanged).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable (different files, no dependency on an incomplete task)
- **⊗**: failing-test-first task (must fail before its implementation lands)
- **[OPERATOR-PENDING]**: only runnable by the operator (network/device) — not tonight

---

## Phase 1: Setup

- [ ] T001 Confirm baseline: `cd web && npx tsc --noEmit && npm test` green (731) and
      `npm run gen:vectors && git diff --exit-code ../shared/test-vectors/` shows zero drift.
      Record both in the PR notes.

## Phase 2: Foundational — cross-surface invite-code codec (blocks US1/US2/US3)

- [ ] T002 ⊗ Write failing codec unit tests in `web/test/invites.test.ts`: alphabet/length of
      `generateInviteCode()`, `formatInviteCode`, `canonicalizeInviteCode` (incl. contract §6
      literals T1/T2/T4/T5), `inviteStatus` precedence with injected `now`, `joinLink`.
      Include a placeholder-failing T3 hash assertion.
- [ ] T003 Implement `web/lib/invites.ts` (pure codec per contracts/invite-code.md §1–§5, §7)
      + `PendingInvite`/`InviteStatus`/`MembershipRole` types in `web/lib/types.ts`; T002 green.
- [ ] T004 Compute the real T3 digest via the implemented `hashInviteCode('ABCDE23456')`;
      replace the placeholder literal in `specs/017-partner-invite-join/contracts/invite-code.md`
      AND `web/test/invites.test.ts` (iOS mirror comes in T020); suite green.

## Phase 3: US1 + US5 — owner invites & manages (web) (P1+P2)

**Goal**: owner creates a one-time code (reveal once, copy/link), sees status list, revokes.
**Independent test**: mocked-store render → create → reveal → list shows Pending w/ expiry →
revoke removes; member sees no card.

- [ ] T005 ⊗ [US1] Write failing `web/test/invite-flows.test.tsx`: `createInvite()` resolves a
      display-format code exactly once and inserts `{role:'member', expires_at:+7d, token_hash
      = sha256(canonical)}` (assert against the mock's recorded insert payload); invite list
      renders Pending/Redeemed/Expired states (injected clock); `revokeInvite` optimistic +
      rollback on `deleteErrors`; non-owner (`role:'member'` membership row) sees no invite
      card and `invites === []`.
- [ ] T006 [US1] Store: add `invites` state + `pending_invites` to `loadAll` (12th parallel
      read), `currentRole` from the picked membership row, `createInvite()`/`revokeInvite()`
      per contracts/store-api.md, in `web/lib/store.tsx`.
- [ ] T007 [US1] UI: `web/components/settings/InviteCard.tsx` (owner-only card in the Settings
      household area: create → one-time reveal with Copy code / Copy link buttons +
      `aria-live` confirmation, status list, revoke with inline confirm) wired into
      `web/app/(app)/settings/page.tsx`; T005 green.

## Phase 4: US2 + US6 — join flow & bootstrap choice (web) (P1+P2)

**Goal**: fresh no-household user gets Join/Start-fresh BEFORE any silent create; `/join?code=`
works signed-in; solo behavior byte-preserved via `startFresh()`.
**Independent test**: mocked bootstrap with zero memberships renders the gate; redeem paths
ok/invalid/already-member; start-fresh insert sequence identical to pre-017.

- [ ] T008 ⊗ [US2] Write failing `web/test/join-flows.test.tsx`: (a) zero-membership bootstrap
      sets `membershipStatus='none'`, renders gate, performs NO household/membership insert;
      (b) `startFresh()` reproduces today's exact insert sequence (households →
      household_members(owner) → household_people(linked)) then loads; (c) `redeemInvite`
      success (`rpc:{accept_invite:'<hh-uuid>'}`) sets `preferredHouseholdId` and loads that
      household; (d) rpc error ⇒ `{ok:false,reason:'invalid'}` with calm copy rendered;
      (e) already-member (uuid already in memberships) ⇒ `{ok:false,reason:'already-member'}`;
      (f) persisted pick: two memberships + valid `preferredHouseholdId` ⇒ preferred wins;
      stale preference ⇒ first-by-created_at wins.
- [ ] T009 ⊗ [US6] Amend existing bootstrap suites (`web/test/store*.test.tsx` and any suite
      asserting fresh-user auto-create) to the new contract: choice screen instead of silent
      create; existing-membership users completely unchanged. Mark each amendment with a
      `// spec 017 FR-024` comment. These must FAIL against the current store.
- [ ] T010 [US2] Store restructure in `web/lib/store.tsx` per research.md R5: full membership
      read (`household_id, role, created_at`, ordered), `membershipStatus`, persisted-pick,
      `startFresh()`, `redeemInvite()`, role-gated `ensureAccountPersonAndFoldLegacy`; T008
      (a–f) + T009 green.
- [ ] T011 [US2] Gate UI: `web/components/HouseholdGate.tsx` (Join with a code / Start fresh +
      quiet sign-out; consumes a pending `?code=` prefill) rendered from
      `web/app/(app)/layout.tsx` when `membershipStatus==='none'`.
- [ ] T012 [P] [US2] `/join` route: `web/app/(app)/join/page.tsx` (reads `?code=`, confirm →
      `redeemInvite`, three calm outcomes, success → `/dashboard`); `web/proxy.ts` gains
      `?next=<path+query>` on the sign-in bounce; `web/app/sign-in/page.tsx` honors safe
      relative `next` after verify. Component/unit tests included in T008 file (route render +
      proxy next-param unit via exported helper if needed).

## Phase 5: US3 — identity claim (web) (P1)

**Goal**: member-role joiner claims an unlinked active person (or creates one); history
attributes instantly; interrupted claim re-presents; races fail calmly.
**Independent test**: mocked member-role bootstrap with unlinked people renders picker; claim
flips `needsPersonClaim`; 0-row update ⇒ 'taken' and refreshed picker.

- [ ] T013 ⊗ [US3] Extend `web/test/join-flows.test.tsx` (claim describe block): picker offers
      ONLY `removed_at IS NULL && linked_user_id IS NULL` people; owner's linked row never
      offered; claim update payload is `{linked_user_id: me}` guarded `.is('linked_user_id',
      null)`; 0-rows-updated ⇒ `{ok:false,reason:'taken'}`; create-new path inserts a linked
      person; `needsPersonClaim` true on member-role-no-link bootstrap (re-presentation,
      FR-016) and false after claim; owner-role users NEVER see the claim gate (auto-create
      unchanged).
- [ ] T014 [US3] Store: `claimPerson(sel)` + `needsPersonClaim` derivation in
      `web/lib/store.tsx`; claim step UI added to `web/components/HouseholdGate.tsx` (picker
      + "Continue as a new person" reusing the add-person form idiom); T013 green.

## Phase 6: US4 — manual refresh (web) (P1)

**Goal**: discreet refresh control; atomic success; failure keeps data; forms untouched.
**Independent test**: mutate mock tables after initial load → refresh → new data everywhere;
selectErrors on refresh → data intact + banner; open form value survives refresh.

- [ ] T015 ⊗ [US4] Write failing `web/test/refresh.test.tsx`: success replaces collections
      consistently (transactions + people + budgets all from the updated mock in one pass);
      `refreshing` never sets boot `loading`; failure (selectErrors on `transactions`) leaves
      ALL prior collections intact + error banner; an open controlled input (render a form
      alongside) keeps its value across refresh; control disabled while in flight;
      `aria-label="Refresh"` reachable.
- [ ] T016 [US4] Store `refresh()` (R8) in `web/lib/store.tsx` +
      `web/components/RefreshControl.tsx` wired into `web/components/Sidebar.tsx` (household
      footer) and the compact Transactions header in `web/app/(app)/transactions/page.tsx`
      (or its header component); T015 green.

## Phase 7: i18n (web catalogs) — blocks the iOS batch strings

- [ ] T017 [P] Add ALL new user-facing keys (~35: gate, invite card, join page, claim step,
      refresh, statuses, errors — final list from the rendered components) to
      `web/lib/i18n/{bn,es,ja,zh,ko}.ts` (shared-key block for strings that will also exist on
      iOS; web-only block otherwise); extend the render-locale checks in `web/test/i18n/` to
      the gate + invite card; `web/test/i18n/catalog-parity.test.ts` green.
- [ ] T018 Full web gate: `npx tsc --noEmit`, `npm test` (all suites incl. new), vector-drift
      zero. Fix anything. This is the "web core green" checkpoint that unblocks the iOS push.

## Phase 8: iOS batch (US1–US5 on iOS) — ONE contiguous group, ONE early CI push

**Goal**: full iOS parity surface per plan.md; new files are pbxproj-free (filesystem-synced).
**Independent test**: `InviteCodecTests` green in CI; compile green; `-uiDemo` screenshots show
the new Settings rows.

- [ ] T019 ⊗ [US1] Write `iOS/Ortho-iOSTests/InviteCodecTests.swift` with the IDENTICAL
      literal cases as `web/test/invites.test.ts` (contract §6, incl. the T004 digest), status
      precedence with injected dates, generate/format round-trip. (Runs only in CI — authored
      before the implementation it tests.)
- [ ] T020 [US1] Implement `iOS/Ortho-iOS/Shared/InviteCodec.swift` (CryptoKit SHA256,
      SystemRandomNumberGenerator, per contracts/invite-code.md).
- [ ] T021 [US1] Implement `iOS/Ortho-iOS/Services/InvitesAPI.swift` (fetch/create/revoke/
      redeem-via-`.rpc("accept_invite")`/role — CardsAPI struct pattern, snake_case CodingKeys
      DTOs per data-model.md).
- [ ] T022 [US2] `iOS/Ortho-iOS/Services/HouseholdsAPI.swift`: `findOrCreate(for:preferredID:)`
      reads all memberships (+role, ordered), prefers preferred, returns `(id, name, role)`;
      `iOS/Ortho-iOS/App/AppState.swift`: pass the persisted `currentHouseholdID`, store
      `currentRole`, gate `ensureAccountPerson` to owner-role, add `invites` collection +
      `createInvite/revokeInvite/joinHousehold/claimPerson` (optimistic + `dataError`, all
      `testDataEnabled`-guarded).
- [ ] T023 [US1] [US5] `iOS/Ortho-iOS/Features/Settings/InviteSheet.swift` (create → one-time
      reveal + ShareLink + copy; pending list with status text; revoke w/ confirm) + owner-only
      "Invite your partner" row in `Features/Settings/HouseholdView.swift`.
- [ ] T024 [US2] [US3] `iOS/Ortho-iOS/Features/Settings/JoinHouseholdSheet.swift` (code entry →
      redeem → outcomes; claim-person picker step: unlinked active people or create-new) +
      universal "Join a household" row in `HouseholdView.swift`; join success sets
      `currentHouseholdID`, reloads, claim check per contracts/store-api.md.
- [ ] T025 [US4] `.refreshable { await appState.loadAllFromServer() }` on the Transactions
      `List` in `iOS/Ortho-iOS/Features/Transactions/TransactionsView.swift`.
- [ ] T026 [US1] All new iOS strings into `iOS/Ortho-iOS/Localizable.xcstrings` (6 languages,
      keys byte-identical to web's shared block from T017).
- [ ] T027 Push the branch (web + iOS together), watch
      `GH_TOKEN=placeholder gh run watch --exit-status` for BOTH workflows; fix-up budget: 2
      iOS rounds. On budget exhaustion apply the plan.md fallback ladder (defer claim picker
      → `[DEFERRED]` here + PARITY.md note). Download `simulator-screenshots` and visually
      check the new Settings rows.

## Phase 9: Operator scripts (FR-026)

- [ ] T028 [P] `web/scripts/ops/invite-probe.ts` — read-only hosted-rails probe (swagger root
      lists `pending_invites` + `rpc/accept_invite`; `household_people.linked_user_id` column
      probe; plain-table report; exit 0/1). Unit-test the report formatting only (no network)
      in `web/test/invites.test.ts` or a small `web/test/ops.test.ts`.
- [ ] T029 [P] `web/scripts/ops/invite-smoke.ts` — live E2E per research.md R10 (GoTrue admin
      mint → invite → redeem → claim → verify → cleanup; `DRY_RUN=1` plan mode). Document
      both in `web/scripts/import/README.md` or a new `web/scripts/ops/README.md`.
- [ ] T030 [OPERATOR-PENDING] Run `invite-probe.ts` then `invite-smoke.ts` from a networked
      host; then the two-device human pass (quickstart.md §4, SC-001/002/003/007).

## Phase 10: Polish & docs

- [ ] T031 PARITY.md: add "Partner invite & join" + "Manual data refresh" capability rows,
      the invite-code convention note (hand-mirrored contract), and the deliberate per-canvas
      divergences (web pre-bootstrap gate vs iOS Settings redeem; refresh batch semantics).
- [ ] T032 [P] Docs: `docs/web.md`, `docs/ios.md`, `docs/index.md` — new flows, new files,
      bumped test counts; note the stale `.specify/feature.json`→017 fix already landed.
- [ ] T033 Final full gate: `npx tsc --noEmit`, `npm test`, vector-drift zero, `npm run build`
      (no shared dev server running); commit ledger updated (this file's checkboxes).

---

## Dependencies

```
T001 → T002 ⊗ → T003 → T004
T003 → {T005 ⊗ → T006 → T007}                (US1/US5 web)
T003 → {T008 ⊗, T009 ⊗} → T010 → T011 → T012 (US2/US6 web; T012 ∥ T011 after T010)
T010 → T013 ⊗ → T014                          (US3 web)
T010 → T015 ⊗ → T016                          (US4 web; independent of T013/14)
{T007,T011,T012,T014,T016} → T017 → T018      (strings frozen only when UI final)
T018 → T019 ⊗ → T020 → T021 → T022 → T023 → T024 → T025 → T026 → T027  (iOS batch, contiguous)
T003 → T028 ∥ T029 (anytime after codec; before T033)
T027 → T031 → T033 ; T032 ∥ T031 ; T030 operator-only
```

## Parallel opportunities

- After T010: T013/T015 branches proceed independently; T012 alongside T011.
- T028/T029 can be written while CI (T027) runs.
- T032 alongside T031.

## Implementation strategy

Web-first MVP = Phases 2–7 (all four P1 stories fully testable on web alone, 100% local
loop). The iOS batch then ships the same product surface in one push with bounded CI risk and
an honest fallback. Operator tasks are first-class deliverables, never silently skipped.

**MVP scope if the night were cut short**: T001–T018 (web complete + green) — independently
shippable with PARITY.md noting iOS as fast-follow; the fallback ladder narrows scope only at
the claim picker, never at data integrity.
