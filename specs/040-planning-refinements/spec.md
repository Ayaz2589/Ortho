# Spec 040 — Planning refinements

Three cohesive refinements to the Planning Hub (spec 038) after early use. No schema change; pure/UI
work, fully TDD. Builds on 038 (planning hub) and 039 (settings-shortcut widgets).

## Motivation

1. **Budgets & Goals feel like a Settings sub-area.** The detail pages live at top-level `/budgets`
   and `/goals` and their back-link returns to **Settings**, so they read as children of Settings even
   though Planning (spec 038) is now their real home. They should live under Planning.
2. **Goals show a total, not a ledger.** A goal card shows how much is saved of the target and the
   pace, but not the *individual* contributions that got there — so a user can't see or sanity-check
   the payments behind the number.
3. **"Left to plan" ignores money already spent.** The hero figure is `income − budgeted − goal
   contributions`. If a household earns 10k, budgets 2k, and then spends 5k on things it never
   budgeted for, "Left to plan" still reads ~8k — it never subtracts unplanned spending, so it
   overstates what's actually free.

## User stories

- **US1 — Budgets & Goals live under Planning.** As a user, opening Budgets or Goals from the
  Planning hub takes me to `/planning/budget` and `/planning/goals`, and their back-link returns me to
  **Planning**, not Settings.
- **US2 — See the payments behind a goal.** As a user, a goal card lists each contribution
  (date, amount, optional note), newest first, so the saved total is auditable.
- **US3 — "Left to plan" reflects real spending.** As a user, money I've spent this month outside any
  budgeted category lowers "Left to plan", so the figure is the money genuinely left to allocate.

## Functional requirements

- **FR-040-1** Budgets detail is served at `/planning/budget`; Goals detail at `/planning/goals`. The
  old `/budgets` and `/goals` routes are removed. The Planning hub's Budgets/Goals summary cards link
  to the new paths; route-skeleton matching follows the new paths.
- **FR-040-2** The Budgets and Goals pages' back-link points to `/planning` and reads "Planning".
- **FR-040-3** A goal card renders an itemized list of its contributions — date, amount, and note when
  present — ordered newest-first. A goal with no contributions shows a calm empty line, not a blank.
- **FR-040-4** `planHealth.leftToPlanCents = income − budgeted − plannedGoalContributions −
  unbudgetedSpent`, where `unbudgetedSpent` is the month's expense transactions whose category has no
  budget (`monthly_limit_cents > 0`, any budget type). The hero breakdown shows this as its own line.
- **FR-040-5** Loss/over-commitment stays calm — negative "Left to plan" and any spend figure use the
  neutral/accent tokens, never red (constitution I/II). New copy lands in all five catalogs.

## Non-goals

- No change to how budgets or goals are created/edited, nor to the goal-pacing / budget-rollover math.
- Over-budget overspend *within* a budgeted category is not folded into "Left to plan" — that category's
  reserved allowance already accounts for its spend, and pace is surfaced by the at-risk card.
- No redirects from the old `/budgets` `/goals` paths (personal app, no external deep-links).
