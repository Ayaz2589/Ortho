# Research: Financial Health (spec 041)

Decisions are locked in [`docs/plan/financial-health.md`](../../docs/plan/financial-health.md) §13;
this file records the *why* and the alternatives considered, grounded in the two research docs
(`docs/research/finance-habits-budgeting-apps.md`, `docs/research/market-analysis/nyc-market-language-analysis.md`)
and the current codebase.

## D1 — Calibrate to the target user, never shame

**Decision**: Score **stability and direction of travel**, not distance from a middle-class 50/30/20
ideal. Bands are calm (Strong/Steady/Building/Getting started); the score renders in the sand
`--accent` ramp only; every dimension has a **supportive floor** (e.g. Cash flow ≥ 25 even when
underwater, emergency-fund "None yet" = 15 not 0).

**Rationale**: Guilt from red dashboards is a top-5 abandonment driver; ~52% of immigrant NYC
households are rent-burdened and bottom-quintile savings rates are ~0/negative. A metric anchored to
an aspirational ideal would rate almost every target user "unhealthy" → churn. Honors Constitution I
("loss is never red") and IV ("never alarmist").

**Alternatives rejected**: (a) classic 50/30/20 scoring — mislabels the target user as failing;
(b) red/amber/green traffic light — violates the constitution and the research.

## D2 — Profile-first (works with zero history and no bank)

**Decision**: The three profile-driven dimensions (Safety net, Commitment load, Savings momentum
intention) are meaningful from the questionnaire alone; the two history-driven dimensions (Cash flow
detail, Plan engagement) fall back to supportive neutrals when data is absent and **sharpen** when it
exists. No feature is gated on a transaction count or a linked bank.

**Rationale**: Manual entry is load-bearing for the ~1-in-5 unbanked/underbanked target household;
the primary user has no history on day one. This is the feature's reason to exist for its market.

**Alternatives rejected**: history-gated scoring ("come back after 30 days") — useless on day one for
exactly the users it targets.

## D3 — Per-dimension 1–5 importance weights (personalized composite)

**Decision**: Each of the five dimensions carries a user-set 1–5 weight (default 3); the composite is
a weight-normalized average. Weights are captured in the questionnaire's final section and editable
in Settings.

**Rationale**: Respects user agency and diverse realities — a household grinding to build an
emergency fund weights Safety net high; one just covering rent weights Cash flow high. This is the
locked reading of "the slider determines the weight of that question," applied per dimension (not per
raw question, which would be noisy and hard to explain).

**Alternatives rejected**: (a) fixed weights — ignores that the target population's priorities differ
structurally; (b) per-raw-question weights — too granular, unexplainable in the widget.

## D4 — Remittances / family support as a first-class fixed-cost kind

**Decision**: `user_fixed_costs.kind` is an enumerable label with `remittance` as a suggested,
first-class option (alongside loan/phone/transit/childcare/subscription/other).

**Rationale**: 16% of foreign-born noncitizen households send remittances — a material, recurring,
identity-laden budget line with no home in Ortho's model today. The spec-030 demo household already
models a monthly remittance; this makes it a real, captured profile concept so the metric reads the
target user correctly.

**Alternatives rejected**: free-text only — loses the ability to recognize/label the line the market
is defined by.

## D5 — Engine pinned by unit/property tests, not a golden vector

**Decision**: `financialHealth.ts` is pure and deterministic (`now` injected) like `insights.ts` /
`goals.ts`, but is pinned by **node unit tests with independently-derived expected values + property
tests**, not a `shared/test-vectors/*.json` golden vector.

**Rationale**: This is the established precedent for newer pure roll-ups (`housing-summary.ts`,
`spendHeatmap.ts`, `reports/*`) per `docs/finance.md` §1/§16 — they are pinned by unit/integrity
tests to avoid `gen:vectors` wiring and the launder-a-bug risk of regenerated JSON. Constitution VI
explicitly permits "golden-vector-**style** fixtures where they fit." Independently-derived expected
values are the launder-proof tier (`finance-goldens.test.ts` precedent). Thresholds live in
`financial-health-thresholds.ts` so tests reference the same named constants the engine does.

**Alternatives rejected**: a new golden vector + `gen:vectors` entry — more wiring, and regenerating
after an unintended change would launder the bug.

## D6 — Score live, snapshot the baseline

**Decision**: Store the **raw questionnaire answers**; compute the score **live** in a `useMemo`.
Additionally write an append-only **snapshot** (`{score, band, created_at}`) on onboarding completion
and each Settings save; the widget shows first-vs-latest movement.

**Rationale**: Live scoring means new transactions/budgets/goal contributions move the score with no
re-take (FR-008). Snapshots give the progress story the research says motivates this user (FR-009)
without a full time-series in v1.

**Alternatives rejected**: (a) storing a computed score column — goes stale immediately; (b) full
snapshot-on-every-data-change time series — over-scoped for v1 (deferred, §14 of the plan doc).

## D7 — User-scoped tables (not household-scoped)

**Decision**: All four tables are keyed by `user_id` with RLS `user_id = auth.uid()` (unlike
household-scoped `cards`/`budgets`), and read in `loadAll` scoped by `ownerId`.

**Rationale**: The financial profile is a personal self-assessment (one per Ortho account), not
shared household config. A shared-household income mode is explicitly deferred.

**Alternatives rejected**: household-scoping — would conflate two people's private self-assessments
and force a shared-vs-personal question that v1 defers.

## D8 — Dedicated minimal first-run flow, gated in the shell

**Decision**: A dedicated route under `(app)` (`welcome/financial-profile`) with a slim stepper
header (no board chrome). The shell routes a profile-less, non-dismissed user into it after
bootstrap; "Skip — use neutral defaults" writes a default profile + baseline (so it never re-nags),
and a localStorage dismissal (`ortho.fhOnboardingDismissed`) suppresses the auto-prompt while leaving
the widget CTA.

**Rationale**: This is the flagship first-run and deserves a focused flow, but onboarding friction is
itself a churn driver — so it is short, skippable, and non-blocking. There is no existing onboarding
concept to reuse; gating on `userFinancialProfile === null` + a localStorage flag needs no schema
change (no new `users` column). Static export forbids dynamic routes/`useSearchParams`, so the flow
holds step state in component state, not the URL.

**Alternatives rejected**: (a) a `users.onboarded` DB column — extra migration + write path for no
gain; (b) reusing the Settings page as first-run — worse first impression for the flagship flow;
(c) a modal over the dashboard — competes with board chrome and is easy to dismiss accidentally.

## D9 — Reuse existing engines for the history-driven dimensions

**Decision**: `budgetStatusForMonth` (Plan engagement + Commitment context), `goalPacing`/
`goalProgress` (Safety net + Savings momentum), `savingsRate` (Cash flow + Savings momentum). The
health engine composes them, mirroring `planSummary.ts`.

**Rationale**: These are vector-locked, timezone-correct, integer-cent engines. Re-implementing their
math would fork behavior and violate the "reuse named money helpers" guardrail.

**Alternatives rejected**: bespoke spend/goal math inside the health engine — duplicative and
drift-prone.
