# Implementation Plan: Savings & Debt-Payoff Goals

**Branch**: `feat/savings-goals` (spec dir `027-savings-goals`) | **Date**: 2026-07-18 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/027-savings-goals/spec.md`

## Summary

Add household **goals** (savings or debt-payoff): a named target amount (USD
cents) with an optional target date and an optional context association (one
linked account or one category). A member records **contributions**; a calm
**progress view** shows saved / remaining / fraction and, for dated goals, whether
they are on pace. A single new **off-track insight rule** flags a dated,
not-yet-reached goal that is behind steady pace and suggests the monthly
contribution to recover.

Technical approach: mirror the existing **budgets** feature end to end — a new
Supabase migration (`goals` + `goal_contributions` tables, member-scoped RLS,
explicit grants), hand-mirrored `*Row` types + domain types, a `loadAll` fan-out
addition, optimistic-with-rollback store CRUD, and a `ReadingColumn` Goals page
reached from Settings. All money/date logic is a new **pure engine**
`web/lib/finance/goals.ts`, developed test-first and pinned by a new golden vector
file `shared/test-vectors/goals.json` (the housing-net-rental / lease / member-balance
precedent for adding a vectored capability). The off-track rule produces an
ordinary `Insight` object merged into the existing Insights card, so it needs no
new dashboard surface.

## Technical Context

**Language/Version**: TypeScript 5 (strict), Node 22 (`.nvmrc`); Postgres 17 (Supabase).

**Primary Dependencies**: Next.js 16 (App Router, `output: 'export'`), React 19,
Tailwind v4, `@supabase/supabase-js`; Vitest 4 for tests. No new dependency.

**Storage**: Supabase Postgres — two new tables `goals`, `goal_contributions`
(USD-cents `bigint`), member-scoped RLS via the existing `is_household_member`
helper. Schema in `supabase/migrations/`.

**Testing**: Vitest (`cd web && npm test`), pure logic in node env, components in
jsdom; new `goals.parity.test.ts` asserts `shared/test-vectors/goals.json`;
`gen-vectors.ts` regenerates it. `npx tsc --noEmit` is a CI gate.

**Target Platform**: The single canonical web/TypeScript app on both delivery
targets (responsive web + Capacitor iOS shell — identical bundle; no native code
in this feature).

**Project Type**: Web application (canonical implementation in `web/`), Supabase
backend, shared regression vectors.

**Performance Goals**: No new hot path. Goals load as one more `loadAll` fan-out
select; progress/off-track are O(contributions) pure functions run at render like
`generateInsights`.

**Constraints**: Integer USD cents everywhere, converted at render only; dates fed
to date logic built on the **local** calendar (the `insights.ts` timezone rule);
off-track logic takes an injected reference date (deterministic, TZ=UTC-pinned
vectors); calm design tokens only, loss/behind never red.

**Scale/Scope**: Two tables, ~3 domain types, one pure engine (~4 functions), one
vector file, one Goals page + one goal card + one form + one contribution add, two
insight-consumer call-site merges, store CRUD (5 mutators), doc + PARITY updates.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Gated against `.specify/memory/constitution.md` v2.0.0:

- **I. One Design System, Tokens Only** — PASS. Goals UI uses existing semantic
  tokens/`ui.tsx` primitives (`Card`, `PageHeader`, `ReadingColumn`), the category
  tints already defined, and the progress bar uses `--positive`/`--hairline`; **no
  new palette entry, no hardcoded color**. Progress/behind states carry meaning by
  position + label, never a new color.
- **II. Calm Over Dense (NON-NEGOTIABLE)** — PASS. Money is the headline of each
  goal row (saved / target, tabular); the off-track insight is calm copy at
  `info`/`warning` severity, **never a red/critical alarm** (loss/behind is never
  red). Hairline-separated list, no shadow on inset cards. Reuses the budgets page
  layout idiom.
- **III. Right Form Factor Per Canvas** — PASS. Goals is a **secondary route**
  reached from Settings (the budgets precedent), rendered in a centered
  `ReadingColumn` that reads correctly from phone to ultrawide (content capped) — it
  does not add a fifth primary tab, so the four destinations are preserved on every
  canvas. No separate `*Desktop` master–detail composition is warranted for a
  bounded list (same as budgets); documented, not a violation.
- **IV. Plainspoken Voice & Money Formatting** — PASS. `formatMoney` renders every
  amount (currency-aware, tabular, unabbreviated, Unicode minus); copy is
  second-person ("You're behind on …"); insight strings go through the `tr` hook and
  are added to all i18n catalogs.
- **V. Accessible & Interaction-Complete** — PASS. Goal rows and the add/contribute
  controls are real `<button>`/labelled inputs, keyboard-reachable, with the sand
  focus ring; progress bar has an accessible text equivalent; hit targets ≥44px on
  touch (the budgets `min-h-[56px]` rows).
- **VI. Test-Driven & Regression-Safe (NON-NEGOTIABLE)** — PASS and central to this
  plan. The pure engine `goals.ts` is developed **test-first**: golden vectors for
  `goalProgress` and the off-track insight are written and locked **before**
  implementation; component/store behavior is tested via jsdom + the Supabase mock;
  `npm test` + `tsc` + vector-drift gate the merge. No wall-clock reads in logic
  (injected `now`).

**Result: PASS — no violations, Complexity Tracking not required.**

Post-Phase-1 re-check: **PASS** (design below introduces no new tokens, no new
primary navigation, no wall-clock dependency, and keeps all money/date logic pure
and vectored).

## Project Structure

### Documentation (this feature)

```text
specs/027-savings-goals/
├── plan.md              # This file
├── spec.md              # Feature spec
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   ├── goals-engine.md  # Pure-function contracts (goalProgress, off-track insight)
│   └── goals-schema.md  # Table/RLS/grants contract
├── checklists/
│   └── requirements.md  # Spec quality checklist (from /speckit-specify)
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
supabase/migrations/
└── 20260718120000_savings_goals.sql        # NEW: goal_kind enum; goals + goal_contributions; RLS; grants

web/lib/
├── finance/
│   ├── goals.ts                            # NEW: pure engine — goalProgress, goalOffTrackInsight, goalInsights
│   └── goals-thresholds.ts                 # NEW: off-track tolerance + pace constants (INSIGHT_THRESHOLDS idiom)
├── finance/insights.ts                     # EDIT: export compareInsights (shared sort) — no behavior change
├── types.ts                                # EDIT: Goal, GoalContribution, GoalKind, GoalProgress
└── supabase/rows.ts                        # EDIT: GoalRow, GoalContributionRow

web/lib/store.tsx                           # EDIT: loadAll fan-out (+2 selects); goals/goalContributions state;
                                            #        addGoal/updateGoal/deleteGoal/addContribution/deleteContribution

web/app/(app)/goals/page.tsx                # NEW: Goals list (ReadingColumn), reached from Settings
web/components/goals/
├── GoalCard.tsx                            # NEW: calm progress view (saved/target/bar/remaining/pace)
├── GoalForm.tsx                            # NEW: create/edit goal (name, kind, target, date, association)
└── ContributionForm.tsx                    # NEW: add/remove a contribution
web/app/(app)/settings/page.tsx             # EDIT: add a "Goals" row linking to /goals (budgets precedent)

web/scripts/gen-vectors.ts                  # EDIT: emit shared/test-vectors/goals.json
shared/test-vectors/goals.json              # NEW: generated vectors (progress + off-track)

web/test/
├── goals.parity.test.ts                    # NEW: asserts goals.json (regression lock)
├── goals.unit.test.ts                      # NEW: hand-derived golden values + edge cases (correctness oracle)
├── goals/GoalCard.test.tsx                 # NEW: jsdom — progress render, calm/no-red, a11y
└── store/goals.store.test.ts               # NEW: optimistic CRUD + rollback via Supabase mock

web/lib/i18n/*                              # EDIT: goal + off-track-insight strings in all 6 catalogs

# Docs / contract reconciliation
PARITY.md                                   # EDIT: add the goals capability row + regression-core bullet
docs/supabase.md, docs/web.md, docs/finance.md, docs/index.md   # EDIT: document the new tables/engine/vectors
FUTURE-TASKS.md / docs/future_tasks/3.1-*.md                    # EDIT: mark §3.1 delivered
```

**Structure Decision**: Web application (single canonical `web/` implementation) +
Supabase migration + shared vectors — the established Ortho shape. Goals is a
secondary route (budgets precedent), all money/date logic isolated in a pure,
vectored `lib/finance/goals.ts`.

## Phase 0 — Research

See [research.md](./research.md). Key decisions resolved there:

1. **Progress source** — contribution-driven (bank balances are not synced; spec
   024 is connect-only). Association is contextual metadata only.
2. **Where the off-track rule lives** — a separate pure engine + its own vector
   file (`goalInsights`), merged into the existing insight consumers via an exported
   `compareInsights`, rather than a 9th rule inside `generateInsights` (keeps
   `insights.json` stable; matches how housing/lease/member-balance were added).
3. **Pace model & tolerance** — linear pace from goal start (`created_at`) to
   target date; a tolerance + suggested-monthly formula pinned in
   `goals-thresholds.ts`.
4. **Timezone/date handling** — reuse the `parseLocalDate` / local-calendar rule;
   inject `now`; keep vectors TZ=UTC-stable.
5. **Schema shape & RLS** — budgets-style member RLS for `goals`;
   parent-`EXISTS` RLS for `goal_contributions` (the `transaction_shares`
   precedent); explicit grants (the spec-024 ACL rule).

## Phase 1 — Design & Contracts

- **Data model**: [data-model.md](./data-model.md) — the two tables, columns,
  constraints, and the derived `GoalProgress`.
- **Contracts**:
  - [contracts/goals-engine.md](./contracts/goals-engine.md) — signatures + exact
    semantics of `goalProgress`, `goalOffTrackInsight`, `goalInsights`, and the
    thresholds; the vector-case matrix.
  - [contracts/goals-schema.md](./contracts/goals-schema.md) — DDL contract, RLS
    policies, grants, cascade behavior.
- **Quickstart**: [quickstart.md](./quickstart.md) — how to run the migration
  locally, regenerate vectors, and validate the three user stories.
- **Agent context**: CLAUDE.md managed marker block updated to point at this plan
  (via the after_plan agent-context hook).

## Complexity Tracking

No constitution violations — this section intentionally left empty.
