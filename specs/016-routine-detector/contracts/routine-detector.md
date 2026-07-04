# Contract — Routine Detector public interface

Module: `web/lib/finance/routines.ts`. Framework-free pure TypeScript. This is the
public surface tests and the harness depend on; internal helpers may change freely.

## Exported constants (tunable defaults — FR-007)

```ts
export const MIN_SUPPORT_N = 3          // occurrences required to surface a routine
export const LOOKBACK_WEEKS_M = 12      // rolling window (weeks) considered
export const HOUR_BUCKETS: ReadonlyArray<{ bucket: TimeBucket; startHour: number; endHour: number }>
export const CADENCE_PERIODS: Readonly<Record<Exclude<Cadence,'irregular'>, { days: number; tolerance: number }>>
export const CADENCE_MONTHLY_MULTIPLIER: Readonly<Record<Cadence, number>>
export const NOON_UTC_SENTINEL_HOUR = 12   // import pin → treated as "hour unknown"
```

## Exported types

```ts
export type Cadence = 'daily' | 'weekday' | 'weekly' | 'biweekly' | 'monthly' | 'irregular'
export type TimeBucket = 'morning' | 'midday' | 'afternoon' | 'evening' | 'night'
export type GroupingKind = 'merchant' | 'category'

export interface Routine {
  kind: GroupingKind
  key: string
  label: string
  cadence: Cadence
  timeBucket: TimeBucket | null
  typicalAmountCents: number
  occurrenceCount: number
  monthlyEstimateCents: number
  confidence: number          // [0,1], 3-decimal rounded
  firstSeen: string           // ISO
  lastSeen: string            // ISO
}

export interface RoutineParams {
  minSupportN: number
  lookbackWeeksM: number
  now: Date
}

export interface RoutineReport {
  routines: Routine[]
  monthlyRoutineCostCents: number
  params: RoutineParams
}

export interface DetectOptions {
  now: Date                    // REQUIRED — injected reference date (no real-clock reads)
  minSupportN?: number         // default MIN_SUPPORT_N
  lookbackWeeksM?: number      // default LOOKBACK_WEEKS_M
}
```

## Primary entry point

```ts
export function detectRoutines(
  transactions: Transaction[],
  options: DetectOptions,
): RoutineReport
```

**Contract**
- Pure & deterministic: same `transactions` (any order) + same `options.now` →
  identical `RoutineReport` (deep-equal, same array order). No `Date.now()`, no
  network, no mutation of the input array.
- Considers only `kind === 'expense'` rows whose `date` is within
  `[now − lookbackWeeksM weeks, now]`.
- Returns `{ routines: [], monthlyRoutineCostCents: 0, params }` for empty/short
  input — never throws.
- `routines` is ranked per research D6; `params` echoes the effective settings.

## Supporting exports (unit-tested directly)

```ts
export function normalizeMerchant(raw: string): string        // research D8
export function classifyCadence(sortedDates: Date[]): Cadence // research D2
export function hourBucket(d: Date): TimeBucket | null        // null for noon-UTC sentinel — research D3
export function monthlyEquivalentCents(cadence: Cadence, typicalCents: number): number // research D7
export function confidenceScore(gapsDays: number[], count: number, cadence: Cadence, spanDays: number): number // research D5
```

These are exported so tests can assert each rule with hand-computed expectations
(the constitution's "money & date math locked by deterministic tests"), and so the
formulas are inspectable without reaching into `detectRoutines` internals.

## Non-goals (contract-level)

- No persistence, no I/O, no React/Next/Supabase imports.
- Does not import from or modify `insights.ts`; adds no golden vector.
- No iOS/Swift counterpart in this slice.
