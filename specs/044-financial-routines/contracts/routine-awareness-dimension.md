# Contract: `routine_awareness` financial-health dimension

Extends `specs/041-financial-health/contracts/health-scoring.md` — read that first. This document
covers only the sixth dimension added by spec 044; the other five are unchanged (same scores, same
weighting math, same band boundaries). `DIMENSION_ORDER` becomes:

```
['cash_flow', 'safety_net', 'commitment_load', 'savings_momentum', 'plan_engagement', 'routine_awareness']
```

Appended, not inserted — existing dimension positions/keys are stable (no behavior change to a
household with `weights` already set for the original five; the new dimension defaults to
`DEFAULT_WEIGHT` (3) like any other unset weight).

## `FinancialHealthInput` addition

```ts
interface FinancialHealthInput {
  // ...existing fields unchanged...
  routines: RoutineWithState[]   // NEW — output of applyRoutineStates(), household-scoped
}
```

## `DimensionScore` addition

```ts
interface DimensionScore {
  key: HealthDimension
  score: number
  weight: number
  contributingRoutineKeys?: string[]   // NEW — set only for key === 'routine_awareness'
}
```

## Scoring — like `plan_engagement`, needs no profile

`routine_awareness` never uses `profile` (scores from real transaction/routine data always, even in
profile-null mode) — consistent with `plan_engagement` being the one existing dimension that already
works without a profile.

**Composite gating (discovered during implementation, corrects an earlier gap in this contract):**
the function also returns `hasData: boolean` (true once `activeRoutines.length > 0`). `scoreFinancialHealth`
excludes `routine_awareness` from the weighted composite/topAction calculation entirely whenever
`hasData` is false — simply averaging in a `NEUTRAL` placeholder score for every household with zero
routines would change the overall score/band for every existing spec-041 household, which is a
literal violation of FR-010. The dimension still appears in the `dimensions` array for display (the
UI renders its calm "not enough history yet" row either way) — only its effect on the composite score
is gated on real signal existing.

1. `activeRoutines` = `routines.filter(r => r.status === 'confirmed' || r.status === 'recognized')`
   (excludes `dismissed` and `lapsed` — a lapsed routine no longer represents live, predictable
   spend).
2. `windowSpendCents` = sum of `expense` transaction `amount_cents` in the trailing
   `ROUTINE_AWARENESS_WINDOW_MONTHS` (default 6, matches `recurringWindowMonths`).
3. `routineSpendCents` = sum, over `activeRoutines`, of `typicalAmountCents * occurrencesInWindow`
   (recurring_charge: cadence-implied count within the window; behavioral_habit:
   `occurrenceCount` as already windowed by the engine's `behavioralWindowWeeks`).
4. **No history** (`windowSpendCents === 0`, i.e. no expense transactions at all in the window) →
   `score = NEUTRAL (50)`, `contributingRoutineKeys = []` — the "not enough history yet" calm state
   from Story 3 AC2, not a penalized low score.
5. Otherwise: `coverage = clamp(routineSpendCents / windowSpendCents, 0, 1)`;
   `score = clampScore(lerp(coverage, ROUTINE_AWARENESS_LOW, ROUTINE_AWARENESS_HIGH, ROUTINE_AWARENESS_FLOOR, 100))`
   with defaults `ROUTINE_AWARENESS_LOW = 0.15`, `ROUTINE_AWARENESS_HIGH = 0.6`,
   `ROUTINE_AWARENESS_FLOOR = 35` (supportive floor, like every other dimension's floor — never 0).
6. `contributingRoutineKeys` = `activeRoutines.map(r => r.routineKey)`, sorted by
   `typicalAmountCents * occurrencesInWindow` descending (largest contributor first) — the UI cites
   these (FR-009's "breakdown MUST be able to cite the specific routine(s)").

## Action template (new `ACTION_TEMPLATES` entry)

```ts
routine_awareness: {
  key: 'A few more recognized routines would make your spending easier to predict — review what’s been detected.',
  args: [],
}
```

Only ever becomes `topAction` when it has the lowest weighted contribution among all six dimensions
— same tie-break rule as today (fixed `DIMENSION_ORDER` position, unchanged for the first five).

## Invariants (property tests, additive to health-scoring.md's list)

7. `routine_awareness` score is `NEUTRAL` (never below it) whenever `routines` is empty or
   `windowSpendCents === 0` — dismissing every routine or having no history never reads as a
   penalized low score (Story 3 AC2).
8. Dismissing a previously-`recognized`/`confirmed` routine (moving it out of `activeRoutines`) never
   *increases* `routine_awareness`'s score, and removes its key from `contributingRoutineKeys`
   (Story 3 AC3).
9. Adding weight to `routine_awareness` never decreases its share of the composite score (same
   invariant #4 from health-scoring.md, generalized to six dimensions).
10. Both the five pre-existing dimensions' individual scores AND the overall composite `score`/`band`
    are byte-identical to their spec 041 values for any input that omits `routines` (empty array) —
    this is the literal "no regression" requirement (FR-010, Story 3 AC2), and specifically why
    `hasData` gates the composite, not just the individual dimension score.
