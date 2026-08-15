# Implementation Plan: Goal Detail & Contribution Editing

**Branch**: `feat/045-goal-detail-contributions` | **Date**: 2026-08-15 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/045-goal-detail-contributions/spec.md`

## Summary

Goals currently appear twice — as thin rows in the Planning hub's `GoalsSummaryCard` and again as
full cards on a separate `/planning/goals` index — and a contribution, once recorded, can never
be corrected. This feature collapses the duplication and closes the dead end.

The hub's goals section becomes **one `GoalCard` per goal**, each with progress, saved-of-target,
remaining, pace status, its most recent contributions, and two actions: record a contribution, or
open the goal. The `/planning/goals` route file is **repurposed from index to detail page**,
addressed `?id=<goalId>` (a static export cannot pre-render a `[goalId]` segment for runtime
UUIDs — research R1). The detail page carries the headline figures, the full contribution ledger,
and two dynamically-loaded recharts leaves: cumulative saved against the steady-pace line, and a
per-month breakdown, both driven by a new pure `lib/finance/goalSeries.ts` whose output is
property-tested to equal `goalProgress().saved_cents`. From there a contribution can be **edited
or deleted individually**, backed by a new `updateContribution` in the store that mirrors
`updateGoal`'s optimistic-with-rollback shape.

No migration. No change to `goalProgress`/`goalPacing`, so `npm run gen:vectors` must show no diff.

## Technical Context

**Language/Version**: TypeScript 5.x, React 19, Next.js 16 (App Router)

**Primary Dependencies**: Tailwind v4, recharts 3.8 (dynamic-only), lucide-react, Supabase JS

**Storage**: Supabase Postgres — `goals` + `goal_contributions`, both existing, **no migration**

**Testing**: Vitest (node + jsdom/Testing Library), one `npm test`; `npm run test:tz` for
date-sensitive suites; `shared/test-vectors/` regression pins

**Target Platform**: responsive web (compact 0–639 / medium 640–1023 / expanded 1024+) and the
same bundle wrapped by Capacitor for iOS

**Project Type**: web application — single canonical implementation under `web/`

**Performance Goals**: recharts stays out of every initial-load bundle (spec 022 rule); the
Planning hub keeps scanning the ledger once per render, not once per card

**Constraints**: `output: 'export'` — no server, no middleware, no SSR redirect, no runtime
dynamic route params; all money integer USD cents; loss never red

**Scale/Scope**: 3 user stories, ~2 new pure functions, 1 new store method, 1 repurposed route,
2 new chart leaves, 5 i18n catalogs

## Constitution Check

*GATE: passed before Phase 0; re-checked after Phase 1 design.*

| Principle | Status | How this design satisfies it |
|---|---|---|
| I. One Design System, Tokens Only | ✅ | Charts use `--positive` / `--hairline` / `--text-3` only; no new palette entry. Reuses `Card`, `PageHeader`, existing progress-bar styling. |
| II. Calm Over Dense (NON-NEGOTIABLE) | ✅ | Charts follow `SavingsRateChart`: no gridlines, no axis chrome, no tooltip junk, `isAnimationActive={false}`. Money is the headline; charts sit below it. Empty state instead of an empty chart frame. |
| III. Right Form Factor Per Canvas | ✅ | Detail page is a real destination at every width (deliberately NOT `useMobileFormPage`, which redirects at ≥1024px — research R2). Reading column capped; charts responsive; no horizontal page scroll at 320px. |
| IV. Plainspoken Voice & Money Formatting | ✅ | All money through `formatMoney` (tabular, never abbreviated). Copy is second-person and short. "Behind pace" states the catch-up amount rather than scolding. |
| V. Accessible & Interaction-Complete | ✅ | Cards open via real `<Link>`; contribution edit/delete are real `<button>`s with names; progress bars keep `role="progressbar"` + `aria-valuenow`/`aria-valuetext`; charts are decorative beside figures that carry the same numbers as text. |
| VI. Test-Driven & Regression-Safe (NON-NEGOTIABLE) | ✅ | Every task is test-first. The new date/money math (`goalSeries`) is pure, unit- **and** property-tested, with the two identities that stop a chart disagreeing with the headline. `gen:vectors` must show no diff. The FX round-trip guard is tested at a provably lossy rate. |

**Violations requiring justification**: none. Complexity Tracking is empty.

**Post-Phase-1 re-check**: still passing. The one thing worth flagging is that this feature
**deletes a route's current purpose** (`/planning/goals` stops being an index). That is
explicitly what FR-016 asks for and what removes the duplicate listing (SC-005); it is a scope
decision recorded in the spec, not an unjustified deviation.

## Project Structure

### Documentation (this feature)

```text
specs/045-goal-detail-contributions/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 — R1..R8
├── data-model.md        # Phase 1 — entities, derived series, store surface
├── quickstart.md        # Phase 1 — validation guide
├── contracts/
│   └── goal-detail.md   # Phase 1 — C1..C7 UI/store/pure contracts
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 — /speckit-tasks, NOT created here
```

### Source Code (repository root)

```text
web/
├── app/(app)/planning/
│   ├── page.tsx                          # MODIFIED — hub renders per-goal cards
│   └── goals/page.tsx                    # REPURPOSED — index → single-goal DETAIL page
├── components/
│   ├── goals/
│   │   ├── GoalCard.tsx                  # MODIFIED — open link, capped ledger, contribution actions
│   │   ├── GoalForm.tsx                  # unchanged (reused by the detail page)
│   │   ├── ContributionForm.tsx          # MODIFIED — gains edit mode + FX round-trip guard
│   │   ├── GoalDetail.tsx                # NEW — the detail page body
│   │   ├── ContributionLedger.tsx        # NEW — full ledger with per-row edit/delete
│   │   └── charts/
│   │       ├── GoalCumulativeChart.tsx   # NEW — recharts leaf (dynamic-only)
│   │       └── GoalMonthlyChart.tsx      # NEW — recharts leaf (dynamic-only)
│   ├── planning/GoalsSummaryCard.tsx     # MODIFIED — renders GoalCards, drops "View all goals"
│   └── skeletons/RouteSkeleton.tsx       # MODIFIED — /planning/goals skeleton becomes detail-shaped
├── lib/
│   ├── finance/goalSeries.ts             # NEW — cumulativeSeries + monthlySeries (pure)
│   ├── useRouteSearch.ts                 # NEW — the window.location.search read, extracted
│   ├── useMobileFormPage.ts              # MODIFIED — consumes useRouteSearch (no behavior change)
│   ├── store.tsx                         # MODIFIED — + updateContribution
│   └── i18n/{bn,es,ja,zh,ko}.ts          # MODIFIED — new keys; retired keys removed
└── test/
    ├── finance/goalSeries.test.ts        # NEW — unit + property
    ├── goals/goal-detail-page.test.tsx   # NEW — route contract C1
    ├── goals/goal-card.test.tsx          # NEW — card contract C3
    ├── goals/contribution-edit.test.tsx  # NEW — form contract C4 (incl. GBP round trip)
    ├── goals/contribution-store.test.tsx # NEW — store contract C5
    ├── web/planning-hub.test.tsx         # MODIFIED — hub now renders cards, no index link
    ├── skeletons/RouteSkeleton.test.tsx  # MODIFIED — detail-shaped skeleton
    ├── bundle/no-eager-recharts.test.ts  # MODIFIED — EAGER_DIRS += goals, planning
    └── i18n/goal-detail-i18n.test.ts     # NEW — five-catalog guard
```

**Structure Decision**: the existing `web/` layout, unchanged. Chart leaves go under
`components/goals/charts/` because that is the *only* directory shape the recharts bundle guard
permits a static recharts import in — and the guard is **extended** to cover `components/goals`
and `components/planning`, which it does not scan today (research R3). That gap-closing is part
of this feature, not incidental churn.

## Implementation Phases

Ordered so each phase leaves the suite green.

1. **Foundational — pure first.** `lib/finance/goalSeries.ts` (test-first: unit + the two
   property identities), and `lib/useRouteSearch.ts` extracted from `useMobileFormPage` with its
   existing behavior pinned.
2. **US1 — hub cards.** `GoalCard` gains `href`, `maxContributions`, and optional contribution
   actions; `GoalsSummaryCard` renders cards behind-first and drops the index link;
   `planning-hub.test.tsx` updated. Ships alone.
3. **US2 — detail page.** `useRouteSearch` + `parseIdParam` guard, `GoalDetail` body, the two
   dynamically-imported chart leaves, bundle-guard extension, skeleton update.
4. **US3 — contribution editing.** `updateContribution` in the store; `ContributionForm` edit
   mode with the `originalAmountText` guard; `ContributionLedger` per-row edit/delete.
5. **Polish.** i18n across five catalogs (add new, remove retired), then the full gate:
   `npx tsc --noEmit`, `npm test`, `npm run test:tz`, `npm run gen:vectors` (no diff),
   `npm run build`, and the `quickstart.md` manual pass.

## Risks

| Risk | Mitigation |
|---|---|
| Retiring the index page orphans i18n keys (`View all goals`) | `catalog-reachability.test.ts` fails loudly on exactly this; removal is a tracked task, not a hope |
| A chart silently disagreeing with the headline figure | The two property identities in C6 make that a test failure, not a visual bug |
| FX round-trip drift on an untouched contribution amount | Tested at GBP 0.78, a rate where the round trip is provably lossy (research R5) |
| recharts leaking into an initial-load bundle | Bundle guard extended to the two directories that would otherwise be blind |
| iOS deep link to a goal | The `?id=` form keeps the target a real exported file; manual iOS confirm noted in quickstart as the one step CI cannot cover |

## Complexity Tracking

No constitution violations. Nothing to justify.
