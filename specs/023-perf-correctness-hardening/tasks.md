---
description: "Task list for Web + iOS Performance & Correctness Hardening (spec 023)"
---

# Tasks: Web + iOS Performance & Correctness Hardening

**Input**: Design documents from `/specs/023-perf-correctness-hardening/` (plan.md, spec.md,
research.md D1–D16, data-model.md, contracts/, quickstart.md, audit-findings.md).

**Tests**: INCLUDED and test-first — constitution Principle VI (FR-025) is non-negotiable; each
correctness bug fix lands behind a failing repro test written first.

**All paths are relative to the repo root.** The app package is `web/`; run npm commands from `web/`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable (different files, no dependency on an incomplete task)
- **[Story]**: US1 (money), US2 (perf quick wins), US3 (month insights), US4 (iOS), US5 (web copy),
  US6 (structural perf), US7 (type-safety/refactor)

## Constraints that apply to EVERY task (from plan.md / research.md / constitution)

- **Static-export-safe**: never touch `web/next.config.ts`'s `output: 'export'`; no server
  route/action/middleware; any dynamic import uses `{ ssr: false }` where it renders UI.
- **Behavior/pixel-identical for perf & refactor** (US2/US6/US7): the finance regression-vector
  parity suites + full Vitest + `npx tsc --noEmit` MUST stay green with **no vector regeneration**.
  The ONLY sanctioned vector change is the reviewed B2 month-select diff (T019).
- **Test-first for every bug fix** (US1/US3/US4/US5, FR-025): the failing repro precedes the fix.
- **Money = integer USD cents; tokens only** — no new color/token; the only copy change is B6 (8-digit).
- **iOS is CI-verified**: a Linux sandbox cannot build iOS; Swift/native-lifecycle changes are
  build-verified by `capacitor-ios-ci.yml` on push + a manual device check.
- **`aggregates.ts` = KEEP documented-unwired** — do NOT wire it (research D15).

---

## Phase 1: Setup (Shared)

- [ ] T001 [P] Record the pre-change 023 bundle baseline: from `web/` run `npm install`, `npm run build`, then `npm run measure:bundle -- --json ../specs/023-perf-correctness-hardening/baseline.json`; confirm the i18n catalogs are classified into initial-load and record the initial-load raw/gzip number (SC-002 baseline). No code change.
- [ ] T002 [P] Confirm a clean green baseline: from `web/` run `npm test` (all green) and `npx tsc --noEmit` (clean) to pin the pre-change state. No code change.

**Checkpoint**: baseline recorded; branch builds/tests green.

---

## Phase 2: Foundational (Blocking Prerequisites)

*None. This is a hardening pass over disjoint seams — there is no shared model/schema/auth layer to
build first. The type-safety boundary (US7) is intentionally LAST so it can absorb the US6 `loadAll`
column projection. Proceed to Phase 3.*

---

## Phase 3: User Story 1 - Money stays correct in any display currency (Priority: P1) 🎯 MVP

**Goal**: The #1 money invariant (`sum(shares) === amount_cents`) holds when editing split
transactions in any display currency; settle-up zeroes the balance; a failed write never persists a
broken split (per `contracts/correctness-fixes.md` C-B1/C-B7 + research D6/D11/D10-settle).

**Independent test**: In GBP, open a value-split transaction, save unchanged → shares still sum to
the total, no false block; settle up → balance is exactly zero; force a double write-failure → the
row is not presented as consistent.

- [ ] T003 [P] [US1] Write FAILING repro test in `web/test/web/txform-fx-split.test.tsx` (jsdom): GBP display currency, a 2-owner value split (dossier cases 2¢→1/1 and 11¢→2/9); assert the current code either false-blocks Save (`canSave===false`) or writes `sum(shares) !== amount_cents` on a no-op save.
- [ ] T004 [US1] Fix B1 in `web/components/web/TxForm.tsx`: on a no-op edit (`editing && amount === originalAmountText`) reuse `editing.shares` verbatim; seed/validate/compute the split against `finalCents`, not the re-parsed display `cents`. Keep the existing parent-total guard. Make T003 pass.
- [ ] T005 [P] [US1] Write FAILING repro test for the non-USD settle-up cent (B9-settle) in `web/test/web/settle-up-currency.test.tsx`: assert the current GBP settle-up transfer amount drifts ±1¢ from `balanceBetween`.
- [ ] T006 [US1] Fix B9-settle: carry the exact USD-cents balance from `web/components/transactions/BalanceSummary.tsx` into the transfer prefill (reuse `amountCents` verbatim when the amount field is untouched) so the transfer zeroes the balance. Make T005 pass.
- [ ] T007 [P] [US1] Write FAILING repro test for B7 in `web/test/store/atomic-write-rollback.test.tsx`: mock the Supabase client so the primary write fails AND the compensating delete/update also fails; assert the current code drops/normalizes the share-less row (would rehydrate "creator owns all").
- [ ] T008 [US1] Fix B7 in `web/lib/store.tsx` (`addTransaction`/`updateTransaction`): check the results of the compensating delete/update/`writeShares`; on failure keep the error banner up and do NOT present the affected row as consistent. Make T007 pass. (True atomicity via RPC stays out of scope — note in `PARITY.md`.)
- [ ] T009 [US1] Verify US1: `npm test` (T003/T005/T007 now pass, all suites green), `npx tsc --noEmit` clean, and confirm `shared/test-vectors` is unchanged (no money-math output change).

**Checkpoint**: the HIGH money bug is fixed and money correctness holds in any currency — shippable on its own.

---

## Phase 4: User Story 2 - The app opens fast and scrolls smoothly (Priority: P1) 🎯 MVP

**Goal**: Lazy-load i18n (P1), memoize `Intl` formatters (P2) and dashboard aggregations (P3) — less
download, less repeated work, byte-identical output (per `contracts/perf-boundaries.md` C-P1/2/3).

**Independent test**: build → non-active catalogs absent from initial-load and a default-language
user fetches none, measured initial-load below baseline; `npm test` green with vectors byte-identical.

- [ ] T010 [P] [US2] Write FAILING guard test `web/test/i18n/no-eager-catalog.test.ts`: assert no module on the initial-load path statically imports the `es|ja|zh|ko|bn` catalogs (mirrors spec-022's `no-eager-recharts`).
- [ ] T011 [US2] P1: lazy-load catalogs in `web/lib/i18n/index.ts` + `web/lib/store.tsx` — dynamic-`import()` only the active language's catalog in the store's after-mount preference path; `makeT` returns English identity until it resolves, then re-renders. Make T010 pass. (Shared file with T029/T040 — sequence, not parallel.)
- [ ] T012 [US2] Update `web/test/i18n/render-locale.test.tsx` to `await` the async catalog load (behavior-preserving) and still assert no English leak once loaded.
- [ ] T013 [US2] Verify the P1 bundle win: `npm run build` → `npm run measure:bundle -- --baseline ../specs/023-perf-correctness-hardening/baseline.json`; confirm catalogs moved out of initial-load and initial-load gzip decreased; record the delta.
- [ ] T014 [P] [US2] P2: add a module-level `Intl.NumberFormat` cache in `web/lib/finance/money.ts` and an `Intl.DateTimeFormat` cache in `web/lib/format.ts`, each keyed by all output-affecting args. Output byte-identical (vectors green, no regen).
- [ ] T015 [P] [US2] P3: memoize the three unmemoized dashboard aggregations — `useMemo` in `web/components/dashboard/InsightsCardStack.tsx`, `MonthSummaryCard.tsx`, and `BudgetProgressCard.tsx` (BudgetProgress computes one grouped in-range slice instead of per-category whole-array rescans). Identical rendered content.
- [ ] T016 [US2] Verify US2: `npm test` (T010/T012 pass; regression vectors byte-identical, NOT regenerated), `npx tsc --noEmit`; record the cumulative bundle delta.

**Checkpoint**: MVP complete (US1+US2) — money-correct and measurably faster, both targets, no visual change.

---

## Phase 5: User Story 3 - Budget insights read correctly for any selected month (Priority: P2)

**Goal**: Month-scoped insights use the selected month's real elapsed time; the "under budget" card
can fire in month-select mode (per C-B2 / research D7).

**Independent test**: select a completed under-budget month → correct day-count + the positive card appears.

- [ ] T017 [P] [US3] Write FAILING repro test in `web/test/finance/insights-month-select.test.ts`: a completed past month + under-budget spend; assert the current output shows ~14 "days left" and never fires the under-budget card.
- [ ] T018 [US3] Fix B2: derive `daysLeft`/`monthProgress` from the selected interval (a completed past month is fully elapsed) in `web/components/dashboard/range.ts` and/or `web/lib/finance/insights.ts`; leave the current-month/default path unchanged. Make T017 pass.
- [ ] T019 [US3] Regenerate the affected vectors: `npm run gen:vectors`; `git diff shared/test-vectors` MUST show ONLY month-select day-count/rule fields changing (current-month/default unchanged) — review, then stage the reviewed diff. This is the sole sanctioned vector change.
- [ ] T020 [US3] Verify US3: `npm test` (incl. T017) + `npx tsc --noEmit`.

**Checkpoint**: insights are trustworthy for any month.

---

## Phase 6: User Story 4 - iOS feels native and keeps your place (Priority: P2)

**Goal**: Scan camera dismisses + multi-page kept (B3), biometric unlock preserves state (B4),
foreground catches a revoked session (B5), status bar matches theme from launch (B10), no double
Face ID (B9) — per C-B3/4/5/9/10, research D8/D9/D10. **iOS-runtime items verified via CI + device.**

**Independent test**: device check — capture dismisses to review (multi-page kept); Face-ID unlock, no
reload; forced theme → readable status bar from launch; server-revoke → foreground signs out.

- [ ] T021 [P] [US4] B5: write a FAILING store test in `web/test/store/foreground-liveness.test.tsx` asserting the `appStateChange` handler calls `getSession`; then change `web/lib/store.tsx` to `supabase.auth.getUser()` (server round-trip) and drive sign-out on its error. Make it pass. (store.tsx — sequence after T008.)
- [ ] T022 [P] [US4] B3 (JS): wire `web/lib/scan/useScanFlow.ts` to `ScanPlugin.onPageCaptured` (accumulate pages, parse on an explicit "Done"); add a mocked-plugin test asserting multi-page pages are retained.
- [ ] T023 [US4] B3 (Swift): dismiss `ScanCaptureController` in `deliverFirstCapture` for the single-shot flow and wire the multi-page "done" path; clean up temp JPEGs — `web/ios/App/App/Plugins/Scan/ScanCaptureController.swift` + `ScanPlugin.swift`. Build-verified by iOS CI (T045).
- [ ] T024 [US4] B4: render the biometric lock as an overlay OVER a kept-mounted `AppStateProvider` in `web/app/(app)/layout.tsx` (remove the early-return unmount); add a jsdom test asserting the provider is not unmounted (and `runBootstrap` does not re-run) when the gate toggles locked→unlocked.
- [ ] T025 [P] [US4] B10: call `applyAppearance(readAppearance())` once at app-shell mount (or add `StatusBar.setStyle` to the boot path) so the status-bar style matches the theme from first launch and on every tab — `web/app/(app)/layout.tsx` and/or `web/app/layout.tsx` + `web/components/settings/appearance.ts`.
- [ ] T026 [P] [US4] B9: guard `web/lib/biometricGate.ts` against re-entrant `attemptUnlock` (ignore `appStateChange` while unlocking) and/or debounce the foreground re-auth; unit-test the guard logic.
- [ ] T027 [US4] Verify US4 (web-testable parts): `npm test` (T021/T022/T024/T026) + `npx tsc --noEmit`; the Swift/native items (T023, T025-native, status bar) are build-verified in T045 and by a manual device check.

**Checkpoint**: iOS native-feel + session-liveness fixes in; pending iOS CI/device confirmation.

---

## Phase 7: User Story 5 - Web niceties and correct copy (Priority: P2)

**Goal**: Browser text selection/copy works (B8); sign-in copy reads 8-digit (B6) — per C-B8/C-B6.

**Independent test**: browser build — select/copy an amount and a merchant name; sign-in caption says 8-digit.

- [ ] T028 [P] [US5] B8: write a FAILING test in `web/test/appearance/user-select-native-gate.test.ts` that the `-webkit-user-select:none` shell rule applies on the web build; then native-gate it in `web/app/globals.css` behind a native platform class set in the boot path (`web/app/layout.tsx`) when `Capacitor.isNativePlatform()`. Make selection work on web; iOS keeps long-press suppression.
- [ ] T029 [P] [US5] B6: correct "6-digit" → "8-digit" in the sign-in caption string across `web/lib/i18n/*` (and the English source); add/keep a test asserting no "6-digit" string remains and the sign-in render shows 8-digit. (Shared i18n files with T011/T040 — sequence.)
- [ ] T030 [US5] Verify US5: `npm test` + `npx tsc --noEmit`.

**Checkpoint**: small web correctness leaks closed.

---

## Phase 8: User Story 6 - Responsive at scale (Priority: P3) — structural

**Goal**: Split + memoize the store context so unrelated changes stop re-rendering all consumers
(P4), and column-project `loadAll` (P5) — per C-P4/C-P5, research D4/D5. Highest large-ledger payoff,
riskiest change; lands after the P1/P2 wins.

**Independent test**: with a large ledger, one unrelated mutation re-renders only affected components;
`loadAll` fetches only used columns with identical in-app data.

- [ ] T031 [P] [US6] Write a FAILING render-count test in `web/test/store/context-render-isolation.test.tsx`: assert that an unrelated state change (one optimistic add / FX refresh) currently re-renders an unrelated `TransactionRow`.
- [ ] T032 [US6] P4: split `web/lib/store.tsx` into a stable actions/services context (mutations + `resolveUser`/`t`/`formatMoney`/`ownersDisplay`, `useCallback`/`useMemo`-stabilized) vs a changing-data context, behind the SAME `useApp()` surface (no consumer import changes). `formatMoney` identity must still change on currency/rate/locale change. (store.tsx — sequence after T008/T021.)
- [ ] T033 [US6] P4: `React.memo` `web/components/transactions/TransactionRow.tsx` and the desktop `TxRow` in `web/components/web/TransactionsDesktop.tsx`. Make T031 pass (unrelated mutation skips unchanged rows).
- [ ] T034 [US6] P5: column-project the `select('*')` queries in `web/lib/store.tsx` `loadAll` (`transactions`, `transaction_shares`, `users`) to exactly the fields the app reads; store tests stay green with identical data. (No windowing — deferred.)
- [ ] T035 [US6] Verify US6: `npm test` (all store + component behavior identical), `npx tsc --noEmit`. OPTIONAL follow-on: virtualize the ledger ONLY if it introduces no scroll/visual regression; otherwise `log` it as a deferred fast-follow (research D4).

**Checkpoint**: large-ledger responsiveness improved with zero behavior change.

---

## Phase 9: User Story 7 - A codebase that's safe to change (Priority: P3)

**Goal**: Compile-time-safe Supabase boundary (FR-018), typed transfer accessor (FR-019), dedup
(FR-020), dead-code purge + reachability guard (FR-021/022) — per `contracts/type-safety.md`, research
D12/D13/D14/D16/D15. Pure refactors: existing tests + `tsc` are the acceptance instrument.

**Independent test**: a scratch column rename now fails `tsc`; a stray i18n key fails the guard;
deduped helpers have a single definition.

- [ ] T036 [US7] FR-018: type the Supabase→domain boundary — generate `web/lib/supabase/database.types.ts` (`supabase gen types`) and type the client `SupabaseClient<Database>`, OR (fallback) add typed `Row` interfaces + a mapper module; replace the `data as T[]` / `(m: any)`/`(l: any)` casts in `web/lib/store.tsx` `loadAll` with checked conversions, kept in lockstep with the T034 column lists. (store.tsx — sequence after T034.)
- [ ] T037 [P] [US7] FR-019: add `isTransfer(tx)` + `transferParties(tx)` in `web/lib/types.ts` (or new `web/lib/transaction.ts`); route the ~8 hand-branched sites (`store`, `TxForm`, `TransactionRow`, `TransactionDetailBody`, `TransactionsDesktop`, `TxModalWeb`, `balances`, `TransactionDetailModal`) through it. Grep confirms no direct `kind === 'transfer'`/`owner_ids[0]` outside the accessor.
- [ ] T038 [P] [US7] FR-020: extract `web/lib/useMonthAccordion.ts` from the mobile+desktop duplication and use it in `web/app/(app)/transactions/page.tsx` and `web/components/web/TransactionsDesktop.tsx`.
- [ ] T039 [P] [US7] FR-020: extract a shared `<TxFormBody>` component from the duplicated assembly in `web/components/web/TxModalWeb.tsx` and `web/components/web/TxForm.tsx`; both wrap it. (TxForm.tsx — sequence after T004.)
- [ ] T040 [P] [US7] FR-021: purge the ~200 dead i18n keys (diff catalog keys vs reachable `t()` calls + an allowlist of dynamic sources) across `web/lib/i18n/*`; add `web/test/i18n/catalog-reachability.test.ts` asserting every key is reachable or allowlisted. (Shared i18n files with T011/T029 — sequence.)
- [ ] T041 [P] [US7] FR-022: delete the orphaned `relativeTime` in `web/lib/format.ts` (grep-confirm zero refs first); resolve `web/lib/api/aggregates.ts` = KEEP documented-unwired (add a one-line status note; do NOT wire it).
- [ ] T042 [US7] Verify US7: `npx tsc --noEmit` (typed boundary — a scratch column rename now fails), `npm test` (guard + all green), and the grep checks from quickstart.md §US7.

**Checkpoint**: codebase hardened against future breakage; no user-facing change.

---

## Phase 10: Polish & Cross-Cutting Concerns

- [ ] T043 [P] Update `docs/web.md` (i18n lazy-load, `Intl` formatter cache, store-context split, typed Supabase boundary, dead-key reachability guard) and add a note to `PARITY.md` where a capability row applies (B7 client-side compensation; aggregates kept unwired).
- [ ] T044 Final verification pass from `web/`: `npm run build` (static export succeeds, `out/` produced), `npm run measure:bundle -- --baseline ../specs/023-perf-correctness-hardening/baseline.json` (record the cumulative initial-load delta — SC-002), `npm test` (all green incl. regression-vector parity suites), `npx tsc --noEmit` (clean).
- [ ] T045 Push `023-perf-correctness-hardening`; watch web CI and the Capacitor iOS build with `GH_TOKEN=placeholder gh run watch --exit-status` to confirm `web-ci.yml` AND `capacitor-ios-ci.yml` stay green (the only iOS signal from a Linux sandbox — SC-005/SC-007).

---

## Dependencies & Execution Order

- **Setup (Phase 1)** → **US1 (Phase 3)** + **US2 (Phase 4)** are the P1 MVP; do them first, in either order (disjoint except see shared-file notes). Phase 2 is empty.
- **US3, US4, US5 (P2)** are mutually independent and can follow the MVP in any order / in parallel by different workers.
- **US6 (P3, structural)** should land after the MVP so P2/P3 perf gains are already in and the context split is done behind stable behavior tests. **US7 (P3)** last so FR-018 typing absorbs the US6 `loadAll` column projection.
- Within each story: the **repro/guard test precedes the fix**, and a **verify task closes** the story.

### Shared-file serialization points (NOT parallel with each other)

- **`web/lib/store.tsx`**: T008 (B7) → T021 (B5) → T032 (P4 split) → T034 (P5 projection) → T036 (typing). Do in this order.
- **`web/components/web/TxForm.tsx`**: T004 (B1 fix) → T039 (`<TxFormBody>` extract).
- **`web/lib/i18n/*`**: T011 (lazy-load) → T029 (B6 string) → T040 (dead-key purge + guard).
- **`web/lib/format.ts`**: T014 (DateTimeFormat cache) → T041 (delete `relativeTime`).

### Parallel opportunities

- Setup: T001 ∥ T002.
- US1: T003 ∥ T005 ∥ T007 (repro tests, different files); fixes T004/T006 ∥ each other, T008 gated on T007.
- US2: T014 ∥ T015 (money.ts vs dashboard cards); T011 is on the i18n critical path.
- US4: T021 ∥ T022 ∥ T025 ∥ T026 (disjoint); T023 (Swift) ∥ the web tasks.
- US7: T037 ∥ T038 ∥ T040 ∥ T041 (disjoint files); T036/T039 gated on their store/TxForm predecessors.

## Independent Test Criteria (per story)

- **US1**: GBP no-op split save keeps `sum(shares)===amount_cents` + `canSave`; settle-up zeroes; double-fail write not normalized (T003/T005/T007 green).
- **US2**: non-active catalogs absent from initial-load, default user fetches none, measured initial-load < baseline; vectors byte-identical (T010/T013/T016).
- **US3**: past under-budget month shows correct day-count + fires the positive card; only month-select vectors change (T017/T019).
- **US4**: camera dismisses + multi-page kept; unlock preserves state (no re-bootstrap); foreground `getUser` catches revocation; status bar matches from launch (T021/T022/T024/T026 + iOS CI/device).
- **US5**: web select/copy works; sign-in says 8-digit (T028/T029).
- **US6**: unrelated mutation re-renders only affected rows; `loadAll` projected with identical data (T031/T034).
- **US7**: scratch column rename fails `tsc`; stray i18n key fails the guard; helpers deduped (T042).

## Suggested MVP scope

**US1 (money-correctness) + US2 (perf quick wins).** Both P1 — together they fix the HIGH money bug
and deliver the largest, lowest-risk speed win (measured), fully green. US3–US7 are incremental
follow-ons in the same PR or fast-follows.

## Implementation Strategy

Incremental and measured: land the MVP (US1+US2) first — repro-test-then-fix the money bug, then the
i18n/formatter/aggregation wins verified against the recorded baseline. Then US3/US4/US5 (P2), each
behind its failing repro and closed by a verify task. Then the structural US6 (context split behind
stable behavior tests) and US7 (typing/dedup/dead-code). Every story ends green on `npm test` +
`npx tsc --noEmit`; perf/refactor stories additionally prove the regression vectors are byte-identical
(no regen except the reviewed B2 diff). The branch push is gated on BOTH web CI and the Capacitor iOS
CI staying green (T045).
