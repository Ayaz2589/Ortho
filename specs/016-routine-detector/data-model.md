# Data Model — Routine Detector (Phase 1)

All types are **in-memory only**. Nothing here is persisted, and no existing type
is modified. `Transaction` is consumed read-only from `web/lib/types.ts`.

## Input (existing, unchanged)

### Transaction (read-only)
From `lib/types.ts`. Fields the detector reads:

| Field | Type | Use |
|-------|------|-----|
| `merchant` | `string` | merchant grouping key (after normalization) |
| `category` | `TransactionCategory` | category grouping key |
| `kind` | `'expense' \| 'income' \| 'transfer'` | filter — only `expense` considered |
| `amount_cents` | `number` (int, USD cents) | typical amount (median) |
| `date` | `string` (ISO 8601) | occurrence timestamp → gap/cadence + hour bucket |

The detector reads nothing else; `owner_ids`, `shares`, `paid_by`, `source`, ids,
and audit columns are ignored.

## Outputs (new, in-memory)

### Cadence (enum / string union)
`'daily' | 'weekday' | 'weekly' | 'biweekly' | 'monthly' | 'irregular'`
See research D2 for classification rules.

### TimeBucket (enum / string union)
`'morning' | 'midday' | 'afternoon' | 'evening' | 'night'`, or absent when the
group has no reliable real-hour majority (research D3).

### GroupingKind
`'merchant' | 'category'` — which stream produced the routine (research D1).

### Routine
A detected recurring-spend pattern.

| Field | Type | Notes |
|-------|------|-------|
| `kind` | `GroupingKind` | merchant- or category-derived |
| `key` | `string` | grouping key: display merchant name, or category key |
| `label` | `string` | plainspoken, e.g. `"Blue Bottle Coffee — weekday mornings"` or `"Groceries — weekly"` |
| `cadence` | `Cadence` | classified cadence |
| `timeBucket` | `TimeBucket \| null` | present only with a real-hour majority |
| `typicalAmountCents` | `number` | median of occurrence amounts (int cents) |
| `occurrenceCount` | `number` | occurrences within the lookback window |
| `monthlyEstimateCents` | `number` | typical amount × cadence multiplier (research D7) |
| `confidence` | `number` | `[0,1]`, 3-decimal rounded (research D5) |
| `firstSeen` | `string` (ISO) | earliest in-window occurrence date |
| `lastSeen` | `string` (ISO) | latest in-window occurrence date |

**Validation / invariants**
- Only present when `occurrenceCount >= params.minSupportN`.
- `typicalAmountCents >= 0`; integer.
- `confidence` in `[0,1]`.
- `monthlyEstimateCents` integer, rounded.
- A category `Routine` is dropped if fully explained by an already-surfaced
  merchant `Routine` (same occurrence set) — research D1.

### RoutineParams
The knobs a run used (echoed into the report so a reviewer sees the settings).

| Field | Type | Default | Source |
|-------|------|---------|--------|
| `minSupportN` | `number` | `3` | `MIN_SUPPORT_N` (research D4) |
| `lookbackWeeksM` | `number` | `12` | `LOOKBACK_WEEKS_M` (research D4) |
| `now` | `Date` | injected | reference date (no real-clock reads) |

Hour-bucket boundaries and cadence period/tolerance tables are additional exported
constants (research D2/D3/D7), referenced by the params doc but not re-listed per
run.

### RoutineReport
The top-level return value.

| Field | Type | Notes |
|-------|------|-------|
| `routines` | `Routine[]` | ranked, deterministic order (research D6) |
| `monthlyRoutineCostCents` | `number` | sum of each routine's `monthlyEstimateCents` |
| `params` | `RoutineParams` | settings used |

**Empty case**: no qualifying routines → `routines: []`,
`monthlyRoutineCostCents: 0`. Never throws; never an alarmist state (US3 AC-2).

## Derivation flow (not persisted state, just the compute path)

```text
Transaction[]
  → filter kind === 'expense'
  → filter date within [now − M weeks, now]
  → two candidate groupings:
       byNormalizedMerchant, byCategory
  → per group: sort dates → gaps → median gap → Cadence
               real-hour majority → TimeBucket|null
               median amount → typicalAmountCents
               support + regularity → confidence
  → drop groups with count < N or Cadence 'irregular' below the surface bar
  → de-dupe category vs merchant (D1)
  → monthlyEstimateCents per routine (D7)
  → rank (D6)
  → RoutineReport { routines, monthlyRoutineCostCents, params }
```

No state transitions (pure function); the "flow" is a single deterministic pass.
