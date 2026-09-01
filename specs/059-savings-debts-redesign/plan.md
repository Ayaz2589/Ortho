# Implementation Plan: Savings & Debts — replacing the Goals section

**Branch**: `feat/059-savings-debts-redesign` | **Date**: 2026-09-01 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/059-savings-debts-redesign/spec.md`

## Summary

Replace the Goals section with a Savings & Debts experience across four surfaces, driven by one new
pure engine.

The data already distinguishes the two kinds — `Goal.kind` has been `'savings' | 'debt_payoff'` since
spec 027 — and today's UI simply ignores it. So the whole feature is derivation plus presentation:
**no migration, no new table, no new column, no new dependency.**

The engine, `web/lib/finance/goalProjection.ts`, derives cadence, on-plan classification, pace basis,
remaining payments, and a finish date from contributions alone, and returns an explicit *refusal* when
it cannot honestly project. It sits **beside** the vectored `goals.ts` rather than inside it, so
`shared/test-vectors/goals.json` stays byte-identical — the same move the spending-pace redesign made
with `spendingPace.ts` (research R1).

On top of it: a rebuilt Planning section (aggregate header, projection-first cards, collapsible
in-place ledger), a rebuilt detail page (five blocks), and the dashboard widget body plus the spec-057
detail panel brought onto the same vocabulary. Member-facing copy renames "Goals" to
"Savings & Debts" across all six languages; every code, route, table, and registry identifier keeps
the word `goal`.

## Technical Context

**Language/Version**: TypeScript 5, React 19, Next.js 15 (App Router, `output: 'export'`)

**Primary Dependencies**: Tailwind v4, `lucide-react` (icons), `recharts` (one chart only, reached via
`next/dynamic`), Supabase JS. **No new dependency.**

**Storage**: Supabase Postgres — `goals` and `goal_contributions`, both **read-only to this feature's
new code**. No migration.

**Testing**: Vitest + Testing Library; `npm test`, plus `npm run test:tz` for the timezone suite and
`npm run gen:vectors` for regression-vector drift.

**Target Platform**: Responsive web (compact 0–639 / medium 640–1023 / expanded 1024+) and the
Capacitor-wrapped iOS shell.

**Project Type**: Web application, single canonical implementation (`web/`).

**Performance Goals**: Derivations are O(contributions) per item and memoised per surface; no
perceptible cost at realistic counts (tens of contributions, single-digit items).

**Constraints**: Static export — no dynamic route segments, so the detail page stays `?id=`-addressed.
Recharts may only be reached through `next/dynamic` (guarded by `test/bundle/no-eager-recharts.test.ts`).

**Scale/Scope**: 4 surfaces, 1 new engine, 1 new chart, ~5 new components, ~35 new/renamed strings ×
5 catalogs.

## Constitution Check

*GATE: passed before Phase 0; re-checked after Phase 1 design — see below.*

| Principle | Assessment |
|---|---|
| **I. One Design System, Tokens Only** | PASS. Every value in the handoff maps to an existing token; the prototype's hexes *are* the token values. Contract P5 forbids inlining them. No new palette entry: savings vs debt is direction and wording within one hue (FR-033). |
| **II. Calm Over Dense (NON-NEGOTIABLE)** | PASS, and the feature is largely *in service of* this principle — it removes repetition (seven identical ledger rows → one cadence line) and shortens the section while adding a summary. Never red (FR-032) is stated in the contract and pinned by test. |
| **III. Right Form Factor Per Canvas** | PASS. No new navigation or layout structure; the section, page, widget, and panel all keep their existing containers and breakpoints. Contract P8 explicitly guards the horizontal-overflow class currently being fixed on a parallel branch. |
| **IV. Plainspoken Voice & Money Formatting** | PASS. Copy is second-person and plain; money is never abbreviated; tabular figures are mandated by FR-036/P6. FR-037 forbids phrasing the inferred cadence as a promise. |
| **V. Accessible & Interaction-Complete** | PASS. Contract P7: real `<button>` disclosure with `aria-expanded`, progressbar semantics retained, labelled ledger actions, ≥40/44px targets, `prefers-reduced-motion` honoured via the existing global block (research R7). |
| **VI. Test-Driven & Regression-Safe (NON-NEGOTIABLE)** | PASS. Every task in `tasks.md` is RED-first. The engine is money *and* date logic, so it gets unit + property + timezone coverage (contract test obligations 1–9). Existing vectors must not drift — an explicit gate in `quickstart.md`. |

**No violations. Complexity Tracking is therefore omitted.**

### Post-design re-check

Re-evaluated after `data-model.md` and the two contracts were written. Two design decisions were made
*because* of the gates and are recorded so they are not "simplified" away later:

1. **The refusal lives in the engine's return value** (`available: false`), not in each surface's
   rendering logic. Four surfaces cannot each be trusted to remember the three-contribution floor;
   putting it in one function is what makes SC-008 a property rather than a convention.
2. **The widget `id` stays `'goals'`** despite the rename. It is the localStorage key for per-browser
   widget enablement — changing it would silently reset every existing user's dashboard. A cosmetic
   rename must not cause a data-shaped regression (research R5, contract P9).

## Project Structure

### Documentation (this feature)

```text
specs/059-savings-debts-redesign/
├── plan.md                              # This file
├── spec.md                              # 5 user stories, 37 FRs, 10 SCs
├── research.md                          # R1–R10, all resolved
├── data-model.md                        # stored (unchanged) + derived structures
├── quickstart.md                        # automated gates + manual walk
├── checklists/requirements.md           # spec quality checklist
├── contracts/
│   ├── projection-engine.md             # the pure engine's contract + test obligations
│   └── presentation-contract.md         # P1–P11, what every surface must honour
└── tasks.md                             # created by /speckit-tasks
```

### Source Code (repository root)

```text
web/
├── lib/finance/
│   ├── goalProjection.ts                # NEW — the engine (research R1)
│   ├── goalProjection-thresholds.ts     # NEW — named cutoffs (research R3)
│   ├── goals.ts                         # UNTOUCHED — vectored; do not edit
│   └── goalSeries.ts                    # UNTOUCHED — still used by the old charts until they go
├── components/goals/
│   ├── SavingsDebtCard.tsx              # NEW — replaces GoalCard on both surfaces
│   ├── SavingsDebtsHeader.tsx           # NEW — aggregate verdict + split bar
│   ├── ContributionLedger.tsx           # NEW — the collapsible in-place list
│   ├── GoalDetail.tsx                   # REBUILT — five blocks
│   ├── detail/                          # NEW — one file per block
│   │   ├── ProjectedFinishBlock.tsx
│   │   ├── ProgressTowardTargetBlock.tsx
│   │   ├── PaceAgainstPlanBlock.tsx
│   │   └── ConsistencyBlock.tsx
│   ├── charts/GoalProgressChart.tsx     # NEW — cumulative + target + projection (dynamic)
│   ├── charts/GoalCumulativeChart.tsx   # DELETED — the flat line with nowhere to go
│   ├── charts/GoalMonthlyChart.tsx      # DELETED — the picket fence
│   └── GoalCard.tsx                     # DELETED — superseded by SavingsDebtCard
├── components/planning/GoalsSummaryCard.tsx      # REWORKED — header + cards, one expanded at a time
├── components/widgets/bodies/GoalsBody.tsx       # REWORKED — vocabulary + direction only (R6)
├── components/widgets/panels/GoalsPanel.tsx      # REWORKED — same vocabulary, projections
├── lib/widgets/registry.tsx                      # title/description only; `id` stays 'goals'
├── lib/i18n/{bn,es,ja,ko,zh}.ts                  # renamed + new keys, one spec-059 region each
└── test/
    ├── finance/goalProjection.test.ts            # NEW — unit + property
    ├── finance/goalProjection-timezone.tz.test.ts# NEW — TZ-pinned
    ├── goals/savings-debt-card.test.tsx          # NEW
    ├── goals/contribution-ledger.test.tsx        # NEW
    ├── goals/savings-debts-section.test.tsx      # NEW
    ├── goals/goal-detail-page.test.tsx           # REWORKED
    ├── widgets/goals.test.tsx                    # REWORKED
    ├── widgets/panels/goals-panel.test.tsx       # REWORKED
    └── i18n/savings-debts-i18n.test.ts           # NEW — catalog completeness
```

**Structure Decision**: The existing `web/` layout is unchanged — this feature adds to
`lib/finance/` and `components/goals/` and edits four call sites. The one structural addition is
`components/goals/detail/`, a directory for the five detail blocks: they are ~100 lines each with
distinct data needs, and the alternative is a single 600-line `GoalDetail.tsx` that no test can target
a piece of.

## Phasing

Built as an ordered sequence, each phase leaving the app green and shippable. This mirrors the
handoff's own suggested build order, with the engine hoisted first because everything else consumes it.

| Phase | Content | Why here |
|---|---|---|
| **1 · Engine** | `goalProjection.ts` + thresholds + unit/property/tz tests | Everything downstream reads it. Nothing renders yet; fully testable alone. |
| **2 · Card (US1)** | `SavingsDebtCard`, type-direction bars, ETA line; `GoalCard` deleted | The handoff's "steps 1–2 are a shippable increment". Kills the height problem and answers "when is this done?". |
| **3 · Ledger (US3)** | `ContributionLedger`, disclosure, one-open-at-a-time in the section | Makes removing the always-visible ledger safe rather than a regression. |
| **4 · Header (US2)** | `SavingsDebtsHeader`, section footer | Additive; needs phase 1's per-item derivations. |
| **5 · Detail page (US4)** | Five blocks, new chart, old charts deleted | The largest surface; reached only from a card that is already complete. |
| **6 · Dashboard (US5)** | Widget body + panel vocabulary, registry title | Last by design — the only phase whose absence leaves no functional gap. |
| **7 · Rename + docs** | i18n across 5 catalogs, `docs/web.md`, `CLAUDE.md` | Copy sweep once, when every string it must cover exists. |

## Key risks and how the plan answers them

| Risk | Answer |
|---|---|
| Editing `goals.ts` drifts the golden vectors | New sibling module; `gen:vectors` diff is a hard gate in `quickstart.md` (R1) |
| Renaming the widget resets users' dashboards | `id` stays `'goals'`; pinned by test (R5, P9) |
| A surface invents a finish date the engine refused | The refusal is a returned value, and P4 forbids local fallbacks |
| Four surfaces disagree about the same item | All four call one function with an injected `now`; C7/SC-006 |
| Finish month flips west of UTC | Local-calendar getters only; a dedicated `.tz.test.ts` (C3, R10) |
| The new panel rows reintroduce horizontal overflow | P8 encodes the `min-w-0`/`shrink-0` rule the parallel 058 branch catalogues |
| The prototype's SVG path gets copied verbatim | R4 and the handoff's Fidelity note: build from data, transcribe nothing |

## Out of scope (recorded so it isn't drifted into)

- Person-scoping goals — a live open question owned by the spec-056 follow-up (R9).
- The "runway" view — explored and parked in the handoff until roughly six items.
- Items with no target amount or a target-date-only model — undrawn and unconfirmed.
- Paused/archived/shared items — no such state exists.
- Changing `goalPacing`'s off-track insight, which still ships on the dashboard from the old model.
