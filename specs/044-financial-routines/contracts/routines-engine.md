# Contract: Routine detection engine

The deterministic contract implemented by `web/lib/finance/routines.ts`, pinned by
`web/test/finance/routines.test.ts`. Pure, side-effect-free; `now` injected. All constants live in
`web/lib/finance/routines-thresholds.ts`. Mirrors the shape (and reuses the tuning precedent) of
`insights.ts`'s existing "Rule 5: Recurring subscriptions" detector (research.md §4) but produces
individually-identified, persistently-trackable candidates instead of one ephemeral insight string.

## Types

```ts
type RoutineKind = 'recurring_charge' | 'behavioral_habit'
type RoutineDerivedStatus = 'recognized' | 'lapsed'
type RoutineStatus = RoutineDerivedStatus | 'confirmed' | 'dismissed'

interface DetectedRoutine {
  routineKey: string                    // deterministic identity, see below
  kind: RoutineKind
  merchantKey: string                   // normalizeMerchantKey() output
  merchantLabel: string                 // most-frequent raw merchant string among evidence
  category: TransactionCategory | null  // most-frequent category among evidence
  weekday: number | null                // 0=Sun..6=Sat; behavioral_habit only
  hourBucket: number | null             // 0..(24/behavioralHourBucketSizeHours - 1); behavioral_habit only
  personId: string | null               // single owner_ids[0] if every evidence tx has exactly one
                                         // owner and it's the same person throughout; else null (shared)
  typicalAmountCents: number            // median of evidence amounts
  amountVarianceCents: number           // max deviation from typicalAmountCents among evidence
  occurrenceCount: number
  firstSeenAt: string                   // ISO date of earliest evidence transaction
  lastSeenAt: string                    // ISO date of latest evidence transaction
  confidence: number                    // 0..100, see "Confidence"
  derivedStatus: RoutineDerivedStatus
  evidenceTransactionIds: string[]
}

interface RoutineWithState extends DetectedRoutine {
  status: RoutineStatus                 // 'confirmed'/'dismissed' from state row overrides derivedStatus
  label: string | null                  // state row's user rename, else null
}

function detectRoutines(transactions: Transaction[], now: Date): DetectedRoutine[]
function applyRoutineStates(detected: DetectedRoutine[], states: RecognizedRoutineState[]): RoutineWithState[]
function normalizeMerchantKey(merchant: string): string
```

## `routineKey` — deterministic identity

```
recurring_charge: `rc:${merchantKey}`
behavioral_habit: `bh:${merchantKey}:${weekday}:${hourBucket}`
```

Stable across re-detection runs as long as the same merchant/weekday/hour-bucket keeps recurring —
this is what lets a `recognized_routine_states` row (FR-005's confirm/dismiss/rename) keep applying
to "the same" real-world pattern as new transactions arrive (FR-006).

## `normalizeMerchantKey` (FR-007)

Lowercase; strip a trailing point-of-sale store/location number (`/\s*#?\d{3,6}$/`); collapse
internal whitespace/punctuation to single spaces; trim. E.g. `"Dunkin' #04521"` and `"DUNKIN 4521"`
→ `"dunkin"`. Heuristic, not a full merchant-identity resolver — documented as a tunable regex set in
`routines-thresholds.ts`, extendable without touching detection logic.

## FR-001/FR-002 — `recurring_charge` candidates

For each `normalizeMerchantKey` group of `expense` transactions within the trailing
`recurringWindowMonths` (default 6):

1. Require `occurrenceCount >= recurringMinCount` (default 3).
2. Compute `typicalAmountCents` = median amount; reject the group if any amount falls outside
   `±recurringAmountTolerance` (default 8%) of the median for more than
   `1 - recurringHitRatio` of occurrences (default hit ratio 0.75 — mirrors `insights.ts`'s existing
   `recurringHitRatio`).
3. Compute consecutive-gap days between sorted evidence dates; require the fraction of gaps inside
   `[recurringCadenceMinDays, recurringCadenceMaxDays]` (default 21–40 days — wider than `insights.ts`'s
   28–35 to tolerate short-month/weekend drift over a longer detection lifetime) to be
   `>= recurringHitRatio`.
4. `confidence` = `100 * min(1, occurrenceCount / (recurringMinCount * 2)) * cadenceHitRatio` (whole
   number, clamped `[0,100]`).

## FR-003 — `behavioral_habit` candidates

Only transactions with a real time-of-day (assumption: manual/receipt entries — see "Time-of-day
availability" below) are eligible. Group by `(merchantKey, weekday, hourBucket)` (bucket size
`behavioralHourBucketSizeHours`, default 2h ⇒ 12 buckets/day) within the trailing
`behavioralWindowWeeks` (default 8):

1. Require `occurrenceCount >= behavioralMinCount` (default 4).
2. Require the fraction of *eligible weeks in the window* that contain at least one matching
   transaction to be `>= behavioralHitRatio` (default 0.6) — i.e. "most weeks, not most days."
3. Amount is **not** gated (habits vary in cost) — `typicalAmountCents`/`amountVarianceCents` are
   still reported (median/spread) for display, just not used as a matching criterion.
4. `confidence` = `100 * min(1, occurrenceCount / (behavioralMinCount * 2)) * weekHitRatio`.

### Time-of-day availability

A transaction has a real time-of-day only when its stored `date` carries meaningful sub-day
precision — per `PARITY.md`, imported/statement rows are noon-UTC-pinned placeholders and MUST be
excluded from behavioral grouping (still eligible for `recurring_charge` grouping, which is
date-only). The engine determines eligibility via a `hasRealTimeOfDay(tx)` predicate checked against
`tx.source` (import-tagged sources excluded) — exact predicate finalized against the real `source`
values used by the import pipeline vs. manual/receipt entry (see `lib/dataFile`/scan code) during
implementation; documented here as a named, tested function precisely so the heuristic is visible
and can be corrected without touching the grouping logic around it.

## `derivedStatus` — recognized vs. lapsed (FR-006)

A candidate is `lapsed` when no evidence transaction falls within
`lapseAfterMissedCycles` (default 2) expected cycles of `now` — for `recurring_charge`, "expected
cycle" = the group's observed median cadence in days; for `behavioral_habit`, "expected cycle" = 7
days (weekly). Otherwise `recognized`. Lapsed candidates are still returned (never silently dropped)
so the UI can show "this one stopped" (edge case: cancelled subscription) rather than have it vanish.

## `applyRoutineStates` — overlay persisted state

For each `DetectedRoutine`, look up a `recognized_routine_states` row by `(household_id, routineKey)`:
- No row → `status = derivedStatus`, `label = null`.
- Row with `status = 'dismissed'` → `status = 'dismissed'` (overrides `derivedStatus` even if still
  `recognized` — FR-005's "don't re-surface an identical dismissed suggestion").
- Row with `status = 'confirmed'` → `status = 'confirmed'` **unless** `derivedStatus === 'lapsed'`, in
  which case `status = 'lapsed'` wins (a confirmed-but-now-inactive subscription should read as
  lapsed, not still "confirmed active" — edge case: cancelled subscription that was previously
  confirmed).
- `label` = the row's `label` if non-null, else `null` (UI falls back to `merchantLabel`).

A dismissed routine whose evidence set changes materially (research.md's "don't immediately
re-surface" edge case) is out of scope for the pure engine — it always re-applies the same
`routineKey` match; re-surfacing suppression is exactly the persisted dismissal doing its job. If the
*pattern* genuinely changes (e.g. cadence drifts enough to fail the recurring-charge gate), a new,
different `routineKey` naturally won't carry the old dismissal forward, which is the intended
behavior (FR-006's "update... rather than treating a drifted pattern as an entirely new,
unrelated one" is bounded by the tolerance windows in FR-001–003; the engine does not attempt
fuzzy identity-tracking across a tolerance-breaking drift).

## Attribution (`personId`, FR-008/FR-016)

`personId` is set only when every evidence transaction has `owner_ids.length === 1` and they're all
the same person — i.e. the pattern is unambiguously one person's spending. Any split/shared evidence
→ `personId = null` (household-wide). This feeds the UI-layer visibility filter described in
data-model.md — a routine with non-null `personId` is presented as that member's personal routine;
`null` is shown to the household. (No RLS distinction — see data-model.md's RLS section.)

## Invariants (property tests)

1. `detectRoutines` is pure and order-independent: shuffling the input transaction array produces the
   same set of `DetectedRoutine`s (routineKey-keyed comparison).
2. Every `evidenceTransactionIds` entry actually exists in the input and matches the group's
   `merchantKey` (+ `weekday`/`hourBucket` for behavioral).
3. `occurrenceCount === evidenceTransactionIds.length`.
4. `confidence ∈ [0,100]` for all inputs, including a single-occurrence group (below the min-count
   gate, so it never appears as output at all — confidence is only computed for groups that already
   passed the count gate).
5. `applyRoutineStates` never fabricates a `confirmed`/`dismissed` status without a matching state row,
   and never drops a `DetectedRoutine` — the output array length always equals the input length.
6. Two households' transactions never cross-contaminate a `routineKey` (grouping is always scoped to
   a single household's transaction array — the caller passes one household's transactions in, same
   as every other pure engine in `lib/finance/`).
