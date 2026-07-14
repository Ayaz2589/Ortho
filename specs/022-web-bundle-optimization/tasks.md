---
description: "Task list for Web Bundle Optimization (static-export-safe code-splitting)"
---

# Tasks: Web Bundle Optimization (Static-Export-Safe Code-Splitting)

**Input**: Design documents from `/specs/022-web-bundle-optimization/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: INCLUDED and test-first — the constitution (Principle VI) is non-negotiable; each split
lands behind a failing test written first.

**All paths are relative to the repo root.** The app package is `web/`; run npm commands from `web/`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable (different files, no dependency on an incomplete task)
- **[Story]**: US1 (charts), US2 (scan), US3 (form-factor), US4 (measurement)

## Constraints that apply to EVERY task (from plan.md / research.md)

- Static-export-safe: never edit `web/next.config.ts`'s `output: 'export'`; no server route/action/
  middleware; every dynamic import uses `{ ssr: false }`.
- Delivery-only: no computed result, behavior, visual, or design-token change; the finance
  regression-vector parity suites must stay green untouched.
- Verify each split with `npm run build` + `npm run measure:bundle` (before/after) + `npm test` +
  `npx tsc --noEmit`.

---

## Phase 1: Setup (Shared Infrastructure)

- [X] T001 Verify a clean baseline on branch `022-web-bundle-optimization`: from `web/` run `npm install`, `npm run build`, `npm test`, `npx tsc --noEmit` — all green — to establish the pre-change state (no code change in this task).
- [X] T002 [P] Add `"measure:bundle": "tsx scripts/measure-bundle.ts"` to the `scripts` block of `web/package.json`, and create empty placeholder files `web/scripts/measure-bundle.ts` and `web/test/bundle/` (dir) for the following phase.

**Checkpoint**: branch builds/tests green; measurement script slot exists.

---

## Phase 2: Foundational (Blocking Prerequisites)

*No cross-cutting foundational code beyond Setup — the measurement instrument is User Story 4 below
and is sequenced first because it is the acceptance instrument for US1–US3. There is no shared model/
schema/auth layer to build (this is a delivery-only feature).*

**Checkpoint**: proceed to Phase 3 (US4), which every later story's validation depends on.

---

## Phase 3: User Story 4 - Every split is measured, not assumed (Priority: P1)

**Goal**: A repeatable, headless before/after measurement of built chunk sizes (per
`contracts/bundle-measurement.md` + `data-model.md §3`).

**Independent test**: run the script on the current `out/`; it prints initial-load + per-chunk sizes;
saved as JSON and re-run after a change, it reports the delta.

- [X] T003 [P] [US4] Write FAILING unit tests in `web/test/bundle/measure-bundle.test.ts` for the pure functions `aggregate`, `classify`, `formatBytes`, and `diff` using synthetic chunk lists (no filesystem), per `contracts/bundle-measurement.md`.
- [X] T004 [US4] Implement `web/scripts/measure-bundle.ts` to pass T003: pure `aggregate`/`classify`/`formatBytes`/`diff`, an impure `readChunks(dir)` (raw size + `zlib.gzipSync` gzip size), and the CLI flags `--json` / `--baseline` / `--compare` / `--chunks-dir`; print the human-readable table and (with `--json`) write the report JSON.
- [X] T005 [US4] Capture the baseline: from `web/` run `npm run build` then `npm run measure:bundle -- --json ../specs/022-web-bundle-optimization/baseline.json`; confirm the printed report shows a `recharts`-bearing chunk classified as initial-load, and record the Initial-load JS (raw/gzip) number in the PR/notes (SC-006 baseline).

**Checkpoint**: measurement works and the pre-split baseline is recorded — US1–US3 can now be measured.

---

## Phase 4: User Story 1 - Faster first load by deferring charts (Priority: P1) 🎯 MVP

**Goal**: `recharts` leaves the initial/shared chunk; chart cards' money figures/legend paint
immediately, chart canvas streams in (per `research.md D1–D2`, `contracts/code-split-boundaries.md`).

**Independent test**: build → `recharts` is an async chunk, absent from initial-load; Dashboard numbers
paint first, charts render identically after load; chart-free routes fetch no `recharts`.

- [X] T006 [P] [US1] Write FAILING tests (Testing Library) asserting `SpendByCategoryCard` renders its legend/per-category figures synchronously (no chart present) AND, after awaiting the dynamic import, renders the same chart content/accessible DOM as today. File: `web/test/dashboard/spend-by-category.split.test.tsx` (align with existing test naming if present).
- [X] T007 [P] [US1] Write a FAILING split-integrity guard test in `web/test/bundle/no-eager-recharts.test.ts`: assert that no eager module under `web/components/dashboard/` or `web/components/housing/` contains a static `from 'recharts'` — only `components/**/charts/*` leaves may.
- [X] T008 [P] [US1] Extract the `recharts` subtree from `web/components/dashboard/SpendByCategoryCard.tsx` into new `web/components/dashboard/charts/CategoryPie.tsx`; in the card, load it via `next/dynamic(() => import('./charts/CategoryPie'), { ssr: false, loading: <fixed-height reserved placeholder> })`; keep legend/figures eager.
- [X] T009 [P] [US1] Same pattern: `web/components/dashboard/DailySpendTrendCard.tsx` → new `web/components/dashboard/charts/DailyTrendChart.tsx`, dynamic-imported with `ssr:false` + reserved placeholder.
- [X] T010 [P] [US1] Same pattern: `web/components/housing/MortgageCards.tsx` → new `web/components/housing/charts/AmortizationChart.tsx`, dynamic-imported with `ssr:false` + reserved placeholder.
- [X] T011 [US1] Verify US1: `npm run build` → `npm run measure:bundle -- --baseline ../specs/022-web-bundle-optimization/baseline.json` shows `recharts` moved to an async chunk and initial-load raw/gzip decreased; `npm test` (incl. T006/T007 now passing and all parity suites green) and `npx tsc --noEmit` pass; record the delta.

**Checkpoint**: MVP delivered — the single largest initial-load reduction, measured and green.

---

## Phase 5: User Story 2 - Defer the scan pipeline until a scan starts (Priority: P2)

**Goal**: `ScanFlow → components/scan/* → lib/scan/*` leaves the Transactions route's initial load and
loads on demand when a scan starts (per `research.md D3`).

**Independent test**: build → scan modules not in the Transactions initial load; open Transactions with
no scan → scan chunk not fetched; initiate a scan → it loads and behaves identically; re-initiate → no
re-fetch.

- [X] T012 [P] [US2] Write a FAILING test asserting the Transactions route renders its non-scan UI without importing the scan modules, and that initiating a scan loads `ScanFlow` (await) with unchanged capture→parse→prefill behavior. File: `web/test/scan/scan-deferred.test.tsx`.
- [X] T013 [US2] Replace the static `ScanFlow` import with `next/dynamic(() => import('@/components/web/ScanFlow'), { ssr: false })` at its render sites — `web/app/(app)/transactions/page.tsx` (mobile) and `web/components/web/TxForm.tsx` (desktop scan entry) — gated on the scan-initiated state so the chunk loads only on initiate; do not modify `ScanFlow`'s body.
- [X] T014 [US2] Verify US2: `npm run build` → `npm run measure:bundle -- --baseline …/baseline.json` shows `lib/scan/*` no longer in the Transactions initial-load chunk (now async); `npm test` (incl. T012) and `npx tsc --noEmit` green; record the delta.

**Checkpoint**: scan pipeline deferred; a primary route slimmed for non-scan sessions.

---

## Phase 6: User Story 3 - Each form factor stops carrying the other's interface (Priority: P3)

**Goal**: the `*Desktop` compositions become on-demand chunks; mobile/iOS never downloads them and the
synchronous, flash-free breakpoint decision is preserved (per `research.md D4`, FR-008/FR-009).

**Independent test**: build → `*Desktop` are async chunks absent from the mobile initial load; at ≥1024
the desktop composition renders with no mobile-layout flash; at <1024 the desktop chunk is never
fetched.

- [X] T015 [P] [US3] Write a FAILING test asserting each route selects the desktop composition synchronously via `useIsExpanded()` and renders it (await the dynamic import) with the same content, and that the mobile branch renders with no wrong-layout flash. File: `web/test/web/form-factor-split.test.tsx`.
- [X] T016 [P] [US3] In `web/app/(app)/dashboard/page.tsx`, replace the static `DashboardDesktop` import with `next/dynamic(() => import('@/components/web/DashboardDesktop'), { ssr: false, loading: <neutral, correctly-sized, NON-mobile placeholder> })`; keep the synchronous `useIsExpanded()` gate and the eager mobile branch unchanged.
- [X] T017 [P] [US3] Same for `web/app/(app)/transactions/page.tsx` → `TransactionsDesktop`.
- [X] T018 [P] [US3] Same for `web/app/(app)/housing/page.tsx` → `HousingDesktop`.
- [X] T019 [US3] Verify US3: `npm run build` → `npm run measure:bundle -- --baseline …/baseline.json` shows the `*Desktop` compositions as async chunks absent from the mobile initial load; `npm test` (incl. T015) and `npx tsc --noEmit` green; manually confirm no mobile→desktop flash at ≥1024 (quickstart §3). If a flash appears, revert that one route to an eager import (research D4 fallback) and note it.

**Checkpoint**: per-form-factor delivery; both targets slimmer.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T020 [P] Verify the loading/error-fallback contract (`contracts/code-split-boundaries.md`): placeholders reserve space (no layout shift of money figures, FR-011) and a failed chart/scan load leaves the surrounding screen usable (FR-010) — add/confirm a test or record a manual check.
- [X] T021 Final verification pass from `web/`: `npm run build` (static export succeeds, `out/` produced), `npm run measure:bundle -- --baseline ../specs/022-web-bundle-optimization/baseline.json` (record the cumulative initial-load delta), `npm test` (all green incl. parity suites), `npx tsc --noEmit` (clean).
- [X] T022 [P] Update `docs/web.md` (and add a note to `PARITY.md` if a capability row applies) documenting the code-split boundaries and the `measure:bundle` tool, so the docs don't go stale (per docs discipline in `docs/index.md`).
- [X] T023 Push `022-web-bundle-optimization` (branch pushed; `origin/022-web-bundle-optimization` == local `f4c4b73`). **CI-watch pending:** `gh run watch` could not run in this sandbox — `gh` returns HTTP 401 (the sandbox's GitHub secret is unset), so `capacitor-ios-ci.yml` (SC-005) must be confirmed green from a session with working `gh` auth.

---

## Measured results (SC-006, recorded 2026-07-14)

Reconstructed by building the pre-split parent commit (`e8bed82`) into a baseline and diffing the
post-split build against it via `npm run measure:bundle -- --baseline …/baseline.json`
(`baseline.json` saved alongside this file). Initial-load = the chunks each route's built HTML
references in `<script>` tags.

| Route | Baseline (gzip) | After (gzip) | Δ gzip | Δ raw |
|---|---|---|---|---|
| `/dashboard` | 413.6 KB | 317.5 KB | **−96.1 KB** | −331.7 KB |
| `/housing` | 413.9 KB | 315.7 KB | **−98.2 KB** | −334.5 KB |
| `/transactions` | 329.4 KB | 321.2 KB | **−8.3 KB** | −26.7 KB |
| chart-free routes (`/budgets`, `/settings`, `/sign-in`, …) | — | — | +0.2–0.4 KB | negligible |
| **Initial-load union** | **685.7 KB** | **482.9 KB** | **−202.8 KB (−29.6%)** | −693 KB |

- The `−96/−98 KB` on `/dashboard` + `/housing` is `recharts` leaving initial-load (US1) — the
  dominant win, matching the `~95 KB` figure in `docs/web.md`.
- `/transactions −8.3 KB` is the scan pipeline deferred behind scan-initiate (US2).
- Chart-free routes rise a few hundred bytes from Turbopack chunk-boundary reshuffling (not
  `recharts`, which is now a separate async chunk) — expected and negligible against the wins.
- Total JS on disk grows (2.3 → 2.6 MB across 32 → 43 chunks): the deferred code still ships, just
  as on-demand chunks that no first load pays for. That is the intended trade (SC-001/SC-002).

---

## Dependencies & Execution Order

- **Setup (Phase 1)** → **US4 (Phase 3)** must land first: US4 is the measurement instrument every later
  story is validated with. (Phase 2 is empty — no shared foundational code.)
- **US1 / US2 / US3 are mutually independent** once US4 exists — they touch disjoint files (chart cards
  vs. scan call sites vs. route desktop imports) and can be done in any order or in parallel by
  different workers. Priority order US1 → US2 → US3 is the recommended sequence (largest win first).
- Within each story: the **test task(s) come first** (must fail), then implementation, then the
  build+measure verify task closes the story.
- **Polish (Phase 7)** runs after the stories it audits.

## Parallel Opportunities

- Setup: T002 [P] alongside T001's checks.
- US1: T006/T007 [P] (tests) then T008/T009/T010 [P] (three different card files) in parallel; T011
  gates.
- US3: T016/T017/T018 [P] (three different route files) in parallel; T019 gates.
- Across stories: after US4, a second worker could take US2 while another takes US1.

## Independent Test Criteria (per story)

- **US4**: script reports initial-load + per-chunk sizes and a before/after diff (T003 green, T005
  baseline saved).
- **US1**: `recharts` absent from initial-load (async chunk); Dashboard numbers paint first; charts
  render identically after load; guard test forbids eager `recharts` imports.
- **US2**: scan modules absent from Transactions initial load; scan loads on initiate, behaves
  identically, no re-fetch.
- **US3**: `*Desktop` compositions absent from the non-active form factor's initial load; no
  wrong-layout flash; breakpoint swap still works.

## Suggested MVP scope

**US4 (measurement) + US1 (charts).** That delivers the largest, lowest-risk initial-load reduction,
fully measured and green — a shippable increment on its own. US2 and US3 are incremental follow-ons in
the same PR or fast-follows.

## Implementation Strategy

Incremental and measured: land US4 first (baseline), then US1 as the MVP (verify the recharts drop),
then US2 and US3 each behind their own failing test and closed by a build+measure verify. Every story
ends green on `npm test` + `npx tsc --noEmit` + a recorded initial-load delta, and the branch push is
gated on the iOS CI staying green (T023).
