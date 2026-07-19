# Phase 0 Research: Savings & Debt-Payoff Goals

All decisions below were resolvable from the codebase + spec; there were no
external unknowns. Each records the choice, why, and the alternatives rejected.

## R1. Progress source: contributions vs. account balance

**Decision**: Progress = the integer-cent **sum of contributions** the household
records itself. The optional linked account / category is **contextual metadata
only** and does not drive progress in v1.

**Rationale**: The source description offers "contributions **or** an account's
balance." Ortho's bank linking (spec 024, `docs/supabase.md` §4.6) is **connect-only
— it syncs no balances or transactions**. There is therefore no balance to read.
Contribution-driven progress is the only presently-buildable reading and is also
the "clean, self-contained, privacy-safe" option the backlog note
(`docs/future_tasks/3.1-*`) calls a "good early candidate."

**Alternatives rejected**:
- *Balance-driven progress* — impossible without balance sync; deferred to a future
  spec (recorded in spec Out of Scope).
- *Auto-derive contributions from transactions in the linked category* — fuzzy
  (spend categories don't map to "money set aside"); deferred, category stays
  contextual.

## R2. Where the off-track rule lives

**Decision**: A **separate pure engine** `web/lib/finance/goals.ts` exporting
`goalInsights(...)`, pinned by its **own vector file** `shared/test-vectors/goals.json`.
The two existing insight consumers (`components/dashboard/InsightsCardStack.tsx`,
`components/web/DashboardDesktop.tsx`) merge `generateInsights(...)` with
`goalInsights(...)` and sort via a newly **exported `compareInsights`** from
`insights.ts`.

**Rationale**: This mirrors exactly how prior vectored capabilities were added
without disturbing the 8-rule `insights.json` — `housing-net-rental.json`,
`lease.json`, `member-balance.json` are each their own engine + file (`docs/shared.md`
§8 "Adding a new vector file: two touchpoints"). It keeps `generateInsights`'
signature and `insights.json` **byte-stable** (no regeneration churn / no risk to
the 8 locked rules), while the off-track output is still an ordinary `Insight`
object that renders in the existing Insights card — satisfying "follow the
insights-engine patterns."

**Alternatives rejected**:
- *Add a 9th rule inside `generateInsights`* — would change its signature and force
  an `insights.json` regeneration (laundering risk on 8 shipped rules), and would
  bloat it with goal+contribution data it otherwise never needs.

## R3. Pace model, tolerance, and suggested contribution

**Decision**: **Linear (steady) pace** from the goal's start (`created_at`
calendar day) to its `target_date`. As of the injected reference day:
`expected = round(target × clamp(elapsedDays / spanDays, 0, 1))`. A goal is
**off-track** when it is dated, not reached, and either past its date, or behind
`expected` by at least `offTrackToleranceFraction` of the target. Suggested monthly
contribution `= ceil(remaining / monthsLeft)` where
`monthsLeft = max(1, ceil(daysLeft / 30))` (and `= remaining` when past due).
Constants live in a new `web/lib/finance/goals-thresholds.ts`, mirroring the
`INSIGHT_THRESHOLDS` idiom from spec 025.

**Rationale**: Linear pace is the plainest defensible reading of "behind the pace
needed to hit its target by the target date," is fully deterministic, and needs no
contribution run-rate model. Rounding up the suggested amount guarantees that
following it actually reaches the target. Named thresholds keep the magic numbers
testable and tunable in one place (the spec-025 precedent).

**Alternatives rejected**:
- *Run-rate extrapolation from recent contributions* — more moving parts, harder to
  pin, not needed for a v1 nudge.
- *Inline literals* — spec 025 explicitly de-magicked insight thresholds; do not
  re-introduce them.

## R4. Date & timezone handling

**Decision**: Compute all spans as **calendar-day indices** built from **local**
getters (`Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())/86400000)`),
parse the date-only `target_date` via the shared `parseLocalDate` (`web/lib/format.ts`),
and take an **injected `now`**. Vectors run under the harness `TZ=UTC` pin.

**Rationale**: This is the exact rule `insights.ts` / housing dates already follow
(`docs/web.md` gotcha: "dates fed to the finance engines must be built on the LOCAL
calendar"; `docs/shared.md` §8 TZ pin). A day-index derived from local Y/M/D is
timezone-stable and avoids the west-of-UTC month/day flip. Injecting `now` keeps the
logic deterministic and clock-free (Constitution VI).

**Alternatives rejected**:
- *Raw `new Date('YYYY-MM-DD')` (UTC midnight)* — shifts a day west of UTC (the bug
  class spec 019/023 fixed); rejected.
- *`Date.now()` inside the engine* — non-deterministic; rejected.

## R5. Schema shape, RLS, and grants

**Decision**: Two tables. `goals` (household-scoped, budgets-style member RLS via
`is_household_member`). `goal_contributions` (child of `goals`, RLS via an `EXISTS`
subquery against the parent goal's household — the `transaction_shares` precedent).
A new `goal_kind` enum (`savings | debt_payoff`). **Explicit grants** to
`authenticated` on both tables (the spec-024 ACL rule — newer PG17 stacks don't
auto-grant DML). `on delete cascade` from household→goals and goal→contributions.
Optional `linked_account_id` → `linked_accounts(id) on delete set null`;
`linked_category transaction_category`; a check enforcing **at most one** of the two
associations.

**Rationale**: Goals are collectively-owned household data exactly like budgets, so
they get the same simple member RLS; contributions inherit visibility from their
parent the way shares do. `goal_kind` is a brand-new enum used in the same migration
— allowed (the `CREATE TYPE` + use pattern spec 024 uses; only `ALTER TYPE ... ADD
VALUE` is same-migration-forbidden). Explicit grants keep it correct on both old and
new ACL regimes.

**Alternatives rejected**:
- *A single `current_cents` column on `goals` instead of a contributions table* —
  loses history and the "accumulated contributions" framing; a child table is the
  faithful model and is cheap.
- *Storing progress/derived fields in SQL* — violates the "DB stores, clients
  compute" convention; all derivation stays in the pure engine.
- *Service-role-only writes (the entitlements/Plaid posture)* — unnecessary; goals
  carry no secret and are member-managed like budgets.

## R6. Navigation placement

**Decision**: Goals is a **secondary route** `app/(app)/goals/page.tsx` reached
from a **Settings row**, rendered in a centered `ReadingColumn` — no fifth primary
nav tab, no separate `*Desktop` composition.

**Rationale**: This is the **budgets** precedent (`app/(app)/budgets/page.tsx` is
reached from Settings, uses `ReadingColumn`, has no desktop master–detail). It
preserves the four canonical destinations on every canvas (Constitution III) and
keeps a bounded list calm and readable from phone to ultrawide.

**Alternatives rejected**:
- *A fifth primary tab* — breaks the "four destinations preserved across every
  canvas" contract.
- *A full `GoalsDesktop` 12-column master–detail* — unwarranted for a bounded list;
  budgets sets the precedent that secondary planning surfaces stay in the reading
  column.
