# Implementation Plan: Planning Hub (top-level destination)

**Branch**: `feat/planning-page` | **Date**: 2026-08-03 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/036-planning-hub/spec.md`

## Summary

Promote **Planning** from a Settings sub-page to a fifth top-level destination and rebuild its
landing page into a month-scoped **planning hub** that composes data the app already has. The hub
shows a "Left to plan" health hero (income − monthly budget allowances − planned goal
contributions, with the arithmetic shown), a pace-aware budget summary (top at-risk categories,
rollover carry surfaced), a goals summary (progress + on/off-track + projected completion +
suggested catch-up, behind-first), and a non-monthly sinking-funds panel. It still links out to the
existing `/budgets` and `/goals` detail pages, which are unchanged.

Technical approach: **all math lives in one pure module** (`web/lib/planning/planSummary.ts`) that
takes an injected reference date and delegates to the existing rollover (`budgetStatusForMonth`) and
goal-pacing (`goalPacing`/`goalProgress`) engines — no new stored data, no schema change. The page
is a thin composition of presentational cards that read household data from `useApp()` and compute
via the pure module. A dedicated lightweight month stepper (supporting future months, unlike the
data-bounded dashboard picker) provides the scope.

## Technical Context

**Language/Version**: TypeScript, React 19.2, Next.js 16.2 (App Router, `output: 'export'` — fully
client-side, all routes `'use client'`).

**Primary Dependencies**: existing app only — `lib/finance/budgets.ts`
(`budgetStatusForMonth`, `computeRolloverLedger`), `lib/finance/goals.ts`
(`goalProgress`, `goalPacing`, `contributionsByGoal`), `lib/store.tsx` (`useApp`),
`lib/i18n`, `lucide-react` (nav icon). No new npm dependencies.

**Storage**: None added. Reads existing `budgets`, `goals`, `goalContributions`, `transactions`
from the store. All amounts integer USD cents; display via `formatMoney`.

**Testing**: Vitest. Pure logic in Node; components with `// @vitest-environment jsdom`. Injected
reference dates (never the real clock). `npm test` + `npx tsc --noEmit`.

**Target Platform**: Responsive web (phone → ultrawide) + the Capacitor iOS shell (same bundle).

**Project Type**: Web (the canonical `web/` codebase).

**Performance Goals**: Local-compute only, no new network reads; hub renders from already-loaded
store data. Keep off the eager bundle's critical path (no recharts; CSS bars only).

**Constraints**: Design-system law (tokens only, no red for loss/cost, no shadow on inset cards,
hairlines, accessible semantic controls + focus rings, content width capped/centered). Full i18n
across bn/es/ja/zh/ko. Fully TDD.

**Scale/Scope**: One new route, one pure lib module (+ small thresholds), ~5 presentational
components, nav edits in 2 files, 2 settings edits + 1 redirect, RouteSkeleton case, i18n keys in 5
catalogs. No changes to Budgets/Goals detail pages beyond being linked to.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. One Design System, Tokens Only** — PASS. Hub uses only existing tokens/`ow-*` classes; bars
  reuse the BudgetsBody/GoalsBody vocabulary (`--accent`, `--positive`, `--chip-bg`, `--hairline`).
  No new palette. Guarded by `test/tokens-only-backgrounds.test.ts`.
- **II. Calm Over Dense** — PASS. Summary-not-dump: bounded top-N categories, inset cards with no
  shadow, hairlines, one headline number. Empty states short and non-alarmist.
- **III. Right Form Factor Per Canvas** — PASS. TabBar entry on compact, Sidebar entry on desktop;
  single responsive `ReadingColumn`/capped-width composition (no separate desktop chunk needed — the
  hub is a calm single-column stack). Content width capped.
  - **Note (reviewed deviation):** the constitution's "Responsive contract / Parity" clause names
    **four** destinations (Dashboard, Transactions, Housing, Settings). This feature adds a **fifth**
    (Planning). This is **additive** — the four are preserved — and is the explicit intent of the
    feature. Recorded in Complexity Tracking as a deliberate, approved expansion, not a violation of
    the "desktop is additive, not a rewrite" spirit.
- **IV. Plainspoken Voice & Money Formatting** — PASS. Second-person, `formatMoney`, income `+`,
  Unicode minus, tabular figures, no abbreviations, loss/cost never red.
- **V. Accessible & Interaction-Complete** — PASS. Real `<button>`/`<Link>`/`<nav>` controls,
  labelled, keyboard-reachable, sand focus ring, `role="progressbar"` bars, ≥40/44px hit targets.
- **VI. Test-Driven & Regression-Safe** — PASS. All money/date math is pure with injected `now` and
  is written test-first; components tested for behavior/semantics.

**Result: PASS** (one recorded, approved additive deviation — see Complexity Tracking).

## Project Structure

### Documentation (this feature)

```text
specs/036-planning-hub/
├── plan.md              # This file
├── research.md          # Competitive + codebase research synthesis
├── data-model.md        # Derived view types (no stored data)
├── quickstart.md        # How to run/verify
├── contracts/
│   └── plan-summary.md  # The pure-module contract (inputs → outputs, invariants)
├── checklists/
│   └── requirements.md  # Spec quality checklist (from /speckit-specify)
└── tasks.md             # /speckit-tasks output
```

### Source Code (repository root)

```text
web/
├── app/(app)/
│   ├── planning/
│   │   └── page.tsx                         # NEW — the hub (month state + composition)
│   └── settings/planning/page.tsx           # EDIT — replace with client redirect → /planning
├── components/
│   ├── Sidebar.tsx                          # EDIT — add Planning destination
│   ├── TabBar.tsx                           # EDIT — add Planning destination
│   ├── settings/
│   │   └── SettingsSecondaryNav.tsx         # EDIT — remove Planning entry
│   ├── skeletons/RouteSkeleton.tsx          # EDIT — add a 'planning' route shape
│   └── planning/                            # NEW — presentational cards
│       ├── PlanningMonthBar.tsx             # month stepper (prev/next incl. future, "This month")
│       ├── PlanHealthHero.tsx               # "Left to plan" + breakdown
│       ├── BudgetSummaryCard.tsx            # overall pace bar + top at-risk categories
│       ├── GoalsSummaryCard.tsx             # goal progress/status/projection, behind-first
│       └── SinkingFundsPanel.tsx            # non_monthly categories set aside
├── app/(app)/settings/page.tsx              # EDIT — remove Planning LinkRow
├── lib/planning/
│   ├── planSummary.ts                       # NEW — all pure math + types
│   └── thresholds.ts                        # NEW — pace thresholds + top-N constant
└── test/
    ├── planning/
    │   └── planSummary.test.ts              # NEW — pure math (injected dates)
    ├── web/
    │   └── planning-hub.test.tsx            # NEW — hub composition + empty states + links
    └── nav.test.tsx                         # EDIT — assert Planning destination in Sidebar/TabBar
```

**Structure Decision**: Follow the established web conventions — pure engine under `lib/`
(mirroring `lib/finance/*`), presentational components under `components/planning/`, one static
route under `app/(app)/planning/`. Reuse the `budgetStatusForMonth`/`goalPacing` engines rather
than re-implementing math (constitution VI). The hub is a single responsive column (like Settings
sub-pages), so no separate `*Desktop` dynamic chunk is required.

## Key design decisions

1. **One pure module owns all math.** `lib/planning/planSummary.ts` exposes `buildPlanSummary(input,
   now)` plus the smaller helpers it composes (`monthElapsedFraction`, `planReferenceDate`,
   `paceState`, `rankAtRiskBudgets`, `rankGoals`, `sinkingFunds`, `planHealth`). Every function takes
   the reference date explicitly. This is the regression-locked surface (constitution VI).

2. **Single month-derived reference date drives the whole hub** so changing the month recomputes
   everything (FR-007). `planReferenceDate(monthKey, now)`:
   current month → `now`; past month → last instant of that month; future month → first instant.
   `monthElapsedFraction(monthKey, now)`: current → day/daysInMonth; past → 1; future → 0.

3. **Hero budgeted = base monthly allowances** (Σ `monthly_limit_cents`), NOT effective limits, so a
   prior surplus never appears to reduce what's left to plan (FR-008, corrected). Effective
   (rollover-aware) limits are used in the per-category budget summary where available-to-spend is
   the relevant figure.

4. **Planned goal contributions = Σ `goalPacing(...).suggested_monthly_cents`** over dated,
   unreached goals — the monthly amount the pacing engine already computes. Undated/reached → 0.

5. **Budget summary excludes `non_monthly`** budgets (they get the sinking-funds panel) and pace-
   ranks the remaining `fixed`/`flex` budgets by how far ahead of pace they are, taking a bounded
   top-N. Pace health (`paceState`): `over` when spent ≥ effective limit; else `attention` when
   `spent/limit ≥ elapsedFraction × ATTENTION_RATIO`; else `under`. Colors: over/attention → sand
   `--accent`, under → sage `--positive` (never red).

6. **Goals summary uses the shared reference date** for pacing (so it recomputes with the month) and
   sorts off-track first, then by shortfall. Undated goals show progress with a neutral status.

7. **Dedicated month scope, not the dashboard picker.** The dashboard `MonthPicker` is bounded to
   months present in the data (past only) and cannot "plan ahead." A small `PlanningMonthBar` holds
   a `YYYY-MM` in local state (default current month) with prev/next chevrons (future allowed) and a
   "This month" reset. It reuses the existing pure `monthLabel`/`monthBounds`/month key helpers.

8. **Redirect preserves old links (FR-004).** `settings/planning/page.tsx` becomes a client
   component that `router.replace('/planning')` on mount and renders null — no dead end.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| 5th top-level destination (constitution names four) | The feature's explicit goal is to make Planning first-class and discoverable, as requested; the four existing destinations are preserved (additive) | Keeping Planning nested in Settings was the status quo the feature exists to change; it fails the core user story (discoverability) |
