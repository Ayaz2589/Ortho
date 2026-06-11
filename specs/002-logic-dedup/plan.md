# Implementation Plan: Logic De-duplication

**Branch**: `002-logic-dedup` | **Date**: 2026-06-11 | **Spec**: ./spec.md

## Summary

Two independent workstreams, both reducing Swift↔TS duplication without a
backend tier: (A) Postgres aggregation views/RPCs that both clients call, and
(B) shared golden test vectors that lock mortgage + insight parity across
languages. (A) is additive and applied by the maintainer; (B) is fully built
and verified on the web side here.

## Technical Context

**Languages**: TypeScript 5 (web), Swift 5.9 (iOS), PL/pgSQL + SQL (Supabase)

**Testing**: Vitest (new, web), XCTest (new file, iOS — run on macOS)

**Storage**: Supabase Postgres (existing schema; RLS via `is_household_member`)

**Constraints**: No DB credentials here (migration delivered, not applied); no
Xcode on Linux (Swift test delivered, not run); the live web app must keep
working before the migration is applied; tokens/secrets unchanged.

## Constitution Check

- **I. Tokens only / II. Calm** — N/A (no UI changes).
- **III. Right form factor** — preserved; clients stay Supabase-direct, optimistic
  UI untouched.
- **V. Accessible** — N/A.
- **Additional constraints** — money stays USD cents; presentation per-client.
- **Workflow** — spec-driven; verification favors typecheck + tests; do not run
  `next build` / delete `.next` while the dev server runs (use Vitest + tsc).

No violations → Complexity Tracking empty.

## Project Structure

```text
specs/002-logic-dedup/{spec.md, plan.md, tasks.md}

shared/
└── test-vectors/
    ├── README.md
    ├── mortgage.json        # canonical mortgage cases (pinned asOf)
    └── insights.json        # canonical insight scenarios (pinned referenceDate)

Ortho-web/
├── lib/finance/mortgage.ts          # parity fix: calendar month/year counting
├── lib/api/aggregates.ts            # NEW: thin RPC wrapper (additive)
├── test/mortgage.parity.test.ts     # NEW: Vitest vs mortgage.json
├── test/insights.parity.test.ts     # NEW: Vitest vs insights.json
├── vitest.config.ts                 # NEW
└── package.json                     # + vitest devDep, "test" script

Ortho-iOS/
└── Ortho-iOSTests/
    ├── MortgageParityTests.swift     # NEW (add target in Xcode)
    └── InsightParityTests.swift      # NEW

supabase/migrations/
└── 20260611_aggregates.sql           # NEW: views/RPCs (apply via supabase db push)
```

**Structure Decision**: monorepo — `shared/test-vectors/` and `supabase/` live
at the repo root, shared by both apps. The web suite reads vectors via a
relative path; iOS bundles the JSON as a test resource. All DB migrations
(schema + these aggregates) are consolidated in the root `supabase/migrations`.

## Approach

### A. Postgres aggregations
- One migration adds `security definer` functions keyed on
  `(p_household_id, p_start, p_end)` that re-check `is_household_member` and
  return USD-cent aggregates:
  - `household_owner_spend` — split-weighted per owner (joins `transaction_shares`,
    even-splits when no shares).
  - `household_category_totals` — expense sum per category.
  - `household_month_summary` — income, expense, net for the range.
  - `household_daily_expense` — date + expense cents per day.
- Web `lib/api/aggregates.ts` wraps `supabase.rpc(...)`. **Additive**: widgets
  keep their current client computation until the maintainer applies the
  migration and flips them over (documented in the vectors README + migration
  header). Keeps the live app working.

### B. Golden vectors + parity
- Fix TS mortgage to match Swift: a day-aware `monthsElapsed` (whole months,
  `-1` when `asOf.day < closing.day`) used by balance/equity/amortization, and a
  calendar-accurate `yearsRemaining`. Recompute vectors against the corrected TS
  and confirm they equal hand-computed closed-form values.
- Vectors pin all dates; pick closing day ≤ 28 and `asOf.day ≥ closing.day` to
  avoid ambiguous boundaries / JS month-overflow.
- Web Vitest loads the JSON, asserts every mortgage field and every insight
  scenario, and is run green here. Swift XCTest mirrors it (delivered, run on Mac).

## Risks & Mitigations

- **Unverifiable SQL / Swift here** → SQL is reviewed against the known TS
  semantics and shipped as a migration; Swift test mirrors the verified TS test
  1:1. Both are clearly marked as maintainer-applied/run.
- **Month-boundary divergence** → corrected in TS + safe vector dates.
- **Breaking the live app** → RPC layer is additive; no widget is cut over here.

## Complexity Tracking

No constitution violations — none.
