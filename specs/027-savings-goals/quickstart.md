# Quickstart: Savings & Debt-Payoff Goals

Validation/run guide. Implementation detail lives in `tasks.md` + the code.

## Prerequisites

```bash
cd web && npm install          # Node 22 (.nvmrc); on Linux-arm64 also install the
                               # rolldown/lightningcss/oxide/swc bindings (docs/web.md §8)
```

## 1. Apply the migration locally

```bash
supabase db reset              # replays all migrations incl. 20260718120000_savings_goals.sql
```

Expected: reset succeeds; `goals` and `goal_contributions` exist with member RLS and
`goal_kind` enum. (The seed step is a no-op — `supabase/seed.sql` is empty.)

## 2. Regenerate and run the regression vectors (money/date math)

```bash
cd web
npm run gen:vectors            # writes shared/test-vectors/goals.json from lib/finance/goals.ts
git diff --stat shared/test-vectors/goals.json   # review as a behavior diff
npm test                       # goals.parity.test.ts + goals.unit.test.ts must pass
npx tsc --noEmit               # load-boundary row types + engine typecheck (CI gate)
```

## 3. Validate User Story 1 — create a goal, see progress

- Sign in (local OTP → Inbucket `http://127.0.0.1:54324`), open **Settings → Goals**.
- Create "Trip", target `$2,000`, no date. Expect the progress view: `$0 of $2,000`,
  `$2,000` remaining, `0%`.
- Add contributions `$500` then `$250`. Expect `$750 of $2,000`, `$1,250` remaining,
  `38%`.
- Add a contribution taking the total ≥ target. Expect **reached**, `$0` remaining,
  never a negative remaining or > 100%.
- Automated equivalents: `web/test/goals/GoalCard.test.tsx`,
  `web/test/store/goals.store.test.ts`.

## 4. Validate User Story 2 — off-track insight

- Create a `$12,000` goal due in 12 months (from a fixed reference date), add
  `$1,000` after ~6 months of elapsed time (expected ≈ `$6,000`). Confirm **one**
  off-track insight appears in the Dashboard Insights card naming the goal, stating
  it is behind, and suggesting a monthly amount to still hit the date.
- Confirm no off-track insight for: on-pace, already-reached, or date-less goals.
- Confirm a past-due, unreached goal is flagged (fully behind).
- Automated equivalents: the `pacing` cases in `goals.parity.test.ts` +
  `goals.unit.test.ts` (deterministic injected `now`); calm severity (never
  `critical`/red) asserted in `GoalCard.test.tsx` / insight render test.

## 5. Validate User Story 3 — manage goals

- Edit a goal's target; confirm progress/pace recompute.
- Remove one contribution; confirm saved drops by that amount.
- Delete a goal; confirm it + its contributions vanish for every household member
  (RLS-scoped; the delete cascades).

## 6. Full gate (what CI runs)

```bash
cd web && npm test && npx tsc --noEmit
```

Plus the vector-drift check (green when `goals.json` matches the engine). No iOS
build is involved — this feature ships in the shared web bundle, no native code.
