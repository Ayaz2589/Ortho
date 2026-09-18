# Findings — "Financial Routine" feature exploration

- **Status:** Exploration / decision record (no code yet)
- **Date:** 2026-07-03
- **Scope:** Should Ortho attach optional time + location to transactions and mine that
  data to detect a user's *financial routine*? What would make it effective, and how
  should it be sequenced?

---

## TL;DR

The **routine** idea is strong and fits Ortho's calm, money-first brand. The
recommendation is to **decouple "routine" from "location"**:

1. **Detect routines from the transaction stream first** — `merchant/category + cadence
   + time-bucket`. This works for *every* transaction (including bank imports) and needs
   **no permission**.
2. **Layer location on top as an optional, additive booster** — passive visit/dwell
   detection to spot a routine *before* or *without* a logged transaction, gated behind a
   high-precision prompt and a location permission the app earns later.
3. **Prefer merchant-name geocoding over device GPS** as the default location source —
   free, retroactive, privacy-light — and keep device GPS as a rare, explicit "capture
   where I am now" affordance.

Location is genuine **upside**, not a dependency. If you lead with location, the feature's
reach is capped by permission adoption and trust cost; if you lead with transactions,
location becomes pure enrichment.

---

## The idea (as proposed)

> Each transaction gets an optional **time** and **location**. People spend by routine —
> coffee on a break, subway in the morning. If we observe a user is at a specific place at
> a specific time almost every day, there's a high probability they're purchasing something
> (e.g., near Dunkin' every morning at 9 → likely buying breakfast). If the trend holds, we
> prompt the user to enable a **"Routine"** feature. Location is completely optional and
> purely additive — if it's off, we simply can't infer this, and the rest of the app is
> unaffected.

This is a **passive presence/dwell** design (observe recurring visits), not an
"attach GPS at the moment of data entry" design — an important distinction that resolves
the biggest failure mode (see below).

---

## What the app stores today (grounding)

Verified against the current codebase:

- **`Transaction`** (`iOS/Ortho-iOS/Models/Transaction.swift`, mirrored on web) stores
  `merchant`, `category`, `kind`, `amount` (USD cents), `date`, owners/shares, `source`,
  `paidBy`, `householdID`. **No location field. No dedicated time-of-day field.**
- **`Transaction.date` is a single `Date`, conventionally pinned to noon-UTC for imported
  rows** (see `PARITY.md` → "Date storage & timezone"). So a *true* time-of-day exists only
  for sources that carry it — receipts with a printed time and real-time manual entry.
  **Bank/statement imports have no hour.**
- **A vector-locked `InsightEngine` already exists** (`iOS/Ortho-iOS/Services/InsightEngine.swift`
  ↔ `web/lib/finance/insights.ts`, with parity tests). Routines would naturally slot in here
  as a new insight type — but the engine is under the golden-vector harness, which is a
  design constraint (see "Codebase fit").

---

## Analysis

### Why location is not strictly *needed*

- **The merchant name already geocodes to a place.** "Blue Bottle Coffee" → a lat/lng, with
  no permission prompt, no battery cost, and it works retroactively on historical *and*
  imported rows. For *routine* detection you mostly care "which place recurs," and the name
  already encodes that.
- **`merchant + amount + cadence` already *is* the routine.** "MTA, $2.90, weekday mornings"
  or "Whole Foods, ~$80, weekly" is a routine with zero coordinates attached. Device location
  mostly re-derives what you already have; it sharpens the edges (disambiguating chains,
  catching "spent in a new city"), but it is not the engine.

### The trap that kills the *naive* version: "logged ≠ spent"

If location is captured at the moment of **data entry**, it captures the wrong moment:

- **Bank/statement import** (highest-volume path) happens in a batch, at a desk, days after
  the spend → location = home. Also the bank feed carries **no** coordinates at all.
- **Manual entry** happens in evening bursts ("catch up on today") → location = the couch.
- **Real-time "I'm at the register" entry** is the *rare* case — the only one where
  entry-time device location is truthful.

So entry-time GPS would attach **confidently wrong** coordinates to most rows. The proposed
**passive dwell design avoids this** by capturing presence at the true place/time,
independent of when the transaction is logged. ✅ This is the key strength of the proposal.

### Where the passive-dwell version is still bounded

1. **Dwell ≠ purchase (correlation gap).** The most common reason someone is at the same
   place, same time, daily is that it's **on their commute** — Dunkin' next to the subway
   entrance or in the office lobby. They pass or wait near it without buying. GPS resolution
   (~10–50 m, worse in urban canyons) often can't tell Dunkin' from the store next door.
   - **Mitigation (already in the proposal):** don't assert a purchase — *ask*. A false
     positive costs one dismissed notification, not a wrong ledger entry. The ceiling is set
     by how ruthlessly low-confidence prompts are suppressed (e.g., only after N consecutive
     weekday dwells of real duration). A finance app that pings too often gets muted.

2. **"Always Allow" location on a *finance* app is the real gate — a trust cost, not just an
   adoption stat.** Background visit detection needs the **"Always"** permission (the
   scariest iOS offers; iOS actively nudges users to revoke it). "Why does my budgeting app
   want to watch my location all day?" erodes trust, and *trust is the product* for a money
   app. Implication: don't ask on day one — ask *after* the app has earned trust, with a
   crystal-clear "here's exactly why, it's optional, it stays on your device" rationale.

3. **Base rates are narrower than the example.** "Same place, same time, every day" is clean
   for **rigid commuters**. Hybrid/remote/variable-schedule users (a growing majority) have
   noisier mornings, so the detectable-pattern population is a subset.

4. **To be *financially* valuable, a dwell must eventually meet a transaction.** "You're at
   Dunkin' every morning" is a lifestyle signal until it's tied to spend — either the user
   confirms and we pre-fill, or we **match the dwell against the bank charge that posts 1–3
   days later** ("Dunkin' $4.50"). That matching (timing skew + merchant-name normalization,
   `DD/BR #3401` ≠ `Dunkin'`) is a real but solvable reconciliation problem — and it's where
   the magic would live (auto-located, auto-categorized transactions).

### Privacy

Continuous background presence tracking is a far larger privacy commitment than geocoding a
merchant name, and Ortho is a **shared household** app — so per-person isolation matters
(whose location, and can the household see it?). Requirements: **opt-in, coarse
(rounded / geohash), on-device-leaning processing, RLS-guarded per person.** Done carelessly
this is a trust-killer; done well it's a differentiator.

---

## Feasibility (Apple primitives)

The mechanism is well-trodden; Apple provides purpose-built, low-power APIs:

- **`CLLocationManager.startMonitoringVisits()` → `CLVisit`** (arrival/departure time,
  coordinate, accuracy) — the canonical "where does the user dwell" API. Runs on
  significant-location-change + cell/wifi, not continuous GPS, so battery cost is modest.
  Requires **"Always"** authorization for background delivery.
- **Region monitoring / geofences** (`CLCircularRegion`, up to 20 at a time) — enter/exit
  events for specific known places.
- **`CLGeocoder`** (iOS) / **Apple Maps Server API** (web, needs an Apple Developer key +
  signed JWT) — for geocoding merchant names. No device permission needed.

Native iOS location/maps need **no API key** and work on-device; web/server geocoding needs
Apple Developer credentials and firewall allowlisting for outbound calls.

---

## Recommendation

**Yes — build it, but as an *optional convenience/nudge layer* on top of a non-location
baseline, not as a location-first detector.**

Concrete sequencing:

1. **Transaction-based routine detection first (no permission, everyone).**
   - Group by `(merchant/category, weekday, hour-bucket)`; surface a "routine" when support
     ≥ N over the last M weeks. Fall back to weekday-only patterns when the hour is unknown.
   - Start as **frequency stats / SQL, not ML.** ML/clustering is a later optimization.
   - Ship it as a **new, non-vectored insight** (like scan and feature-flags sit *outside*
     the golden-vector harness) so it can iterate fast; promote it into the vectored
     `InsightEngine` only once the math stabilizes.

2. **Add the optional location booster.**
   - Default location source = **merchant-name geocoding** (free, retroactive, privacy-light).
   - Passive **`CLVisit`** dwell detection as the opt-in upgrade that spots a routine
     *before/without* a logged transaction and catches routines the user forgets to log.
   - **High-precision prompting** only (N consecutive weekday dwells of real duration).
   - Earn the **"Always"** permission *after* demonstrated value, with a plain-language
     rationale and on-device processing.
   - Optional stretch: **dwell ↔ bank-charge matching** for auto-location/auto-categorization.

3. **Schema (additive, safe) — when ready.**
   - Optional `occurred_at timestamptz` (a *true* timestamp, distinct from the calendar
     `date`) + optional coarse `location` (lat/lng + label, or a geohash) on transactions.
   - iOS `Transaction` model + web mirror + Supabase migration + RLS. Nulls by default,
     fully backward-compatible.

### Downstream functionality routines unlock

- **Off-routine / anomaly catch** — "a charge at a time/place you never spend" (fraud +
  reinforces the scan pipeline's duplicate detection).
- **Cash-flow forecast** — routine spend is predictable → project the month's routine burn
  and warn before a shortfall. *(Likely the highest-value payoff.)*
- **"Routine cost" insight** — "your weekday coffee + subway routine ≈ $220/mo" — a calm,
  concrete insight that fits the existing `InsightEngine` surface.
- **Realistic budgets** — tied to observed routines instead of arbitrary numbers.
- **Recurring/subscription detection** — high value, needs *zero* location.
- **Per-person household routines** — who has which recurring spend.

### The one thing to validate first

Does `merchant + cadence` **alone** already surface routines that feel insightful (run a v1
detector over the sample dataset)? If yes — and the bet is yes — location becomes a
"nice sharpening" rather than a dependency, and the whole feature de-risks.

---

## Open questions

- Do we lead with **recurring/subscription detection** (location-free, immediately useful)
  as the first slice of "routines," and treat behavioral routines as phase 2?
- For households, is a routine **private to the person** by default, or visible to the
  household? (Leaning private.)
- How coarse can stored location be while still useful — merchant-level label, rounded
  coordinate, or geohash precision N?
- Is the near-term payoff **anomaly detection** or **cash-flow forecasting**? They imply
  different first UI surfaces.
