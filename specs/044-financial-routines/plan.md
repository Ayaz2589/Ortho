# Implementation Plan: Financial Routines

**Branch**: `feat/044-financial-routines` | **Date**: 2026-08-11 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/044-financial-routines/spec.md`

## Summary

Detect a household's recurring spend patterns — fixed-amount recurring charges (subscriptions/bills)
and looser behavioral habits (coffee-every-weekday-morning style) — purely from the transaction
stream, no new data required (US1/US2). Let users review, confirm, rename, or dismiss what's
detected. Feed confirmed/recognized routines into a new sixth "routine awareness" financial-health
dimension (US3), and — as an explicitly bounded, lower-priority addendum — an opt-in location layer
that sharpens detection via merchant geocoding and, in place of infeasible passive background
tracking, opportunistic foreground visit capture (US4). Technical approach: two new pure engines
(`routines.ts`, and a `routine_awareness` scorer added to `financialHealth.ts`) following this
codebase's existing "derived, never stored" pattern, with a small persisted-state layer only for what
genuinely can't be recomputed (confirm/dismiss/rename, location consent). See `research.md` for the
three planning-time findings that shaped this (Capacitor location feasibility, no existing
per-member privacy boundary to mirror, and the credential-gated-integration pattern for geocoding).

## Technical Context

**Language/Version**: TypeScript 5.x, Next.js 16 (App Router), React 19 — unchanged from the rest of
`web/`. **Note**: `web/AGENTS.md` flags this Next.js version as non-standard/breaking vs. training
data — any new route/page work during implementation must check `node_modules/next/dist/docs/`
first.

**Primary Dependencies**: Existing stack (Supabase JS client, Tailwind v4, Vitest, Testing Library).
One new dependency: `@capacitor/geolocation` (foreground-only usage — see research.md §1).

**Storage**: Supabase Postgres. Four new tables (`recognized_routine_states`,
`user_location_consent`, `user_routine_visits`, `merchant_geocodes`) — see `data-model.md`. No
change to existing tables/columns.

**Testing**: Vitest (node for pure `lib/finance/` engines with property tests via the existing
`fast-check`-style precedent in `finance-properties.test.ts`; jsdom + Testing Library for
components/widgets/store). `npx tsc --noEmit` + `npm test` gate, per Constitution VI.

**Target Platform**: Web (responsive, compact/medium/expanded) + the existing Capacitor iOS shell.
No Android (matches the rest of the app — Capacitor config is iOS-only).

**Project Type**: Single web application (`web/`) — no new project/package.

**Performance Goals**: Routine detection runs client-side over already-loaded household transactions
(same pattern as `insights.ts`), so it must stay cheap enough not to visibly delay the Routines view
or the financial-health widget on a realistic household transaction volume (hundreds to low
thousands of rows) — no new network round-trip is on the critical render path for detection itself
(only the optional geocoding decoration is).

**Constraints**: Zero location collection without opt-in (FR-011); no auto-created/modified
transactions from any routine (FR-014/FR-017 — categorization only); the five existing
financial-health dimensions must be byte-identical to their spec 041 output when `routines` is empty
(FR-010); routine detection stays outside `shared/test-vectors/` initially (Assumptions).

**Scale/Scope**: Four user stories (P1–P4), one household-facing new view (Routines), one extended
existing view (financial-health breakdown + settings weights), one new settings page (Location), one
new dashboard widget entry, four new DB tables, ~2 new pure engines, i18n across 5 non-English
catalogs.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design below.*

- **I. One Design System, Tokens Only** — PASS. No new colors/tokens planned; routine cards, the
  location settings toggle group, and the 6th weight control all reuse existing card/list/toggle
  patterns from `financial-health`/`settings` components.
- **II. Calm Over Dense** — PASS. Routine suggestions and the location opt-in prompt are explicitly
  designed to be dismissible, non-urgent, and never red (spec Assumptions; FR-014's "never a silent
  ledger change" and "always a dismissible suggestion" are exactly this principle applied to data).
- **III. Right Form Factor Per Canvas** — PASS. Routines view and Location settings follow the
  existing settings/list page responsive patterns (bottom-sheet-adjacent on compact, standard list on
  expanded) — no new navigation paradigm.
- **IV. Plainspoken Voice & Money Formatting** — PASS. Routine amounts render through existing money
  formatting helpers; no new money-formatting logic introduced.
- **V. Accessible & Interaction-Complete** — PASS (verified during implementation, not a design
  deviation). Routine confirm/dismiss/rename controls are real buttons/inputs; the dimension-weight
  radiogroup pattern is reused verbatim from `WeightsSection`.
- **VI. Test-Driven & Regression-Safe** — PASS, with a scope note: routine detection and the new
  health dimension are money/date logic and therefore MUST be test-first per the constitution, but
  per research.md §3 they are pinned by unit/property tests in `web/test/`, not promoted into
  `shared/test-vectors/` — consistent with how `housing-summary.ts`/`spendHeatmap.ts` already do it,
  and explicitly called out in the spec's own Assumptions as the intended sequencing (graduate into
  the golden-vector harness only once the math has stabilized against real data — a follow-up, not
  part of this plan).

No violations requiring Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/044-financial-routines/
├── plan.md              # This file
├── research.md           # Phase 0 output
├── data-model.md         # Phase 1 output
├── contracts/            # Phase 1 output
│   ├── routines-engine.md
│   ├── routine-awareness-dimension.md
│   └── location-and-geocoding.md
├── quickstart.md         # Phase 1 output
└── tasks.md              # Phase 2 output (/speckit-tasks — not created by this command)
```

### Source Code (repository root)

Single project — everything lands inside the existing `web/` tree, no new top-level directory.

```text
web/
├── lib/
│   ├── finance/
│   │   ├── routines.ts                    # NEW — detectRoutines/applyRoutineStates/normalizeMerchantKey
│   │   ├── routines-thresholds.ts         # NEW — tunable constants
│   │   ├── financialHealth.ts             # MODIFIED — routine_awareness scorer, FinancialHealthInput.routines
│   │   └── financial-health-thresholds.ts # MODIFIED — DIMENSION_ORDER + routine-awareness constants
│   ├── location/
│   │   ├── consent.ts                     # NEW — read/write user_location_consent
│   │   ├── captureVisit.ts                # NEW — foreground one-shot capture (@capacitor/geolocation)
│   │   └── geocoding.ts                   # NEW — checkGeocodingAvailable() probe + merchant_geocodes read/write
│   ├── supabase/rows.ts                   # MODIFIED — 4 new *Row interfaces
│   ├── types.ts                           # MODIFIED — routine/location domain types, HealthDimension +1
│   └── store.tsx                          # MODIFIED — loadAll() new sources, save/confirm/dismiss/rename calls
├── components/
│   ├── routines/
│   │   ├── RoutinesList.tsx               # NEW — the Routines view body
│   │   ├── RoutineCard.tsx                # NEW — one routine, confirm/dismiss/rename actions
│   │   └── RoutineDetail.tsx              # NEW (if warranted by acceptance-scenario depth)
│   ├── widgets/bodies/
│   │   ├── RoutinesBody.tsx               # NEW — dashboard widget summarizing routines
│   │   └── FinancialHealthBody.tsx        # MODIFIED — cites contributing routines for the 6th dimension
│   ├── financial-health/
│   │   └── FinancialProfileForm.tsx       # MODIFIED — WeightsSection picks up the 6th dimension automatically
│   ├── settings/
│   │   └── LocationConsentSection.tsx     # NEW — the 3-tier consent control (mirrors appearance/text-size settings)
│   └── web/TxForm.tsx                     # MODIFIED — confirmed-routine auto-categorization suggestion (FR-017)
├── app/(app)/
│   ├── routines/page.tsx                  # NEW — Routines view route
│   └── settings/location/page.tsx         # NEW — Location settings route
├── lib/widgets/registry.tsx               # MODIFIED — +1 routines widget entry
├── lib/i18n/{bn,es,ja,zh,ko}.ts           # MODIFIED — new strings across all 5 catalogs
└── test/
    ├── finance/routines.test.ts           # NEW
    ├── finance/routines-thresholds.test.ts # NEW (if thresholds carry logic worth pinning beyond constants)
    ├── financial-health.test.ts            # MODIFIED — 6th-dimension cases + invariants #7-10
    ├── store/routines.test.tsx             # NEW
    ├── widgets/routines.test.tsx           # NEW
    ├── widgets/financial-health.test.tsx   # MODIFIED
    ├── web/tx-form-auto-categorize.test.tsx # NEW
    ├── location/*.test.ts(x)                # NEW — consent, capture, geocoding probe
    └── i18n/routines-i18n.test.ts           # NEW

supabase/
├── migrations/20260811120000_financial_routines.sql  # NEW
└── functions/geocode-merchant/index.ts                # NEW — credential-gated, probe mode
```

**Structure Decision**: Extends the existing single-project `web/` structure exactly like every prior
spec (034–043) — no new package, no backend/frontend split (Supabase edge functions already live
alongside the web app in this repo's existing `supabase/functions/` convention, e.g. Plaid/Stripe).

## Complexity Tracking

*No Constitution Check violations — table intentionally empty.*
