# Feature Specification: Multi-currency accounting strategy (a decision)

**Feature Branch**: `feat/multi-currency-strategy`

**Created**: 2026-07-18

**Status**: Draft — decision, not implementation

**Input**: User description: "Decide whether Ortho stays USD-accounting-with-display-conversion or moves to a native-currency ledger for international households. Today every amount is stored as integer USD cents converted at the rate-at-entry and re-displayed at the current FX rate, so for a non-USD household historical totals shift as FX moves. This is about the accounting model, not the FX feed (a live rate source already exists). Deliver a written recommendation plus a RED reproduction test that proves the instability. Research-gated on whether an international audience is in scope. Lay out the two honest options — (a) scope launch to US/USD and defer, or (b) a native-currency ledger — with the concrete cost of (b), and recommend one. Do not ship the silent in-between."

---

> **What kind of feature this is.** This is a **decision spec**. Its deliverable is a
> written recommendation and the evidence that grounds it — **not** a schema, a
> migration, or a shipped behavior change. Where a normal spec's "system MUST"
> requirements describe runtime behavior, most of the requirements here describe the
> **decision artifact** (what the recommendation must contain and prove) plus one
> concrete code artifact: a failing regression test that demonstrates the problem.
> The large implementation (option b) is deliberately out of scope; this spec exists
> so that work is *not* started blind.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — A non-USD household's history stays stable (Priority: P1)

Amara runs her household in Canadian dollars. In March she records a grocery run of
**CA$100.00**. She reviews her budget every month. In July — after the CAD/USD rate has
moved — she opens March again.

**Why this priority**: This is the whole point of the decision. If March's CA$100.00 does
not still read CA$100.00 in July, the app is silently rewriting the user's own financial
history. For a money app, a number that changes underneath the user is a trust-ending bug,
not a rounding nicety. Everything else in this spec exists to characterize, cost, and
resolve this one scenario.

**Independent Test**: Encode "record a native-currency amount at one FX rate, then re-read
it at a different FX rate" as a regression test and assert the displayed native amount is
unchanged. Against today's model the assertion **fails** (the number drifts); that failing
test is the primary evidence artifact this feature ships.

**Acceptance Scenarios**:

1. **Given** a household whose display currency is CAD, **When** a CA$100.00 expense is
   recorded at rate 1 USD = 1.35 CAD and later viewed at rate 1 USD = 1.40 CAD, **Then**
   the expense still reads **CA$100.00** — the historical figure is stable in the user's
   own currency. *(This is the target behavior. Today it reads ≈CA$103.70. The reproduction
   test asserts the target and is therefore RED against the current model.)*
2. **Given** the same household, **When** March's category totals are summed at the July
   rate, **Then** each category total equals the sum it showed in March. *(Also RED today.)*

---

### User Story 2 — The team can decide without re-deriving the problem (Priority: P1)

A decision-maker (product owner / lead) needs to choose the accounting model. They should
be able to read one document and come away knowing: exactly how money flows today, exactly
why non-USD history drifts, the two honest options, the concrete cost of the expensive one,
what question gates the choice, and a recommendation they can act on.

**Why this priority**: The user asked for a recommendation, and the choice "gates a chunk of
the money layer" — it must be made *before* the rest of the money layer is hardened, because
the answer changes what "correct" means for every stored amount. A decision that can't be
made from the artifact isn't a deliverable.

**Independent Test**: Hand the recommendation doc to someone unfamiliar with the money layer;
they can state today's model, the drift mechanism, both options, option (b)'s cost surface,
the gating question, and the recommendation — without reading the source.

**Acceptance Scenarios**:

1. **Given** the recommendation doc, **When** a reader finishes it, **Then** they can name
   the storage unit today, the two conversion points, and why they disagree over time.
2. **Given** the doc, **When** a reader looks for the decision, **Then** exactly one option
   is recommended, the "silent in-between" is explicitly ruled out, and the recommendation
   is labeled as gated on a stated research question.

---

### Edge Cases

- **USD households are unaffected.** At rate = 1.0 the two conversion points agree, so the
  drift is exactly zero for USD. The recommendation must say so — this is *why* option (a)
  (scope launch to US/USD) is viable, not a bug that needs fixing for the launch audience.
- **Zero-fraction currencies (JPY).** Storing USD cents for a yen amount already loses the
  native integer-yen precision on the round trip, independent of rate movement. The doc notes
  this as a second, rate-independent defect of the current model.
- **The rate feed is not the problem.** A live source (floatrates.com) already exists and is
  cached. Swapping feeds, adding rate history, or pinning a rate-at-entry does **not** by
  itself make history stable unless the *native amount* is what's stored. The doc must not let
  "just store the rate too" masquerade as the fix (that is the silent in-between — see below).
- **The silent in-between.** Storing USD cents *plus* a rate-at-entry, and reconstructing the
  native figure from them, is stable **only** to the precision of the USD-cent snapshot — it
  re-rounds through USD and cannot round-trip JPY or sub-cent native amounts losslessly. The
  doc must name this and reject shipping it as if it were a true multi-currency ledger.

## Requirements *(mandatory)*

### Functional Requirements — the reproduction test (code artifact)

- **FR-001**: The feature MUST ship an automated regression test, runnable in the existing web
  Vitest suite on Linux, that reproduces the historical-total instability using only the
  current money layer (`toUSDCents` / `toDisplayAmount` / `formatMoney`).
- **FR-002**: The test MUST assert the **target** invariant (a native amount recorded at one
  rate re-reads as the same native amount at a different rate) so that it is **RED against the
  current model** — a demonstrated failure, not a passing description of the bug.
- **FR-003**: The test MUST be quarantined so it does not break CI: it demonstrates a known,
  accepted-for-now defect, so it MUST be skipped/marked (e.g. `test.fails` or `it.skip` with a
  pointer to this spec) rather than left red in the suite. Its body MUST still contain the
  concrete numbers (rates, amounts, resulting drift) so it reads as executable evidence.
- **FR-004**: The test MUST cover at least: (i) a single non-USD amount drifting across a rate
  change, and (ii) the USD control case showing **zero** drift at rate = 1.0.

### Functional Requirements — the recommendation (decision artifact)

- **FR-005**: The recommendation MUST describe how money is stored and converted **today**:
  integer USD cents as the storage unit, conversion to USD at entry (`toUSDCents`, at the
  entry-time rate), and conversion back for display at the **current** rate
  (`toDisplayAmount` / `formatMoney`) — and identify these two points as the source of drift.
- **FR-006**: The recommendation MUST demonstrate the core problem with a concrete worked
  example (specific amount, two rates, resulting drift) consistent with the reproduction test.
- **FR-007**: The recommendation MUST lay out exactly two honest options: **(a)** scope launch
  to US / USD and defer multi-currency, and **(b)** a native-currency ledger storing native
  amounts so historical figures are stable in the user's own currency.
- **FR-008**: For option (b) the recommendation MUST enumerate the concrete cost surface:
  schema change, data migration, every read and write path that touches an amount, and the
  regression-vector harness (`shared/test-vectors/`, `gen-vectors.ts`).
- **FR-009**: The recommendation MUST explicitly rule out the "silent in-between" (shipping a
  USD-cent ledger that *looks* multi-currency without storing native amounts) and say why.
- **FR-010**: The recommendation MUST state the research gate — *is an international
  (non-USD) audience in scope for launch?* — and make the recommendation conditional on it.
- **FR-011**: The recommendation MUST scope the decision correctly: it is about the
  **accounting model**, not the FX feed (which already exists), and must say so.
- **FR-012**: The recommendation MUST end with a single recommended option and a one-line
  rationale a decision-maker can act on.

### Non-Goals (explicitly out of scope)

- **NG-001**: No schema change, migration, or new column is created or applied.
- **NG-002**: No read/write path is altered; `money.ts`/`currency.ts` behavior is unchanged.
- **NG-003**: No new regression vectors are generated; existing vectors stay byte-identical.
- **NG-004**: No FX-feed work (the feed is not the problem).
- **NG-005**: The RED test does not run green in CI (it documents a deferred defect).

### Key Entities

- **Stored amount (today)**: an integer count of **USD cents**. Carries no native-currency
  identity; the native figure the user typed is discarded after conversion at entry.
- **FX rate**: `1 USD = N units of currency`; live from floatrates.com, cached, with a
  hardcoded fallback table. Applied at entry (to store) and again at display (to render).
- **Display currency**: a per-user setting (`CurrencyKey`, one of 7). Chooses which rate is
  applied at render; does not change what is stored.
- **Native amount (option b, hypothetical)**: what a native-currency ledger *would* store —
  the amount and its currency as entered — so display is a format, not a reconversion.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A reader unfamiliar with the money layer can, after reading the recommendation,
  correctly state (a) the storage unit today, (b) the two conversion points, and (c) why
  non-USD history drifts — with no access to the source.
- **SC-002**: The reproduction test, when temporarily un-skipped, **fails** on the current
  code with a non-zero drift for the non-USD case, and **passes** the zero-drift USD control —
  proving the demonstration is real, not tautological.
- **SC-003**: The full existing web suite (`npm test`) and `tsc --noEmit` stay green with the
  new test in place (it is skipped/marked, not breaking CI).
- **SC-004**: The recommendation names exactly one option, explicitly rejects the silent
  in-between, and states the research gate — verifiable by inspection against FR-007..FR-012.
- **SC-005**: No production behavior changes: `git diff` touches only the spec/docs and the new
  test file (plus this spec's own artifacts); `shared/test-vectors/` is unchanged.

## Assumptions

- The launch audience is **assumed US/USD-first** unless the research gate (FR-010) is
  answered otherwise; the recommendation is written to be re-openable if that changes.
- A live FX source already exists and is adequate; rate accuracy/history is not in question.
- "Historical stability in the user's own currency" is the correct user expectation for a
  budgeting app (a recorded past amount should not move).
- The seven-currency set and the USD-cents invariant are the current, real state of the code
  (verified in `web/lib/finance/money.ts`, `currency.ts`, `store.tsx`).
- Deferring option (b) is acceptable *if and only if* launch is USD-only; shipping a non-USD
  audience on today's model is not one of the two honest options.
