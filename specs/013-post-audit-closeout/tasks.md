# Tasks: Post-Audit Closeout

**Input**: Design documents from `/specs/013-post-audit-closeout/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: TDD is explicitly requested (spec FR-019, constitution Principle VI) — every behavior
change has a preceding failing-test task. **Never regenerate golden vectors before the source
implementation is proven canonical** (vectors are generated FROM web; regenerating over a wrong
web implementation launders the bug — see US3 ordering).

**Organization**: By user story, but execution follows plan.md's verification topology: all
sandbox-verifiable work first; Swift edits accumulate on the branch and ship in **one batched
iOS CI push** (Phase 10); the live-DB APPLY is **operator-gated** and runs last.

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup

- [X] T001 Verify baseline: `cd web && npm install && npx tsc --noEmit && npm test` — expect 619 green; record any environment fixes (Linux ARM rolldown binding per docs/index.md §4.6)
- [X] T002 Push branch and open a **draft PR** for `013-post-audit-closeout` (`git push -u origin 013-post-audit-closeout && GH_TOKEN=placeholder gh pr create --draft --title "013: post-audit closeout" --body "..."`) — ios-ci.yml only runs on `pull_request` for non-main branches, so this is what turns CI on for the feature
- [X] T003 [P] Install `actionlint` in the sandbox (needed by US7 validation; e.g. `go install` binary release into ~/bin)

**Checkpoint**: web suite green locally; draft PR open; CI observed running (or queued) on the PR

---

## Phase 2: Foundational

*No shared blocking infrastructure — the stories are independent by design. Proceed straight to
stories; note only the cross-story file-contention rule:*

- [X] T004 Confirm no other checkout/worktree is mid-edit on `iOS/Ortho-iOS/Localizable.xcstrings`, `web/scripts/gen-vectors.ts`, or `shared/test-vectors/` (multiple stories touch them sequentially: US1 → US3 → US4 order within this plan)

---

## Phase 3: User Story 1 — Non-English iOS users see a fully translated app (P1) 🎯 MVP

**Goal**: 87 missing + 6 `state:"new"` catalog keys resolved in bn/es/ja/ko/zh-Hans; shared keys byte-identical to web; bn Latin digits; per-language CI screenshots.

**Independent Test**: `npx vitest run test/i18n/catalog-parity.test.ts` green on-sandbox; per-language simulator screenshots from CI show no English fallback/tofu.

### Tests (write first — MUST fail before implementation)

- [X] T005 [US1] Write `web/test/i18n/catalog-parity.test.ts` implementing contracts/catalog-parity.md C1–C3: parse `iOS/Ortho-iOS/Localizable.xcstrings` + the five `web/lib/i18n/*.ts` catalogs; assert full non-en coverage (`state === 'translated'`, plural branches included, `shouldTranslate:false` exempt), shared-key identity after `%@`/`%lld`/`%n$@` ↔ `{0}…{n}` normalization, bn values free of Bengali digits (U+09E6–U+09EF) and `AppLanguage.swift` containing `@numbers=latn`. Run: expect **RED** with exactly the 87-missing/6-new inventory (the failure list is the work list)

### Implementation

- [X] T006 [US1] Mark pure symbol/numeral keys (`·`, `0`, `0.00`, `1Y`, `3M`, `6M`, `(%lld)`, `/ %@`, empty key, etc. — from T005's failure list) as `"shouldTranslate": false` in `iOS/Ortho-iOS/Localizable.xcstrings`
- [X] T007 [US1] Author bn + es translations for every remaining missing key in `iOS/Ortho-iOS/Localizable.xcstrings` — copy web catalog values back for keys present in `web/lib/i18n/bn.ts`/`es.ts` (converting `{n}` to the en key's specifiers); author fresh (iOS terminology-consistent) values for iOS-only keys; resolve the 6 `state:"new"` format keys
- [X] T008 [US1] Author ja + ko + zh-Hans translations for every remaining missing key in `iOS/Ortho-iOS/Localizable.xcstrings` (same rules as T007; sequential with T007 — same file)
- [X] T009 [US1] Run `npx vitest run test/i18n/catalog-parity.test.ts` → **GREEN**; fix stragglers (plural variations, placeholder mismatches) until clean
- [X] T010 [US1] Add DEBUG-only `-uiDemoLanguage <code>` launch argument: read in `iOS/Ortho-iOS/Ortho_iOSApp.swift` (pattern of `-uiDemoTab`, RootTabView.swift:6-18) and override the `@AppStorage("language")`-backed `AppLanguage` for the session (map `bn|es|ja|zh-Hans|ko` → `AppLanguage` cases in `iOS/Ortho-iOS/DesignSystem/AppLanguage.swift`) — compiled out of Release. *(Swift — lands in Phase 10 push)*
- [X] T011 [US1] Extend `.github/workflows/ios-ci.yml` screenshot step: keep the 4-tab en pass; add `dashboard`+`settings` in each of bn/es/ja/zh-Hans/ko and all 4 tabs in bn + ja via `-uiDemoLanguage`; name files `<lang>-<tab>.png` *(workflow — lands in Phase 10 push)*

**Checkpoint**: catalog-parity suite green on-sandbox; Swift/workflow edits staged for Phase 10

---

## Phase 4: User Story 3 — Insights read identically on web and iOS (P2)

**Goal**: recurring preview = amount-desc, case-insensitive-name tie-break, newest-tx casing on both; web outlier date localized; `preview_merchants` vectored; previously vectored fields unchanged.

**Independent Test**: web insights unit + parity suites green; `git diff shared/test-vectors/insights.json` shows only added `preview_merchants`; iOS assertion green in Phase 10 CI.

### Tests (write first)

- [X] T012 [P] [US3] Add failing unit tests to `web/test/insights.test.ts` (or a new `web/test/insights-preview.test.ts`): recurring preview ordered by monthly amount desc; amount-tie broken by case-insensitive merchant asc; casing from the merchant's most recent transaction; `+ N more` beyond 3. Run → **RED** (web is Map-order + oldest casing today, insights.ts:209-231)
- [X] T013 [P] [US3] Add failing unit test for outlier date locale: `generateInsights` with `locale: 'es-ES'` renders the outlier date with Spanish month token, `'en-US'` keeps current rendering. Run → **RED** (en-US hardcoded at insights.ts:267-269)

### Implementation

- [X] T014 [US3] Fix `web/lib/finance/insights.ts` recurring section (lines ~209-231): sort detected merchants by monthly amount desc with case-insensitive name asc tie-break; take casing from most recent transaction → T012 **GREEN**
- [X] T015 [US3] Thread `locale: string` through `generateInsights` into the outlier `Intl.DateTimeFormat` (replace the `'en-US'` literal); update the store/InsightsCardStack call path to pass the app locale (`web/lib/store.tsx`, source `localeForLanguage`); tests/generator pass `'en-US'` explicitly → T013 **GREEN**
- [X] T016 [US3] Extend `web/scripts/gen-vectors.ts` (insights `expected` map, lines ~220-225) with `preview_merchants` and add scenario cases: amount tie with distinct casings + a merchant whose casing changed across txs; run `npm run gen:vectors`; **review `git diff shared/test-vectors/insights.json`: existing id/severity/category/magnitude_cents entries must be byte-identical** (FR-008) — investigate before proceeding if not
- [X] T017 [US3] Extend `web/test/insights.parity.test.ts` to assert `preview_merchants` per vector case → GREEN on web
- [X] T018 [US3] Mirror on iOS: add the case-insensitive tie-break to `detected.sort` in `iOS/Ortho-iOS/Services/InsightEngine.swift:323`; extend `iOS/Ortho-iOSTests/InsightParityTests.swift` decode struct + assertions with `preview_merchants` *(Swift — lands in Phase 10 push)*

**Checkpoint**: web suites green; insights.json regenerated with reviewed diff; Swift edits staged

---

## Phase 5: User Story 4 — availableRanges golden vector (P2)

**Goal**: `availableRanges` pinned in `shared/test-vectors/dashboard-month-scope.json`, asserted by both parity suites; iOS logic extracted pure.

**Independent Test**: web parity suite asserts the new section; deliberate mutation of `range.ts:84-99` fails it; iOS assertions green in Phase 10 CI.

### Tests (write first)

- [X] T019 [US4] Add an `availableRanges` describe block to the web dashboard-scope parity test (`web/test/` — the file asserting `dashboard-month-scope.json`) iterating a not-yet-existing `availableRanges` section per contracts/available-ranges-vector.md. Run → **RED** (section absent from vector file)

### Implementation

- [X] T020 [US4] Add the `availableRanges` case set to `web/scripts/gen-vectors.ts` (empty · single-month · 2-month boundary-miss · exactly-3/6/12 boundaries · 13-month · gap-months · year-boundary · future-dated; inputs `{dates[], now}`, noon-UTC ISO); `npm run gen:vectors`; review diff (only the new section) → T019 **GREEN**
- [X] T021 [US4] Mutation check (SC-004, one-time): flip the `>=` boundary in `web/components/dashboard/range.ts:96` → parity suite **RED** → revert → GREEN; record in the PR description
- [X] T022 [US4] Extract pure `func availableRanges(_ transactions: [Transaction], now: Date) -> [DashboardRange]` into `iOS/Ortho-iOS/App/DashboardRange.swift` (logic from `AppState.swift:684-698`, UTC month-index math matching web); make `AppState.availableRanges` delegate to it *(Swift — Phase 10)*
- [X] T023 [US4] Extend `iOS/Ortho-iOSTests/DashboardScopeParityTests.swift` with the `availableRanges` section decode + assertions (reuse the UTC ISO formatter, lines 44-49) *(Swift — Phase 10)*

**Checkpoint**: web parity green incl. mutation check; Swift extraction + tests staged

---

## Phase 6: User Story 5 — CLI behaves like the apps (P3)

**Goal**: shared filtering brain, household-wide non-admin scope, explicit truncation, compensating writes, shared split tolerance, derived categories, `--admin` documented. All on-sandbox.

**Independent Test**: `npx vitest run test/import/` green including new contract suites; SC-005 identity test passes.

### Tests (write first — separate files, parallelizable)

- [X] T024 [P] [US5] Write failing contract test `web/test/import/list-parity.test.ts`: scenario table (free-text query, multi-category, owner filter, kind, month window × a fixture dataset) — CLI listing result ids MUST equal `filterTransactions` output ids; plus household-wide non-admin scoping and explicit-truncation notice cases (mock-builder pattern from `web/test/import/transactions.test.ts`) → **RED**
- [X] T025 [P] [US5] Add failing compensation tests to `web/test/import/persist.test.ts`: shares-insert failure ⇒ parent delete issued then throw; delete-also-fails ⇒ combined error naming orphan id → **RED**
- [X] T026 [P] [US5] Add failing tolerance tests to `web/test/import/split.test.ts`: 99.8% and 100.4% accepted, 99.4% rejected, owner-coverage/negative checks intact → **RED**
- [X] T027 [P] [US5] Write failing derivation test `web/test/import/categories.test.ts`: `engine/filters.ts` CATEGORY_LIST and `cli.ts` CATEGORIES are the same object as the `web/lib/types.ts` export → **RED**

### Implementation

- [X] T028 [US5] `web/lib/types.ts`: export `const CATEGORY_LIST = [...] as const` and derive `type TransactionCategory = (typeof CATEGORY_LIST)[number]`; replace hardcoded copies in `web/scripts/import/engine/filters.ts:5-8` and `web/scripts/import/cli.ts:21-24` with imports → T027 GREEN; `npx tsc --noEmit` clean
- [X] T029 [US5] Rework `tx list`: `web/scripts/import/db/transactions.ts` fetches by date window + household scope only (resolve household via `db/lookups.ts resolveHousehold`; drop `created_by` scoping, keep it for `ADMIN=1` attribution paths untouched); `web/scripts/import/engine/filters.ts` maps flags → `FilterCriteria`; `web/scripts/import/tx.ts` applies shared `filterTransactions` in-process, adds `--query`/`--owner`/multi-value `--category`/`--source`, prints `showing first N — pass LIMIT= to raise` on truncation → T024 GREEN
- [X] T030 [P] [US5] `web/scripts/import/db/persist.ts`: compensate on shares failure (delete parent by id before throwing; combined error if the delete fails) → T025 GREEN
- [X] T031 [P] [US5] `web/scripts/import/engine/split.ts`: `validateCustomSplit` delegates sum check to shared `validateSplit` (`web/lib/splits.ts`), keeping `{ok,error}` shape and non-sum checks → T026 GREEN
- [X] T032 [US5] Update root `Makefile` tx-list help text (new QUERY/OWNER/multi-value flags) and `web/scripts/import/` README/help strings; run full `npx vitest run test/import/` → all GREEN
- [X] T033 [US5] PARITY.md CLI section: mark filtering/atomic-write/split-tolerance/category rows resolved (reference feature 013); rewrite `--admin` as documented-by-design with constraints (FR-014) — full reconciliation deferred to T053

**Checkpoint**: entire `test/import/` green; CLI behaviorally aligned; zero iOS involvement

---

## Phase 7: User Story 6 — Web translations read natively and fit (P3)

**Goal**: web-only keys terminology-consistent with iOS per language; no missed strings; es/ja visual overflow pass.

**Independent Test**: extended i18n suites green; operator visual pass in Español/日本語 clean.

### Tests (write first)

- [X] T034 [US6] Extend `web/test/i18n/catalog-parity.test.ts` with contract C4: every literal `t('…')` call-site key in `web/` resolves in all five catalogs; `— web-only keys —` marker present; iOS-seeded block ⊆ xcstrings keys. Run → fix any RED by adding missing catalog entries (each is a real English-fallback bug)
- [X] T035 [US6] Add jsdom no-fallback render tests (new `web/test/i18n/render-locale.test.tsx`): render Dashboard + Settings + TxForm under Español and 日本語 via the store's language state; assert no known-English UI literals appear → RED where strings were missed

### Implementation

- [X] T036 [P] [US6] Terminology review — bn + es: audit the web-only block of `web/lib/i18n/bn.ts` and `es.ts` against the iOS-seeded block's product vocabulary (household, split, settle up, budget, housing terms); fix divergent values
- [X] T037 [P] [US6] Terminology review — ja + ko + zh: same for `web/lib/i18n/ja.ts`, `ko.ts`, `zh.ts`
- [X] T038 [US6] Re-run i18n suites (`npx vitest run test/i18n/`) and T005's shared-key identity check (terminology fixes must not break identity for shared keys) → GREEN
- [ ] T039 [US6] **[OPERATOR-ASSISTED]** Visual overflow pass: `npm run dev`; user walks Español + 日本語 across the four destinations + add/edit at compact and desktop widths (quickstart.md US6); fix reported overflows/missed strings in catalogs; re-run suites

**Checkpoint**: i18n suites green; visual pass done or explicitly awaiting operator

---

## Phase 8: User Story 7 — TestFlight pipeline (P3)

**Goal**: dispatch-only deploy workflow with fast fail-fast preflight naming all missing secrets; owner setup doc. End-to-end upload explicitly out of scope until credentials exist.

**Independent Test**: `actionlint` clean; a triggered run fails preflight in < 60 s listing all 7 secrets.

### Implementation (workflow files are declarative — the "failing test" is the live preflight run, T042)

- [ ] T040 [P] [US7] Write `.github/workflows/ios-deploy.yml` per contracts/ios-deploy-workflow.md: `workflow_dispatch` only; `preflight` job (ubuntu) accumulating ALL missing secrets (`ASC_ISSUER_ID`, `ASC_KEY_ID`, `ASC_PRIVATE_KEY`, `DIST_CERT_P12`, `DIST_CERT_PASSWORD`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`) into one failure message pointing at docs/deploy.md; `deploy` job (macos-latest, needs preflight, non-fork gate): keychain + .p8 setup, `xcodebuild archive` → `-exportArchive` (app-store, `-allowProvisioningUpdates` with ASC key) → `xcrun altool --upload-app`; upload ipa/logs artifact always
- [ ] T041 [P] [US7] Write `docs/deploy.md` (owner guide, FR-017): per-secret table (what/where-to-get/`gh secret set` storage), Apple-side prerequisites (paid membership, ASC app record + bundle id), manual trigger command, expected outcomes, plain statement that the final upload is unverified until credentials exist; link it from `docs/index.md` §3
- [ ] T042 [US7] Validate: `actionlint .github/workflows/ios-deploy.yml`; commit + push; trigger `GH_TOKEN=placeholder gh workflow run ios-deploy.yml --ref 013-post-audit-closeout` — if dispatch is unavailable because the workflow isn't on the default branch yet, add a temporary `push: paths: [".github/workflows/ios-deploy.yml"]` trigger for this validation and strip it in the same PR before merge; confirm preflight fails < 60 s naming all seven secrets (SC-007)

**Checkpoint**: workflow validated to its pre-credential limit; owner has a complete setup path

---

## Phase 9: User Story 2 — Legacy dates repair, build + dry run (P1; APPLY deferred to Phase 11)

**Goal**: audit/repair script with dry-run default, NY-day inference, ambiguity band, idempotent guarded writes.

**Independent Test**: unit + IO suites green on-sandbox; live dry-run report produced for operator review.

### Tests (write first)

- [ ] T043 [P] [US2] Write failing unit tests `web/test/maintenance/repair-legacy-dates.test.ts` for pure `isLegacy(dateISO)` / `proposeRepair(dateISO)` per contracts/repair-legacy-dates.md: window boundaries (23:59:59Z out, 00:00:00Z in, 03:59:59Z in, 04:00:00Z out), noon-UTC excluded, EST vs EDT instants, DST-transition days, ambiguity band `[00:00,01:00)` NY, idempotence (proposals never re-match) → **RED**
- [ ] T044 [US2] Add failing IO tests (same file, mock-builder pattern): dry run issues zero `update`s; APPLY updates only non-ambiguous reported ids with `.eq('date', original)` guard; per-row failure reported without halting; non-zero exit on any failure → **RED**

### Implementation

- [ ] T045 [US2] Implement `web/scripts/maintenance/repair-legacy-dates.ts`: pure functions + report format + `makeClient` reuse (`scripts/import/db/client.ts`) + APPLY confirmation prompt (`type "repair"`, structurally unskippable) → T043/T044 **GREEN**
- [ ] T046 [US2] Add `repair-dates` target to root `Makefile` (`DRY_RUN` default, `APPLY=1`, `ADMIN=1` pass-through; help text) and a one-line mention in `docs/makefile.md`
- [ ] T047 [US2] **[OPERATOR-ASSISTED]** Run the live dry run: `make repair-dates` (OTP sign-in needs the operator's emailed code, or ADMIN=1 if they provide the service-role key in `web/.env.local`); deliver the full report (repairable + ambiguous rows) to the user — **do not proceed to APPLY**

**Checkpoint**: suites green; dry-run report in the operator's hands

---

## Phase 10: Batched iOS CI push 🚦 (gates US1, US3, US4)

**Purpose**: One push carrying ALL Swift/xcstrings/vector/workflow changes staged by T006-T011, T016-T018, T020-T023; then the CI loop.

- [ ] T048 Pre-push review: `git status`/`git diff` over `iOS/**`, `shared/test-vectors/**`, `.github/workflows/ios-ci.yml` — confirm exactly the staged work (catalog, -uiDemoLanguage, InsightEngine tie-break, DashboardRange extraction, both parity-test extensions, screenshot matrix, both regenerated vectors); commit (logical commits per story are fine — one *push*) and push to the draft PR
- [ ] T049 Watch CI: `GH_TOKEN=placeholder gh run watch --exit-status`; on failure read `gh run view --log-failed`, fix, re-push (fix-up pushes only); repeat until **GREEN** (build + all XCTest parity suites incl. new preview_merchants + availableRanges assertions)
- [ ] T050 Download and inspect the `simulator-screenshots` artifact (`gh api repos/Ayaz2589/Ortho/actions/runs/<run>/artifacts` → `.../artifacts/<id>/zip`): verify per-language shots — translated UI, no tofu/overflow, Latin digits under বাংলা (SC-001 visual half, US1 acceptance #4); fix + re-push if not

**Checkpoint**: iOS CI green with per-language visual evidence — US1/US3/US4 fully verified

---

## Phase 11: Live repair APPLY 🔒 OPERATOR-GATED (completes US2)

> **HARD GATE: T051 runs only after the user has reviewed T047's report and explicitly said to
> apply, in conversation. Never run APPLY autonomously (spec FR-005, plan §Verification).**

- [ ] T051 [US2] **[OPERATOR-GATED]** `make repair-dates APPLY=1` (operator types the confirmation); capture and report per-row results verbatim
- [ ] T052 [US2] Idempotence + success proof: re-run `make repair-dates` → expect `0 repairable` with only deferred ambiguous rows listed (SC-002); report ambiguous rows for per-row operator decisions (out of automated scope)

---

## Phase 12: Polish & Cross-Cutting

- [ ] T053 Reconcile `PARITY.md` fully (FR-020): new audit note for 013; availableRanges row now vectored; insights preview + outlier-date rows resolved; CLI rows resolved per T033; matrix updated
- [ ] T054 [P] Refresh stale docs: `docs/ios.md` (per-language screenshot matrix, -uiDemoLanguage), `docs/shared.md` (availableRanges + preview_merchants vector sections), `docs/web.md` (i18n suite, insights locale param), `docs/makefile.md` (repair-dates, new tx-list flags), `docs/index.md` (deploy.md link — if not done in T041)
- [ ] T055 [P] Update `CI-SETUP.local.md` (gitignored): deploy workflow exists, secrets table now normative, correct the "sandbox can't edit pbxproj" note if Phase 10 proved hand-editing viable
- [ ] T056 Final gates: `cd web && npx tsc --noEmit && npm test` (all green, incl. every new suite); confirm latest CI run green; run through `quickstart.md` checking every US validation is satisfied or explicitly operator-pending
- [ ] T057 Mark the draft PR ready for review with a summary of all seven stories, the vector diffs, screenshot evidence links, and the two operator-pending items (visual pass if outstanding; ambiguous rows)

---

## Dependencies & Execution Order

```
Phase 1 (setup, draft PR)
  └─► Phase 3 US1 (T005→T006→T007→T008→T009; T010,T011 staged)
  └─► Phase 4 US3 (T012,T013 → T014,T015 → T016 → T017; T018 staged)   ← after US1's T009 (xcstrings settled before web-value copyback is final)
  └─► Phase 5 US4 (T019 → T020 → T021; T022,T023 staged)               ← after T016 (gen-vectors.ts edited sequentially)
  └─► Phase 6 US5 (T024-T027 [P] → T028 → T029; T030,T031 [P] → T032 → T033)   ← independent; parallel with 3-5
  └─► Phase 7 US6 (T034,T035 → T036,T037 [P] → T038 → T039 operator)   ← after T009 (shared-key identity stable)
  └─► Phase 8 US7 (T040,T041 [P] → T042)                               ← independent; parallel with anything
  └─► Phase 9 US2 build (T043 [P] → T044 → T045 → T046 → T047 operator) ← independent; parallel with anything
Phase 10 (T048 → T049 → T050)  ← needs T006-T011, T016-T018, T020-T023 staged
Phase 11 (T051 🔒 → T052)      ← needs T047 + explicit operator approval; after Phase 10 (batch discipline)
Phase 12 (T053 → T054,T055 [P] → T056 → T057) ← needs everything
```

**Sequential-file constraints**: `Localizable.xcstrings` (T006→T007→T008), `gen-vectors.ts`
(T016→T020), `catalog-parity.test.ts` (T005→T034).

## Parallel Opportunities

- T024-T027 (four failing CLI suites, different files); T030+T031; T036+T037; T040+T041; T054+T055
- Whole stories in parallel lanes: US5, US7, US2-build are mutually independent and independent of the US1→US3→US4 chain

## Implementation Strategy

**MVP = Phase 3 (US1)**: catalog complete + suite green is already shippable value; its iOS
verification rides the single batched push. Then US3→US4 (they share the vector-generation
path), the independent lanes (US5/US7/US2-build) in any order or interleaved, the one CI batch,
and only then the operator-gated live APPLY. Commit per logical task group; **one** iOS push.
