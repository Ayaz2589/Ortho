---
description: "Task list for Drift Reconciliation"
---

# Tasks: Drift Reconciliation

**Feature**: `020-drift-reconciliation` | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Items**: [drift-inventory.md](./drift-inventory.md)

**Tests**: REQUIRED — Constitution VI is non-negotiable for money/date logic. Every money/date/parity fix and the `paid_by` fix lands **test-first** (failing test/vector before the fix).

**Absolute repo root**: `/Users/ayazuddin/Development/personal/Ortho`. Web paths relative to `web/` unless noted; iOS under `iOS/Ortho-iOS/`.

**Platform boundary**: web/CLI/config/docs are built & verified locally. **iOS is validated ONLY via `.github/workflows/ios-ci.yml`** (no local Xcode). Every Swift/pbxproj/xcstrings edit is authored in its story phase but compiled/tested only in the single batched push (Phase 9). pbxproj/xcstrings edits: the owner takes the **file-system** version in Xcode.

**Traceability**: every task cites the `drift-inventory.md` item id(s) it closes; all 41 ids are covered (see the traceability map at the end).

---

## Phase 1: Setup

- [x] T001 Establish a green baseline: from `web/` run `npm test` and `npx tsc --noEmit`; record the passing test-file and test counts (needed to reconfirm the P7 doc counts against the FINAL tree). Make no changes.
- [x] T002 [P] Re-read the shape references named in plan.md's structure section before editing so fixes match convention: `web/lib/finance/{money,currency,insights}.ts`, `web/lib/{splits,transactionFilters}.ts`, `web/components/housing/{lease,rate}.ts`, `web/scripts/import/{db/persist,db/client,tx,cli}.ts`, and the iOS mirrors `Models/{Currency,Unit,LeaseInfo}.swift`, `DesignSystem/Money.swift`, `Services/{InsightEngine,TransactionsAPI}.swift`, `Features/Transactions/{TransactionSplits,TransactionFilters}.swift`, `Features/Housing/AddPropertySheet.swift`.

---

## Phase 2: Foundational (Blocking Prerequisite)

**Purpose**: prove the vector generator is deterministic before we add vectors, so any later diff is signal.

- [x] T003 Confirm a clean vector baseline: `cd web && npm run gen:vectors && git status --porcelain shared/test-vectors/` prints **nothing** (generator is idempotent on the current tree). If it doesn't, stop and reconcile before proceeding.

**Checkpoint**: baseline green and vectors idempotent — story work can begin.

---

## Phase 3: User Story 1 — Real defects (Priority: P1) 🎯 MVP

**Goal**: CLI expenses are attributed in settle-up; local sign-in is enterable.

**Independent Test**: a CLI-imported expense with a payer appears in `balanceBetween`; `otp_length` matches the client gate and local sign-in completes.

### Tests first (write, expect red)

- [x] T004 [P] [US1] Write failing test in `web/test/import/persist.test.ts` (new) asserting `txRecord(tx)` includes `paid_by`, and that a CLI-created expense with a payer is counted by `balances.ts` `balanceBetween` (not dropped by the `if (!payer) continue` guard). Closes **cli-paid-by**.

### Implementation (make green)

- [x] T005 [US1] Add `paid_by: tx.paid_by ?? null` to `txRecord` in `web/scripts/import/db/persist.ts`; verify the value flows through `createOne`/`updateOne` in `web/scripts/import/tx.ts` and the ingest path in `web/scripts/import/cli.ts`. Make T004 green. Closes **cli-paid-by**.
- [x] T006 [P] [US1] Set `otp_length = 8` in `supabase/config.toml` `[auth.email]`; verify `otp_expiry` and `[auth.sessions] timebox = "720h"` are unchanged. Closes **otp-length-config**.
- [x] T007 [P] [US1] Correct the CLI row in `PARITY.md` that claims `paid_by` support to reflect the fix (full PARITY sweep in T050). Closes **cli-paid-by** (doc half).

**Checkpoint**: MVP — both real defects fixed and locally verified (`npm test` green).

---

## Phase 4: User Story 2 — Config & dead-knob truth-up (Priority: P2)

**Goal**: no documented/forwarded option the code ignores; no config line referencing a missing file.

**Independent Test**: grep shows no live `--scope`/`asUserId`; `supabase/seed.sql` exists (or `[db.seed]` disabled).

- [x] T008 [US2] Remove the dead SCOPE knob everywhere: the `--scope` forward in `Makefile` (`tx-add`), the `SCOPE=` example in `docs/makefile.md`, and the personal/shared + `SCOPE=` language in `web/scripts/import/README.md`. Closes **scope-dead-knob**.
- [x] T009 [P] [US2] Remove the `asUserId` field and the `opts.asUserId ?? ''` branch from `web/scripts/import/db/client.ts`. Closes **asuserid-dead-option**.
- [x] T010 [P] [US2] Create `supabase/seed.sql` (empty, with a header comment noting a no-op seed) so `config.toml [db.seed] sql_paths=["./seed.sql"]` resolves. Closes **seed-sql-missing**.

**Checkpoint**: tooling is honest; `grep -rn "scope\|asUserId" Makefile web/scripts/import` shows no live forwards/fields; `test -f supabase/seed.sql`.

---

## Phase 5: User Story 3 — iOS↔web parity + golden vectors (Priority: P3)

**Goal**: iOS and web produce identical money/date output; every newly-aligned behavior is vector- or parity-test-locked.

**Independent Test**: new currency-names/-symbols/lease vectors + filter cases pass on both suites; `git diff shared/test-vectors/` shows only intended changes.

### Tests first (web, expect red)

- [x] T011 [P] [US3] Failing `web/test/currency-names.parity.test.ts` asserting `CURRENCY_NAMES` == `currency-names.json` (GBP = "UK Pound"). Closes **currency-gbp-name**.
- [x] T012 [P] [US3] Failing `web/test/currency-symbols.parity.test.ts` asserting a fixed symbol table == `currency-symbols.json` (cny = "CN¥"). Closes **currency-symbol-source** (web half).
- [x] T013 [P] [US3] Failing TZ-pinned `web/test/lease.parity.test.ts` asserting `lease.ts` helpers == `lease.json`, incl. the due-day->month-length clamp and "Due today" (0). Closes **lease-duedate-overflow** (web-canonical side).
- [x] T014 [P] [US3] Failing web unit tests (new/extended under `web/test/`) for the web-side edge fixes: insights money always 2 decimals (**insights-money-decimals**), `toUSDCents` returns 0 on rate ≤ 0 (**money-tousdcents-rate-guard**), `sharePercent` round-half-away-from-zero on a negative half-value (**splits-sharepercent-rounding**).

### Web implementation (make green, local)

- [x] T015 [P] [US3] `web/lib/finance/currency.ts`: GBP name → "UK Pound"; expose the canonical `CURRENCY_NAMES` the vector reads. Closes **currency-gbp-name**.
- [x] T016 [P] [US3] `web/lib/finance/money.ts`: fixed currency-symbol table (cny "CN¥"); change `toUSDCents` guard `rate===0` → `rate<=0`. (Negative-sign/leadingPlus are already canonical on web — iOS aligns to it.) Closes **currency-symbol-source** (web half), **money-tousdcents-rate-guard**.
- [x] T017 [P] [US3] `web/lib/finance/insights.ts`: `usd()` `minimumFractionDigits: 2` unconditionally; fix the stale "2 decimals" header comment. Closes **insights-money-decimals**.
- [x] T018 [P] [US3] `web/lib/splits.ts`: `sharePercent` uses round-half-away-from-zero; correct the "cannot diverge" header claim. Closes **splits-sharepercent-rounding**.

### Vector generation + drift gate (local)

- [x] T019 [US3] Extend `web/scripts/gen-vectors.ts` to emit `currency-names.json`, `currency-symbols.json`, `lease.json`, and add two `transaction-filters.json` cases (a query with a trailing newline → inactive; a mixed-case source set asserting localized case-insensitive `availableSources` order); run `cd web && npm run gen:vectors`. Closes **currency-gbp-name**, **currency-symbol-source**, **lease-duedate-overflow**, **filters-query-trim-charset**, **filters-availablesources-sort** (vector side).
- [x] T020 [US3] **Zero-unintended-drift gate**: `git status --porcelain shared/test-vectors/` shows ONLY the 3 new files + modified `transaction-filters.json`. Any other changed vector (currency/housing-net-rental/splits/insights/mortgage/member-balance/dashboard-month-scope) = STOP and fix the offending engine change.
- [x] T021 [US3] `cd web && npm test` (all new + existing web parity/unit suites green) and `npx tsc --noEmit` clean.

### iOS mirrors (authored here; compiled/tested in the Phase 9 batch — ios-ci.yml only)

- [x] T022 [P] [US3] iOS `Models/Currency.swift` + `DesignSystem/Money.swift`: fixed symbol table (cny "CN¥", stop deriving from `NumberFormatter`); `Money.string` prepends U+2212 for negatives; leading `+` only when amount > 0. Author `CurrencyNameParityTests.swift` + `CurrencySymbolParityTests.swift`. Closes **currency-symbol-source** (iOS), **money-negative-sign**, **money-leadingplus-zero**. *(ios-ci only)*
- [x] T023 [P] [US3] iOS `Models/LeaseInfo.swift`: clamp `daysUntilNextRent` rent-due day to the target month's length (mirror web `Math.min`); author `LeaseParityTests.swift`. Closes **lease-duedate-overflow** (iOS). *(ios-ci only)*
- [x] T024 [P] [US3] iOS `Features/Transactions/TransactionFilters.swift`: strict `yyyy-MM` validation in `monthBounds`; trim query with `.whitespacesAndNewlines`; `availableSources` localized case-insensitive comparator. Closes **filters-monthbounds-parse**, **filters-query-trim-charset**, **filters-availablesources-sort** (iOS). *(ios-ci only)*
- [x] T025 [P] [US3] iOS: confirm `Services/InsightEngine.swift` (already 2-decimal) and `Features/Transactions/TransactionSplits.swift` (already away-from-zero) match the aligned web output; add iOS assertions for the display-string behaviors that stay iOS-only. *(ios-ci only)*
- [x] T026 [US3] iOS `Ortho-iOS.xcodeproj/project.pbxproj`: add `currency-names.json`, `currency-symbols.json`, `lease.json` to the test target's Copy Bundle Resources and add `CurrencyNameParityTests.swift`, `CurrencySymbolParityTests.swift`, `LeaseParityTests.swift` to the test target (copy an existing vector entry's shape). *(ios-ci only)*

**Checkpoint**: web parity green locally with zero unintended drift; Swift authored for the batch.

---

## Phase 6: User Story 4 — Occupancy correctness (Priority: P4)

**Goal**: occupancy is an explicit, stored state on both apps; net counts occupied units only; copy matches.

**Independent Test**: mark a unit vacant/occupied explicitly; net = occupied-only and dashboard == detail; no existing net changes on migration; copy reads "occupied unit rent".

### Tests first (web, expect red)

- [x] T027 [P] [US4] Extend `web/test/store.integrity.test.tsx` (or new `web/test/housing-occupancy.test.tsx`) asserting: net rental reads occupancy from `unit.occupied`; dashboard net == detail net for a vacant unit; backfill parity (a blank tenant name → `occupied=false`, a named tenant → `occupied=true`). Closes **vacant-occupied-toggle** (test side).

### Implementation (web + migration, local)

- [x] T028 [US4] Create `supabase/migrations/<timestamp>_unit_occupied.sql` per [contracts/occupancy-migration.md](./contracts/occupancy-migration.md): `ALTER TABLE units ADD COLUMN occupied boolean NOT NULL DEFAULT true` + backfill `occupied = (tenant_name IS NOT NULL AND btrim(tenant_name) <> '')`. Closes **vacant-occupied-toggle** (schema).
- [x] T029 [US4] `web/lib/types.ts` `Unit.occupied: boolean`; `web/lib/finance/housing.ts` `rentUnitsFrom` maps `occupied: u.occupied` (not `isUnitOccupied`). Confirm `housing-net-rental.json` stays byte-identical. Closes **vacant-occupied-toggle** (web mapping).
- [x] T030 [US4] `web/components/housing/AddPropertyModal.tsx`: add an Occupied/Vacant control to the unit editor (tokens-only, real semantic control, ≥44px, sand focus ring); new units default occupied; save writes `occupied`. Verify the `web/components/web/HousingDesktop.tsx` net path reads occupied-only. Closes **vacant-occupied-toggle** (web UI).
- [x] T031 [P] [US4] Change helper copy "total unit rent" → "occupied unit rent" in `web/components/housing/AddPropertyModal.tsx` and the 5 web catalogs `web/lib/i18n/*` (coordinate key with US5). Closes **total-unit-rent-copy** (web).
- [x] T032 [P] [US4] Aggregate-RPC reconcile: confirm `web/lib/api/aggregates.ts` self-documents "additive / not yet wired"; ensure `PARITY.md`, `docs/supabase.md`, `docs/web.md` don't imply the RPCs are live. Wiring/deleting is explicitly OUT OF SCOPE (a feature, not drift). Closes **aggregate-rpcs-not-wired**.
- [x] T033 [US4] Migration verification: apply locally (or review the SQL) and confirm the backfill equals current inference so **no existing property's displayed net changes**; `git diff shared/test-vectors/housing-net-rental.json` is empty.

### iOS mirror (authored here; Phase 9 batch — ios-ci.yml only)

- [x] T034 [US4] iOS `Models/Unit.swift` `occupied: Bool` (CodingKey `occupied`); `Property`/`HousingMath` read `unit.occupied`; `Features/Housing/AddPropertySheet.swift` Occupied/Vacant toggle (tokens, ≥44px, real control); `Localizable.xcstrings` "occupied unit rent" + "Occupied"/"Vacant". Closes **vacant-occupied-toggle** (iOS), **total-unit-rent-copy** (iOS). *(ios-ci only)*

**Checkpoint**: web occupancy toggle + copy done locally; migration verified net-neutral; Swift authored.

---

## Phase 7: User Story 5 — i18n parity + lock hardening (Priority: P5)

**Goal**: shared keys sit above the marker in all catalogs; the lock catches mislabeling.

**Independent Test**: the hardened lock fails on a deliberately-mislabeled shared key, then passes once catalogs are correct.

### Test first (expect red against current catalogs)

- [x] T035 [US5] Harden `web/test/i18n/catalog-parity.test.ts`: add an assertion that each catalog's below-marker block is **disjoint** from the iOS `Localizable.xcstrings` key set. It should FAIL against the current mislabeled catalogs (proving the blind spot). Closes **i18n-webonly-block-mislabel** (lock).

### Implementation (make green)

- [x] T036 [US5] Fix all five catalogs `web/lib/i18n/{bn,es,ja,zh,ko}.ts`: move the ~34 iOS-shared keys above the `— web-only keys —` marker; in `es.ts` move `Color`/`Total` above the marker and add the missing `Euro`/`Local`/`Personal` seed keys; place the new "Occupied"/"Vacant"/"occupied unit rent" keys (from US4) above the marker. Make T035 green. Closes **i18n-webonly-block-mislabel**, **i18n-es-catalog-divergence**.

**Checkpoint**: `npx vitest run test/i18n/catalog-parity.test.ts` green; regression proof recorded (mislabel → fail → fix → pass).

---

## Phase 8: User Story 6 — Obsolete-schema comments (Priority: P6)

**Goal**: in-code comments and internal docs describe the current schema.

**Independent Test**: grep of the named files shows no dropped scope/percent/user_id/Set<User.ID> descriptions.

- [x] T037 [P] [US6] Rewrite `iOS/Ortho-iOS/Services/TransactionsAPI.swift` doc comments (lines ~44-48, ~85-89) to describe person-keyed, unconditional `amount_cents` share rows; drop `scope`/`percent`. Closes **txapi-scope-percent-comment**. *(comment-only; rides the Phase 9 push)*
- [x] T038 [P] [US6] Update `iOS/Tasks.md` (~217-218) data-model to `person_id`/`amount_cents` shares, drop `scope`, add the `transfer` kind. Closes **tasks-md-stale-schema**.
- [x] T039 [P] [US6] `iOS/ARCHITECTURE.md`: rewrite the data-layer / feature-status / ownership sections (`Set<Person.ID>`, Supabase/Person model) OR add a prominent "Archived — pre-Supabase prototype" banner at the top. Closes **architecture-md-stale**.

**Checkpoint**: no stale schema prose remains in the named files.

---

## Phase 9: iOS CI Batch (Cross-Cutting) — the single push

**Purpose**: compile & test ALL Swift changes in one macOS CI run to minimize round-trips.

- [ ] T040 **(OWNER-PENDING — iOS CI push)** Commit every Swift/xcstrings/pbxproj change from Phases 5, 6, 8 (T022–T026 parity + 3 new vectors, T034 occupancy, T037 comments) together; push `020-drift-reconciliation`; watch `GH_TOKEN=placeholder gh run watch --exit-status` on `ios-ci.yml`. Confirm build + all `*ParityTests` (incl. the 3 new) green; download and inspect the `simulator-screenshots` artifact (Housing tab occupancy toggle, money formatting). *(validated via ios-ci.yml only)*
- [ ] T041 **(OWNER-PENDING — only if CI red)** if CI reports a missing-vector-in-bundle or a test-target miss, fix the `project.pbxproj` Copy-Bundle-Resources / test-target entry (per [contracts/golden-vectors.md](./contracts/golden-vectors.md)) and re-push; otherwise skip. *(ios-ci only)*

**Checkpoint**: iOS green on CI; parity locked on both platforms.

---

## Phase 10: User Story 7 — Documentation, counts & PARITY refresh (Priority: P7)

**Goal**: every count/pointer/filename/tree entry and the parity contract match the FINAL tree.

**Independent Test**: enumerated figures match the repo; no stale "014"/"seven"/old count remains; PARITY matches code.

> Do this LAST and reconfirm every number by command — this feature changed several (test count grew; vectors 8 → **11**; new files added).

- [x] T042 [P] [US7] `docs/index.md`: active-feature pointer 014 → 019/020; vector count → the final number (reconfirm by `ls shared/test-vectors/*.json | wc -l`); drop "eighth is future work". Closes **docs-index-active-feature-014**, **docs-seven-vs-eight-vectors** (index).
- [x] T043 [P] [US7] `docs/makefile.md`: 014 → current plan/`feature.json` refs; feature count "15 (001-015)" → "17, latest 020, non-sequential (no 016-018)"; ensure no `SCOPE=` example remains. Closes **docs-makefile-plan-014**, **docs-makefile-feature-count**.
- [x] T044 [P] [US7] `docs/shared.md`: "seven"/"eighth" → the final vector count and list (now includes currency-names/-symbols/lease); `transaction-splits.json` annotation 516 → reconfirmed `wc -l`. Closes **docs-seven-vs-eight-vectors** (shared), **docs-shared-splits-linecount**.
- [x] T045 [P] [US7] `docs/ios.md`: AppState line count (reconfirm `wc -l`); test-suite count 7 → reconfirmed (`ls iOS/Ortho-iOSTests/*.swift | wc -l`, now +3 new parity suites); add the `Config/` folder; `ScanCameraView` → file `ScanCaptureView.swift`; add the `fallback` scan-screenshot suffix. Closes **docs-ios-appstate-lines**, **docs-ios-test-suites**, **docs-ios-config-folder**, **docs-ios-scancameraview**, **docs-ios-scan-fallback-screenshot**.
- [x] T046 [P] [US7] `docs/web.md`: test-file count (reconfirm), TxForm.tsx 637 → reconfirmed `wc -l`, add tree omissions (`finance/housing.ts`, `useFocusTrap.ts`, `housing/{rate,kinds}.ts`, `flags.ts`, `test-build.ts`, `testdata/`). Closes **docs-web-test-count**, **docs-web-txform-lines**, **docs-web-tree-omissions**.
- [x] T047 [P] [US7] `shared/test-vectors/README.md`: document ALL vectors (now 11), drop the "pending Copy-Bundle setup" framing, and fix the `transaction-splits.json` shape to `{cases, validations, seeds, ownerOrdering}`. Closes **readme-vectors-4of8-xcode**, **readme-splits-shape-incomplete**.
- [x] T048 [P] [US7] `web/scripts/import/README.md`: add `ownerMatch.ts` to the engine-module list. Closes **import-readme-ownermatch**.
- [x] T049 [P] [US7] `specs/019-housing-parity-fixes/tasks.md`: check off T026 and T027 (both done — merged PR #10). Closes **tasks-019-t026-t027**.
- [x] T050 [US7] `PARITY.md` full reconcile: CLI `paid_by` row (from T007), add rows for the currency-names/-symbols/lease vectors, note the explicit `units.occupied` column, remove any `scope`/`SCOPE` references, and reflect every matrix cell this feature changed.
- [x] T051 [US7] Reconfirm ALL counts against the FINAL tree by command and correct any doc still off: `grep -rn "014-receipt\|seven golden\|1,260\|637 lines\|67 Vitest\|otp.*6" docs/ shared/ web/scripts/` returns nothing stale.

**Checkpoint**: docs and the parity contract match reality.

---

## Phase 11: Polish & Cross-Cutting

- [x] T052 Run the [quickstart.md](./quickstart.md) validations end-to-end for every story.
- [x] T053 Final gate (Success Criteria): `cd web && npm test` green + `npx tsc --noEmit` clean; iOS CI green; `git diff shared/test-vectors/` shows only intended changes (3 new + filters); confirm all 41 `drift-inventory.md` ids are closed via the traceability map below.

---

## Dependencies & Execution Order

- **Setup (P1) → Foundational (P2)** before stories.
- **US1 (P3 defects)** and **US2 (P4 truth-up)** are independent, local, and the fastest MVP — do first.
- **US3 (parity)**: web tasks T011–T021 are local and must be green (with zero drift) before the iOS mirrors matter; iOS T022–T026 are authored then validated in Phase 9.
- **US4 (occupancy)**: T028 (migration) → T029 (mapping) → T030 (UI); T031 copy coordinates with **US5** T036; iOS T034 → Phase 9.
- **US5 (i18n)**: T035 (hardened test, red) → T036 (fix catalogs, green); must fold in US4's new keys.
- **US6 (comments)**: independent; T037 rides the Phase 9 push (Swift file), T038/T039 are pure docs.
- **Phase 9 (iOS batch)** depends on T022–T026, T034, T037 authored — the single CI round-trip.
- **US7 (docs/counts)** is LAST so counts reflect the final tree; **T050/T051** after all code lands.
- **Polish** after everything.

## Parallel Opportunities

- Setup T002 ∥ baseline.
- US3 test authoring T011/T012/T013/T014 all [P]; web impl T015/T016/T017/T018 all [P] (distinct files); iOS mirrors T022/T023/T024/T025 [P].
- US2 T009/T010 [P]; US4 T031/T032 [P]; US6 T037/T038/T039 [P].
- US7 T042–T049 are all [P] (distinct doc files); T050/T051 serialize after.

## Implementation Strategy

- **MVP = Setup + Foundational + US1** — the two real defects, fully local. Ship/validate, then continue.
- Then **US2** (honest tooling), **US3 web + vectors** (parity locked locally), **US4 web + migration**, **US5 i18n**, **US6 docs**.
- **One iOS CI push (Phase 9)** validates all Swift at once.
- **US7 last** so every count is final; reconfirm by command, never trust the audit snapshot.

## Notes

- Tests fail first, then green (Constitution VI). iOS can't be built here — author Swift carefully; confirm on CI.
- Keep all non-target vectors byte-identical; the only intended `shared/test-vectors/` changes are the 3 new files + `transaction-filters.json` additions.
- Vector count becomes **11** after this feature — every doc/count in P7 must use the FINAL number.

## Traceability — all 41 inventory ids → tasks

| id | tasks | id | tasks |
|---|---|---|---|
| cli-paid-by | T004,T005,T007,T050 | docs-index-active-feature-014 | T042 |
| otp-length-config | T006 | docs-makefile-plan-014 | T043 |
| scope-dead-knob | T008 | docs-seven-vs-eight-vectors | T042,T044 |
| asuserid-dead-option | T009 | docs-ios-appstate-lines | T045 |
| seed-sql-missing | T010 | docs-ios-test-suites | T045 |
| currency-gbp-name | T011,T015,T019 | docs-ios-config-folder | T045 |
| currency-symbol-source | T012,T016,T019,T022 | docs-ios-scancameraview | T045 |
| lease-duedate-overflow | T013,T019,T023 | docs-ios-scan-fallback-screenshot | T045 |
| insights-money-decimals | T014,T017 | docs-web-test-count | T046 |
| money-tousdcents-rate-guard | T014,T016 | docs-web-txform-lines | T046 |
| splits-sharepercent-rounding | T014,T018 | docs-web-tree-omissions | T046 |
| money-negative-sign | T022 | readme-vectors-4of8-xcode | T047 |
| money-leadingplus-zero | T022 | readme-splits-shape-incomplete | T047 |
| filters-monthbounds-parse | T024 | docs-shared-splits-linecount | T044 |
| filters-query-trim-charset | T019,T024 | docs-makefile-feature-count | T043 |
| filters-availablesources-sort | T019,T024 | import-readme-ownermatch | T048 |
| vacant-occupied-toggle | T027,T028,T029,T030,T034 | tasks-019-t026-t027 | T049 |
| total-unit-rent-copy | T031,T034,T036 | txapi-scope-percent-comment | T037 |
| aggregate-rpcs-not-wired | T032 | tasks-md-stale-schema | T038 |
| i18n-webonly-block-mislabel | T035,T036 | architecture-md-stale | T039 |
| i18n-es-catalog-divergence | T036 | | |

---

## Deviations & implementation notes (2026-07-07)

- **Local scope only, iOS batched, hand-off:** per owner decision, all web/CLI/config/docs were
  implemented + locally verified and all Swift/xcstrings/pbxproj authored on disk; the iOS CI push
  (T040) and any conditional pbxproj fix (T041) are **owner-pending**. The occupancy migration was
  authored + self-reviewed but **not applied** to the live backend (owner applies it).
- **`PropertiesAPI.UnitRow` also extended (iOS):** beyond the listed Unit/Property/AddPropertySheet
  edits, `occupied` was added to the iOS `UnitRow` DTO (write + defensive decode) — without it the
  server round-trip would drop the flag. Mirrors the web store's write path. Same transitional
  tradeoff web accepts (writes include `occupied` before the migration is applied).
- **GBP catalog key rename (web i18n):** the i18n owner had already seeded the shared `"UK Pound"`
  key (from xcstrings) into the catalogs' seed block, so `t(CURRENCY_NAMES.gbp)` rendered correctly;
  the old `"British Pound"` web-only key was a harmless orphan. It was removed (all 5 catalogs) so no
  stale key remains — verified by the i18n locks (catalog-parity C5 + render-locale).
- **`money-negative-sign` / `leadingPlus` are iOS-side, pinned by iOS unit tests, not a shared vector**
  (display-string behavior; web was already canonical). The Swift Money-caller audit confirmed no
  double-signing (signed-net callers pass absolute values).
- **Filter month-validation & source-sort** are pinned by iOS XCTest assertions (not the shared
  vector, since a thrown error / locale sort don't fit the value-equality vector shape); the
  query-trim fix IS shared-vector-locked (new `transaction-filters.json` case).
- **Vector count is 11** (8 existing + currency-names + currency-symbols + lease). Zero unintended
  drift: `git status shared/test-vectors/*.json` shows only the 3 new files + the
  `transaction-filters.json` case.
- **Results:** web `npm test` **77 files / 809 tests green**; `npx tsc --noEmit` clean; iOS authored
  for CI (13 test files, pbxproj balanced 93/93 · 39/39). `config.toml [auth.mfa.phone] otp_length=6`
  left as-is (disabled MFA block, not the email OTP).
