# Research — Routine Detector (Phase 0)

All decisions below are for a **prototype** whose job is to answer a yes/no
question, so each favors the simplest defensible rule and documents the knob to
turn later. No `NEEDS CLARIFICATION` remained after spec; these resolve the
"how".

## D1 — Grouping key: merchant AND category (two candidate streams)

**Decision**: Produce candidates from two independent groupings and merge:
(a) by **normalized merchant** (`"Blue Bottle Coffee"` → its own group), and
(b) by **category** (`groceries` across Whole Foods / Trader Joe's / Costco).

**Rationale**: findings.md §"Why location is not strictly needed" says the routine
is `merchant + cadence` *or* `category + cadence` — a weekly grocery run is a
routine even though the merchant rotates. Merchant-level catches the coffee shop;
category-level catches the grocery habit. A merchant-level routine is preferred
when it exists (more specific); category-level fills in when no single merchant
clears threshold.

**De-duplication**: if a category routine is entirely explained by one merchant
routine already surfaced (same occurrences), keep the merchant one and drop the
redundant category one. Documented tiebreak (D6) keeps this deterministic.

**Alternatives considered**: merchant-only (misses the grocery habit); a combined
`(merchant|category, weekday, hour)` single key as in the raw findings sketch
(explodes into many tiny groups, weaker support per group).

## D2 — Cadence classification from inter-occurrence spacing

**Decision**: Sort a group's occurrence dates; compute consecutive gaps in days;
take the **median gap**; classify by nearest canonical period within tolerance:

| Cadence label      | Median gap (days) | Notes |
|--------------------|-------------------|-------|
| `daily`            | ≤ 1.5             | every day incl. weekends |
| `weekday`          | ~1–2, but occurrences fall Mon–Fri only | daily-ish but no weekend rows |
| `weekly`           | 5–9               | centered on 7 |
| `biweekly`         | 11–17             | centered on 14 |
| `monthly`          | 26–35             | centered on ~30 |
| `irregular`        | anything else, or gap variance too high | not surfaced unless it still clears N (see D4) |

`weekday` vs `daily` is decided by whether occurrences land only on Mon–Fri.
The canonical periods and tolerances are exported constants.

**Rationale**: median gap is robust to a single missed week or a double-up;
canonical-period bucketing is transparent and testable, and it's the "frequency
stats, not ML" the spec mandates.

**Alternatives considered**: FFT/autocorrelation (overkill, opaque, fails on <8
points); mean gap (skewed by one long gap); fixed-window histogram of weekday/hour
(the raw sketch — kept as the *time-bucket* mechanism in D3, not the cadence one).

## D3 — Time-of-day bucket, and the noon-UTC sentinel

**Decision**: A transaction's hour is "real" **unless** its timestamp is exactly
the import sentinel `12:00:00.000 UTC` (PARITY.md: imported rows are pinned to
noon-UTC). Real hours map to buckets by exported boundaries:

| Bucket      | Hours (local-agnostic, on the stored UTC hour for the prototype) |
|-------------|------------------------------------------------------------------|
| `morning`   | 5–10 |
| `midday`    | 11–13 |
| `afternoon` | 14–17 |
| `evening`   | 18–22 |
| `night`     | 23–4 |

A group gets a time bucket only when a **majority** of its real-hour occurrences
share one bucket; groups made mostly of sentinel rows get **no** bucket and their
label omits the time phrase ("weekday" not "weekday mornings").

**Rationale**: honours the spec's hard edge case — statement imports have no true
hour, so asserting one would be "confidently wrong" (the exact trap findings.md
names). Treating exactly noon-UTC as unknown is a documented heuristic; a genuine
noon purchase merely loses its bucket, which is harmless.

**Prototype simplification**: buckets are computed on the **stored UTC hour**
(the app pins imports in UTC and manual entries carry a real instant). True
per-household-timezone bucketing is a later refinement, noted as a limitation.

**Alternatives considered**: a nullable `occurred_at` schema field to carry a true
local time — out of scope (spec forbids schema change); inferring TZ from data
(unreliable at this scale).

## D4 — Support threshold N and lookback window M

**Decision**: Exported defaults `MIN_SUPPORT_N = 3` occurrences within
`LOOKBACK_WEEKS_M = 12` weeks (≈ one quarter). Only occurrences inside
`[now − M weeks, now]` count.

**Rationale**: 3 is the smallest count that can establish a rhythm (two gaps to
measure regularity); a quarter is long enough to see monthly cadence three times
and weekly cadence ~12 times, short enough that a stale habit ages out. Both are
knobs the team will tune after seeing output (SC-004), which is why they're
exported constants (FR-007).

**Alternatives considered**: N=2 (a single coincidence reads as a routine — too
noisy); M = trailing 6 months (matches the existing recurring insight but dilutes
"current" routines). Chosen values documented as the starting point.

## D5 — Confidence score (support × regularity)

**Decision**: `confidence = supportScore * regularityScore`, both in `[0,1]`:

- `supportScore = min(1, count / expectedCount)` where `expectedCount` is how many
  times the classified cadence *should* have occurred across the observed span
  (e.g. weekly over 12 weeks → 12). Caps at 1.
- `regularityScore = 1 − min(1, stdev(gaps) / mean(gaps))` — the coefficient of
  variation of the gaps, inverted, so evenly-spaced groups score ~1 and erratic
  ones approach 0. A single-gap group (count=2) is excluded by N=3 anyway.

Rounded to 3 decimals for stable comparison/printing.

**Rationale**: directly encodes FR-009 ("more support AND more regular ranks
higher"). Both terms are pure functions of the gap sequence — deterministic and
unit-testable with hand-computed expectations.

**Alternatives considered**: entropy-based scores, Bayesian smoothing — more than a
go/no-go prototype needs. Kept the two-factor product for legibility.

## D6 — Ranking and deterministic tiebreak

**Decision**: Rank by, in order: (1) `confidence` desc, (2) monthly-equivalent
cost desc (bigger money first), (3) occurrence `count` desc, (4) grouping kind
(`merchant` before `category`), (5) identity string ascending (merchant name or
category key) as the final total-order tiebreak.

**Rationale**: puts the most trustworthy, highest-value routines on top (matches
the "cash-flow / routine cost is the payoff" framing) while guaranteeing a total
order → byte-identical output on re-run (FR-010, SC-003). The final string sort
removes any dependence on input order or `Array.sort` stability.

## D7 — Monthly routine cost roll-up

**Decision**: Convert each surfaced routine's **typical amount** (median of its
occurrence amounts, in cents) to a monthly figure by cadence multiplier, then sum:

| Cadence   | Occurrences per month (multiplier) |
|-----------|------------------------------------|
| daily     | 30 |
| weekday   | 21.7 (≈ 5 × 52 / 12) |
| weekly    | 4.345 (52 / 12) |
| biweekly  | 2.17 (26 / 12) |
| monthly   | 1 |
| irregular | count within window ÷ (window months) |

Result is rounded to whole cents. Multipliers are exported constants.

**Rationale**: gives the calm "your routine ≈ $X/mo" summary (US3) with defensible,
documented factors. Median (not mean) typical amount resists a single outlier
charge.

**Alternatives considered**: summing actual observed spend in the window (answers
"what did routines cost last quarter" not "what do they cost per month") — kept as
a possible second metric but not the headline.

## D8 — Merchant normalization (light)

**Decision**: `normalizeMerchant(s)` = trim → collapse internal whitespace →
lowercase for the **grouping key only** (display keeps the original-cased most
common variant) → strip a trailing store-number/ref token (e.g. ` #3401`,
` 3401`, trailing `-` codes). No alias table.

**Rationale**: cheaply merges `Dunkin' #12` and `Dunkin'` without pretending to
solve canonicalization — exactly the "light normalization, documented limits"
the spec calls for. `DD/BR #3401 ≠ Dunkin'` remains unmerged and is called out as
a known limitation.

## D9 — Demo fixture design (planted routines) + sparse control

**Decision**: `lib/testdata/routine-demo.ts` builds a `Transaction[]` (same shape
as `seed.ts`) over ~12 weeks relative to an injected base date, planting:

- **Weekday coffee** — one merchant, Mon–Fri mornings, ~$5 (→ `weekday`, morning).
- **Weekday transit** — one merchant, Mon–Fri mornings, ~$2.90 (→ `weekday`).
- **Weekly groceries** — Saturdays, rotating across 3 merchants, ~$70–90 (→
  category `groceries`, `weekly`, no strong single-merchant routine).
- **Monthly subscription** — one merchant, same day each month, $15.99 (→
  `monthly`).
- **Noise** — a handful of genuine one-offs (a flight, a gift) that must NOT
  surface (SC-002).

The existing **`seed.ts`** (16 rows, mostly one-offs) is imported unchanged as the
**sparse control**: expected to surface at most the genuinely repeating spend
(monthly rent ×2 → below N=3 so likely nothing; `groceries` category appears 4×
across the span → may surface as a weak weekly/biweekly routine). Both are printed
by the harness so the contrast is visible.

**Rationale**: SC-001 needs a positive dataset with known ground truth; SC-002/the
"stays quiet" control needs a sparse real dataset. Building the demo from the same
`iso(daysAgo)` clock-independent base as `seed.ts` keeps it deterministic.

## D10 — Harness (developer-facing, plain tsx)

**Decision**: `scripts/routines-demo.ts`, run via `npx tsx scripts/routines-demo.ts`
(optionally `-- --dataset=seed|demo`), imports the detector and both fixtures,
runs with a fixed reference date, and `console.table`/prints each routine
(label · cadence · typical amount as `$` · count · confidence) plus the monthly
routine cost line. No Next.js, no Supabase, no network.

**Rationale**: satisfies FR-012/SC-004 (one command → legible output → go/no-go)
using the established `tsx` + `scripts/` pattern (`gen-vectors.ts`), staying clear
of the `web/AGENTS.md` Next.js caveat.

## D11 — Separation from the vector-locked InsightEngine

**Decision**: The detector is standalone; it does **not** import from, call, or
modify `insights.ts`, and adds **no** golden vector. It is outside the parity
harness (like scan and feature-flags).

**Rationale**: `insights.ts` Rule 5 (recurring subscriptions) is vector-locked;
touching it would require regenerating vectors and an iOS mirror — the opposite of
a fast, throwaway-able validation prototype. Convergence (promoting routines into
the vectored engine, adding a Swift mirror) is explicitly deferred (spec Out of
Scope).
