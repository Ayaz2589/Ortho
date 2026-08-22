# Implementation Plan: Financial Health

**Branch**: `feat/041-financial-health` | **Date**: 2026-08-06 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/041-financial-health/spec.md`

**Design doc**: [`docs/plan/financial-health.md`](../../docs/plan/financial-health.md) (locked decisions §13).

## Summary

Add a **baseline financial-health metric**: a first-run questionnaire captures a user's financial
profile (income, housing, fixed commitments incl. remittances, safety net, per-dimension 1–5
importance weights); a **pure engine** blends those answers with existing transaction/budget/goal
data into a **0–100 score across five dimensions** (Cash flow, Safety net, Commitment load, Savings
momentum, Plan engagement); it surfaces as a **calm, never-red dashboard widget** with a
baseline-vs-now progress story and one actionable next step. Profile-first (works with zero history
and no bank); re-takeable from Settings; the engine is the foundation the deferred Purchase Advisor
will consume.

## Technical Context

**Language/Version**: TypeScript (Next.js 16.2.9, React 19.2.4), Tailwind v4. Node 22.

**Primary Dependencies**: `@supabase/supabase-js` + `@supabase/ssr` (data + RLS), existing pure
engines (`web/lib/finance/{budgets,goals}.ts`, `web/lib/reports/savings.ts`), the widget registry
(`web/lib/widgets/registry.tsx`), i18n (`web/lib/i18n/`). No new runtime dependency.

**Storage**: Supabase Postgres. Four new **user-scoped** tables (RLS `user_id = auth.uid()`):
`user_financial_profile`, `user_fixed_costs`, `user_dimension_weights`, `financial_health_snapshots`.
All monetary values are integer USD cents. New migration timestamp > `20260730120000`.

**Testing**: Vitest (`npm test`, `TZ=UTC`). Pure engine → node unit tests with independently-derived
expected values + property tests (the launder-proof tier). Components/pages → jsdom
(`// @vitest-environment jsdom`) + Testing Library. Source-guard tests for constitution invariants.
`npx tsc --noEmit` (run unpiped) must stay clean.

**Target Platform**: Responsive web (Vercel static export) + Capacitor iOS shell (same bundle). Fully
client-side; direct Supabase from the browser; no server routes.

**Project Type**: Web application (single canonical TS codebase in `web/`).

**Performance Goals**: Score computed live in a `useMemo` from already-loaded household data — no new
network round-trip on the dashboard. Onboarding completes in < 2 min (SC-002). No new eager bundle
weight (no charts in v1; i18n stays lazy).

**Constraints**: **Never red / never shaming** (Constitution I, IV); tokens-only palette;
plainspoken voice; TDD test-first (Constitution VI); static export ⇒ no dynamic routes / no
`useSearchParams`; new tables MUST join the `loadAll` fail-open group (deploy-before-migrate).

**Scale/Scope**: 1 profile + ≤~10 fixed costs + 5 dimension weights + N snapshots per user. New
surface area: 1 pure engine (+ thresholds + derive helper), 4 tables, ~6 store additions, 1 widget
body, 1 first-run flow (5 steps), 1 settings page, ~35 i18n keys × 5 catalogs.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Compliance |
|---|---|
| **I. One Design System, Tokens Only** | Score/band render in the sand `--accent` ramp; **no red**, no new palette entries. Bands carry meaning by label + position, not color. ✅ |
| **II. Calm Over Dense** | One headline number + band + one next step; inset widget card, no shadow, no shimmer. Supportive empty/low states, never alarmist. ✅ |
| **III. Right Form Factor Per Canvas** | Widget rides the existing uniform responsive board (phone→desktop, no new desktop chunk). Onboarding/settings use existing form primitives + safe areas. ✅ |
| **IV. Plainspoken Voice & Money Formatting** | Second-person copy; `formatMoney` for all amounts; band labels are calm and non-clinical. ✅ |
| **V. Accessible & Interaction-Complete** | Real `<button>`/labelled inputs, sliders keyboard-reachable, sand focus ring, ≥44px touch targets, `prefers-reduced-motion` honored. ✅ |
| **VI. Test-Driven & Regression-Safe** | Pure engine is money/ratio math ⇒ developed test-first, pinned by deterministic unit + property tests (injected `now`, mocked data). ✅ |

**No violations.** Complexity Tracking empty. One deliberate deviation from the *default* engine
pinning: the health engine is pinned by **unit/property tests, not a cross-file golden vector**, which
is the established precedent for newer pure roll-ups (`housing-summary.ts`, `spendHeatmap.ts`) and
avoids `gen:vectors` wiring — recorded in research.md, not a constitution breach (Principle VI
explicitly allows "golden-vector-**style** fixtures where they fit").

## Project Structure

### Documentation (this feature)

```text
specs/041-financial-health/
├── plan.md              # This file
├── spec.md              # Feature spec
├── research.md          # Phase 0 — decisions & rationale
├── data-model.md        # Phase 1 — tables, row/domain types, derived shapes
├── quickstart.md        # Phase 1 — how to validate end-to-end
├── contracts/
│   └── health-scoring.md   # The scoring contract (dimensions, thresholds, composite, bands, action)
├── checklists/
│   └── requirements.md  # Spec quality checklist (from /speckit-specify)
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
web/
├── supabase/migrations/
│   └── <TS>_financial_health_profile.sql        # 4 tables + RLS (TS > 20260730120000)
├── lib/
│   ├── finance/
│   │   ├── financialHealth.ts                    # pure engine: scoreFinancialHealth() + deriveProfile()
│   │   └── financial-health-thresholds.ts        # tunable constants (bands, dimension cutoffs, floors)
│   ├── supabase/rows.ts                          # + 4 *Row types
│   ├── types.ts                                  # + domain types + HealthDimension/HealthBand unions
│   ├── store.tsx                                 # + state, fail-open reads (ownerId), save actions, snapshot
│   └── widgets/registry.tsx                      # + 'financial-health' widget entry
├── components/
│   ├── widgets/bodies/FinancialHealthBody.tsx    # propless widget body (scored / profile-null / delta)
│   ├── financial-health/                         # questionnaire section components (shared onboarding+settings)
│   │   ├── IncomeSection.tsx  HousingSection.tsx  CommitmentsSection.tsx
│   │   ├── SafetyNetSection.tsx  WeightsSection.tsx
│   │   └── useFinancialProfileForm.ts            # shared draft state + save orchestration
│   └── skeletons/RouteSkeleton.tsx               # + case for the settings/onboarding route
└── app/(app)/
    ├── welcome/financial-profile/page.tsx        # dedicated first-run flow (stepper, skip-to-defaults)
    ├── settings/financial-profile/page.tsx       # single-scroll edit form
    └── settings/page.tsx                          # + LinkRow ; SettingsSecondaryNav + SECTION entry

web/test/
├── financial-health.test.ts                      # engine unit + property tests (node)
├── financial-health-store.test.tsx               # fail-open + save sequence + snapshot
├── financial-health-onboarding.test.tsx          # jsdom: step flow, skip writes defaults
├── financial-health-settings.test.tsx            # jsdom: edit + save + new snapshot
├── financial-health-widget.test.tsx              # jsdom: scored / profile-null / baseline delta / never-red
└── i18n/financial-health-i18n.test.ts            # new keys present in all 5 catalogs
```

**Structure Decision**: Single web codebase. The feature is a **pure engine + thin UI**: the engine
(`web/lib/finance/financialHealth.ts`) holds all math and is independently testable; the store
supplies data; UI components are propless and derive via `useMemo`. This mirrors the shipped
`insights`/`goals`/`planSummary` architecture exactly, so the Purchase Advisor can later import the
same engine without touching React.

## Complexity Tracking

> No constitution violations — section intentionally empty.
