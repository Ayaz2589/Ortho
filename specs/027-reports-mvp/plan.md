# Implementation Plan: Reports MVP

**Branch**: `feat/reports-mvp` | **Date**: 2026-07-18 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/027-reports-mvp/spec.md`

## Summary

Add a calm **Reports mode inside the existing Dashboard page**. A segmented control at the
top of Dashboard toggles **Overview** (today's dashboard, unchanged) ↔ **Reports** (a small,
responsive reports surface rendered in place). Reports reuses the existing dashboard
date-range vocabulary (This month / 3M / 6M / 1Y) and shows two views:

1. **Savings-rate over time** — per calendar month in the window: income, expense, and the
   savings rate `(income − expense) / income`, drawn as a recharts time-series
   (dynamic-imported) with the per-month figures readable as money. Empty months appear as
   neutral zero rows.
2. **Category deep-dive** — total spend per category for the window, as the existing calm
   donut + ranked legend (category · amount · share), highest first.

Both views are powered by the **already-built-but-unwired** aggregate RPC wrappers in
`web/lib/api/aggregates.ts` — this feature is their first product consumer. No new database
migration: the RPCs from `supabase/migrations/20260611120000_aggregates.sql` are reused.

## Technical Context

**Language/Version**: TypeScript ^5 (strict), React 19.2, Next.js 16.2 (App Router, `output:
'export'`).

**Primary Dependencies**: `@supabase/supabase-js` (RPC), `recharts` ^3.8 (charts, reached
only via `next/dynamic`), Tailwind v4 + `app/globals.css` tokens, Vitest 4 + Testing Library.

**Storage**: Existing hosted Supabase Postgres; read-only via the four household-scoped
aggregate RPCs (`household_month_summary`, `household_category_totals` used;
`household_daily_expense`, `household_owner_spend` not used by this MVP). No schema change.

**Testing**: Vitest — pure helpers in node env; component/hook behavior in jsdom
(`// @vitest-environment jsdom`); the aggregates layer mocked at the module boundary
(existing `test/aggregates.test.ts` pattern). Full suite via `npm test`; `npx tsc --noEmit`
gate.

**Target Platform**: Both web delivery targets (responsive browser + Capacitor iOS shell) —
same bundle. Reports must be correct at compact/medium/expanded widths.

**Project Type**: Web (single canonical implementation in `web/`).

**Performance Goals**: Reports data is fetched **on demand** (only when Reports is opened,
re-fetched on range change). Savings-rate needs one `household_month_summary` call per
in-scope month (≤ 12); category needs one `household_category_totals` call — issued in
parallel. This is acceptable for an on-demand surface and keeps Overview's initial load
untouched. Charting code (`recharts`) MUST NOT enter the Dashboard initial-load bundle.

**Constraints**: Tokens only; loss/cost never red; tabular figures; no bold; no
chart-junk; plainspoken empty/loading/error; i18n across all five catalogs; content width
capped/centered.

**Scale/Scope**: Two report views, one mode toggle, one on-demand data hook, two small pure
helpers, one new chart leaf. No migration, no new route, no new primary nav destination.

## Constitution Check

*GATE: re-checked after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. One Design System, Tokens Only | ✅ | New chart + legend use `categoryMeta().tint`, `--positive`/`--text`/`--hairline` tokens; no new colors. |
| II. Calm Over Dense (NON-NEGOTIABLE) | ✅ | One added surface *inside* Dashboard, not a denser dashboard. No gridlines/axes chart-junk; hairlines; capped width; shortfall never red. |
| III. Right Form Factor Per Canvas | ✅ | Responsive at all three breakpoints; content capped/centered; no new bottom-bar/sidebar destination — Reports is a mode, preserving the four destinations. |
| IV. Plainspoken Voice & Money Formatting | ✅ | `formatMoney` (USD cents → display currency, U+2212, tabular, no abbreviation); zero-income rate shows "—"; plainspoken states. |
| V. Accessible & Interaction-Complete | ✅ | Segmented control + range picker are real `<button>`s with `aria-current`/`aria-pressed`, keyboard-reachable, sand focus ring; retry is a real button. |
| VI. Test-Driven & Regression-Safe (NON-NEGOTIABLE) | ✅ | Every unit RED→GREEN: pure `savingsRate`/`monthsInInterval`/`rankCategories` unit tests first; hook + view behavior tests first; `no-eager-recharts` guard extends to the new leaf. |

**No violations → Complexity Tracking omitted.**

**Deviation note (not a violation):** `docs/web.md` §4 records spec 023 (D15)'s decision to
leave `aggregates.ts` **unwired**, because wiring the RPCs into *existing dashboard widgets*
is a net perf loss — it swaps in-memory loops (data already held after `loadAll()`) for
network round-trips and breaks offline. That rationale is scoped to the widgets. This feature
is the **documented cut-over's first legitimate case**: a *new* surface that aggregates over
a user-chosen window (up to 12 months) which the client does not already hold pre-summarized,
fetched on demand only when the surface is opened. It does not touch or slow any Overview
widget (those keep computing locally). The docs will be updated to reflect that
`aggregates.ts` is now partially wired by this surface (see the docs-reconciliation task).

## Project Structure

### Documentation (this feature)

```text
specs/027-reports-mvp/
├── plan.md              # This file
├── research.md          # Phase 0 — decisions & rationale
├── data-model.md        # Phase 1 — entities & derived shapes
├── quickstart.md        # Phase 1 — how to run/verify
├── contracts/
│   └── reports-views.md # Phase 1 — component/hook/helper contracts + acceptance
├── checklists/
│   └── requirements.md  # Spec quality checklist (from /speckit-specify)
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
web/
├── app/(app)/dashboard/page.tsx        # MODIFIED: lift `mode` state; render ModeSwitch;
│                                        #   branch overview (existing) vs <ReportsView>
├── components/web/DashboardDesktop.tsx  # MODIFIED (minimal): accept + render the ModeSwitch node
├── components/dashboard/
│   ├── ReportsView.tsx                  # NEW: the reports surface (range picker + two views + states)
│   ├── ModeSwitch.tsx                   # NEW: Overview | Reports segmented control (a11y)
│   ├── SavingsRateView.tsx             # NEW: per-month rows + dynamic-imported chart, states
│   ├── CategoryDeepDiveView.tsx        # NEW: donut + ranked legend (share), states
│   └── charts/
│       └── SavingsRateChart.tsx        # NEW: recharts leaf (reached ONLY via next/dynamic)
├── lib/
│   ├── reports/
│   │   ├── savings.ts                   # NEW: pure savingsRate() + per-month series builder
│   │   ├── categories.ts               # NEW: pure rankCategories() (sort desc + share)
│   │   └── months.ts                   # NEW: pure monthsInInterval() (split window → calendar months)
│   ├── useReportsData.ts               # NEW: on-demand fetch hook (loading/error/retry) over aggregates.ts
│   └── api/aggregates.ts               # REUSED (now wired): fetchMonthSummary, fetchCategoryTotals
└── test/
    ├── reports/savings.test.ts          # NEW (unit, node)
    ├── reports/categories.test.ts       # NEW (unit, node)
    ├── reports/months.test.ts           # NEW (unit, node)
    ├── reports/useReportsData.test.ts    # NEW (hook, jsdom, aggregates mocked)
    ├── reports/ReportsView.test.tsx      # NEW (component, jsdom)
    ├── reports/SavingsRateView.test.tsx  # NEW (component, jsdom)
    ├── reports/CategoryDeepDiveView.test.tsx # NEW (component, jsdom)
    ├── dashboard/mode-switch.test.tsx    # NEW (component, jsdom): toggle + Overview intact
    └── bundle/no-eager-recharts.test.ts  # EXTENDED: assert SavingsRateChart is the only new recharts leaf
```

**Structure Decision**: Follow the established split — pure logic in `web/lib/reports/*`
(node-tested), view components in `web/components/dashboard/*` (mobile-shared, jsdom-tested),
recharts isolated in a `charts/*` leaf reached only through `next/dynamic`. Reports renders
inside the existing Dashboard page for both the mobile stack and (via a passed toggle node)
the desktop composition, so no new route/destination is introduced.

## Key design decisions (see research.md for full rationale)

1. **Per-month savings via N month-summary calls.** `household_month_summary` aggregates a
   *whole* window; the per-month series is built by splitting the interval into calendar
   months (`monthsInInterval`, pure) and calling `fetchMonthSummary` per month in parallel.
   No new migration; ≤12 calls, on-demand only.
2. **Savings-rate math is a small pure module**, unit-tested (not added to the golden-vector
   harness — mirrors the `entitlements.ts` precedent of an in-suite lock for non-engine
   derivation). `savingsRate(income, expense)` returns `null` when `income <= 0` → rendered
   "—" (guards NaN/Infinity). Cents in, ratio out.
3. **Category deep-dive reuses the donut vocabulary.** `rankCategories(rows)` (pure) sorts
   desc and computes each share of the window total; the view reuses `categoryMeta().tint`
   and a `CategoryPie`-style donut in a new `SavingsRateChart` sibling (the category donut can
   reuse the existing `CategoryPie` leaf directly — no duplicate chart code).
4. **`fetchOwnerSpend` is intentionally unused.** Its wrapper types rows as `person_id` while
   the SQL returns `user_id` — a latent mismatch. This MVP needs neither owner-spend nor
   daily-expense, so it is avoided; the mismatch is flagged in PARITY/docs for a future fix,
   not introduced into new code.
5. **Mode state lives in `dashboard/page.tsx`** (`useState`, default `'overview'`), so it
   survives Overview↔Reports toggles while the page is mounted, and is passed as a rendered
   toggle node into `DashboardDesktop` so the control appears on desktop without duplicating
   composition logic.
