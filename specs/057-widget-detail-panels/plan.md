# Implementation Plan: Widget Detail Panels — base branch

**Branch**: `feat/057-widget-detail-panels` | **Date**: 2026-08-22 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/057-widget-detail-panels/spec.md`

**Slice**: This plan covers the **base branch only** — US1, US2, US3, US10, plus the two
collision-proofing measures the base owes its follow-ups. **US4–US9 are explicitly out of
scope** and are each planned in their own sandbox on top of this base once it merges to main.

## Summary

Replace spec 037's `"Details coming soon."` placeholder with a real detail panel per data
widget. The base branch builds the shared frame, proves it with three panels of deliberately
different shapes, extracts a primitives kit from them, and leaves the six remaining panels
buildable in parallel without collisions.

The technical approach is almost entirely **assembly of things that already exist**. The drawer
already has a full-screen mobile mode; the scope providers already wrap the board; the period
label is already computed; the amortization schedule and the rollover ledger are already
computed and then discarded. The genuinely new code is one context-free frame component, one
optional registry field, three panel bodies, and one behaviour-preserving extraction in the
budget engine.

Two of the four workstreams exist purely to serve the six follow-ups: pre-carved i18n regions,
and an append-only kit rule. Neither is visible to a user; both are what make the fan-out safe.

## Technical Context

**Language/Version**: TypeScript 5.x, React 19, Next.js 16 (App Router)

**Primary Dependencies**: None new (FR-024). Reuses `components/web/Drawer`, the two dashboard
scope contexts, and existing pure engines in `lib/finance/`.

**Storage**: N/A — no schema change, no migration. Every figure derives from data already loaded
for the dashboard (FR-017).

**Testing**: Vitest + Testing Library (jsdom), matching `web/test/widgets/`. Behaviour and
accessible DOM only, never internals (Constitution VI).

**Target Platform**: Responsive web (compact / medium / expanded) and the Capacitor-wrapped iOS
shell. The expanded breakpoint is `≥1024px` via `useIsExpanded()`.

**Project Type**: Web application, single canonical codebase under `web/`.

**Performance Goals**: Panels open with no loading state (SC-004) — all computation is local and
synchronous. Derived series memoized per panel; nothing recomputes on unrelated re-renders.

**Constraints**: Never red (Constitution I). Safe-area insets respected in the full-screen
presentation (Constitution III, FR-010). No widget card's output may change (FR-025). Content
scrolls, never clips (FR-004).

**Scale/Scope**: 3 panels on this branch of 9 total. ~1 new frame component, 1 registry field,
3 panel components, 1 engine extraction, 5 catalog regions, and the test suites for each.

## Constitution Check

*GATE: evaluated before Phase 0 and re-checked after Phase 1 design.*

| Principle | Assessment | Status |
|---|---|---|
| **I. One Design System, Tokens Only** | Panels use existing tokens only; FR-021 forbids new colours. Overspend, shortfall and behind-pace stay sand/graphite — never red. The kit extracted in D10 is composition, not new palette. | ✅ PASS |
| **II. Calm Over Dense** | The panel exists *because* the card must stay calm — detail moves off the tile instead of being crammed onto it. Shadow is legitimate here: a drawer is genuinely floating chrome, which is the exception the principle names. Risk to watch: a dense amortization table is the one place "room to breathe" could be lost. | ✅ PASS (watch US2) |
| **III. Right Form Factor Per Canvas** | The core of the feature: right drawer on expanded, full-screen below. FR-010 pulls safe-area handling in explicitly rather than assuming it (D4 found `Drawer` does not provide it). | ✅ PASS |
| **IV. Plainspoken Voice & Money Formatting** | All money through `formatMoney`; tabular figures; no abbreviation. FR-022 requires projections be worded as projections. Empty states are calm and never alarmist (FR-020). | ✅ PASS |
| **V. Accessible & Interaction-Complete** | `Drawer` already provides focus trap, Escape and dialog semantics. The frame adds a real `<button>` for back (D6), keeps the heading a real heading, and keeps hit targets ≥44px on touch. | ✅ PASS |
| **VI. Test-Driven & Regression-Safe** | Fully TDD. The engine extraction (D8) is behaviour-preserving and pinned by existing tests. No new money math ⇒ no new golden vector. D11 verified the pre-existing suites pass unmodified. | ✅ PASS |

**No violations. Complexity Tracking is therefore omitted.**

One judgement call worth recording rather than hiding: D6 ships second-level navigation in the
base although only US2 uses it here. That is a small amount of capability ahead of demand,
accepted because two known follow-ups (US6, US7) need it and retrofitting a back affordance
across six merged panels is materially harder. US2 exercising it keeps it from being untested
API — which is the condition that makes it acceptable rather than speculative.

## Project Structure

### Documentation (this feature)

```text
specs/057-widget-detail-panels/
├── spec.md              # Feature specification (all 10 stories)
├── plan.md              # This file — base branch slice only
├── research.md          # Phase 0 — D1..D12, all verified against code
├── data-model.md        # Phase 1 — derived shapes; no persisted entities
├── quickstart.md        # Phase 1 — validation guide
├── contracts/
│   ├── panel-contract.md      # The frame ↔ panel contract (READ THIS FIRST in a sandbox)
│   └── follow-up-brief.md     # What each of the six sandboxes inherits and owes
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 — created by /speckit-tasks, not by this command
```

### Source Code (repository root)

```text
web/
├── lib/
│   ├── widgets/
│   │   └── registry.tsx                    # MODIFIED — + Panel?: ComponentType (D1)
│   └── finance/
│       └── budgets.ts                      # MODIFIED — extract budgetLedgerForMonth (D8)
├── components/
│   └── widgets/
│       ├── WidgetBoard.tsx                 # MODIFIED — render Panel, fullBleedOnMobile (D2/D3)
│       ├── WidgetPanel.tsx                 # NEW — the shared frame (D4..D7)
│       ├── panels/                         # NEW — one file per panel; a sandbox's own territory
│       │   ├── HomeEquityPanel.tsx         # NEW — US2
│       │   ├── BudgetsPanel.tsx            # NEW — US3
│       │   └── ActivityPanel.tsx           # NEW — US10
│       └── panels/kit/                     # NEW — extracted after US2+US3 (D10), append-only
└── test/
    └── widgets/
        ├── widget-panel-frame.test.tsx     # NEW — US1
        ├── panels/home-equity-panel.test.tsx   # NEW — US2
        ├── panels/budgets-panel.test.tsx       # NEW — US3
        └── panels/activity-panel.test.tsx      # NEW — US10

web/lib/i18n/{bn,es,ja,ko,zh}.ts            # MODIFIED — pre-carved spec-057 regions (D9)
docs/web.md                                 # MODIFIED — panel layer in the dashboard section
CLAUDE.md                                   # MODIFIED — active-feature block
```

**Structure Decision**: Panels live in their own `components/widgets/panels/` directory rather
than beside the bodies in `components/widgets/bodies/`. This is deliberate and serves the
fan-out: a follow-up sandbox creates exactly one file in `panels/`, one test file in
`test/widgets/panels/`, one registry line, and its own pre-carved catalog sub-block — four
touch points, only one of which is shared, and that one is a single line. Mixing panels into
`bodies/` would blur which files a sandbox owns.

## Phase 0 — Research

Complete. See [research.md](./research.md) — D1 through D12, each verified against the code
rather than inferred. The three findings that most shaped this plan:

- **D8**: `budgetStatusForMonth` already computes the entire rollover ledger and keeps only its
  last entry. US3's carry history is computed on every render today and thrown away.
- **D11**: the one test asserting the placeholder opens `financial-health` — the very widget
  this feature excludes — so it passes unmodified and SC-007 holds literally.
- **D4**: `Drawer`'s full-screen mode does **not** apply safe-area insets, and the app shell's
  padding does not reach a portaled fixed-inset element. FR-010 is real work, not a formality.

## Phase 1 — Design & Contracts

Complete. Artifacts:

- **[data-model.md](./data-model.md)** — derived shapes only. This feature persists nothing;
  the document exists to pin what each panel derives and from which engine.
- **[contracts/panel-contract.md](./contracts/panel-contract.md)** — the frame ↔ panel contract:
  what a panel may assume, what it must provide, and what it must never do. This is the document
  a follow-up sandbox reads first.
- **[contracts/follow-up-brief.md](./contracts/follow-up-brief.md)** — per-sandbox brief for
  US4–US9: inherited assets, owned files, the reserved catalog region, and the append-only rule.
- **[quickstart.md](./quickstart.md)** — validation guide, including the manual checks that
  cannot be automated here (real iOS safe areas, a genuine multi-person household).

## Build Order

Sequencing matters on this branch because D10's extraction depends on two panels existing first.

1. **US1 — the frame.** `Panel?` field, `WidgetPanel`, `fullBleedOnMobile`, safe areas, scope
   caption, scroll region, second-level stack, placeholder fallback. Nothing user-visible
   changes until a panel is registered, which makes this step independently verifiable.
2. **US2 — home equity.** First real panel; exercises the second level (D6) and the table shape.
3. **US3 — budgets.** Second real panel; requires D8's extraction first. Repeated-section shape.
4. **Extract the kit (D10).** Only now, from two built panels. Append-only from here on.
5. **US10 — activity.** Third panel, built *on* the extracted kit — which is what tests whether
   the extraction actually generalises before six sandboxes depend on it.
6. **Pre-carve the catalogs (D9)** for all nine panels, including the six not built here.
7. **Docs**: `docs/web.md`, `CLAUDE.md`, and the follow-up brief finalised against what shipped.

Step 5 is placed after step 4 on purpose. Building the third panel on the kit rather than
alongside it is the cheapest possible test of the extraction, and it happens while the cost of
being wrong is still one branch rather than six.

## Risks

| Risk | Mitigation |
|---|---|
| The kit extracted from two panels doesn't generalise. | US10 is built *on* it before the fan-out (step 5). The append-only rule (D10) contains the damage if it still falls short. |
| Six sandboxes collide in the i18n catalogs. | Pre-carved per-panel regions (D9) — the specific reason that work is on this branch. |
| The D8 extraction quietly changes budget numbers. | Strictly behaviour-preserving; `budgetStatusForMonth`'s existing tests must pass unmodified, and no golden vector may drift. |
| A dense amortization table breaks Constitution II. | Flagged in the Constitution Check; validate visually in quickstart before merge. |
| Safe areas can't be verified in this environment. | Explicitly a manual quickstart step on real hardware, reported as unrun rather than assumed (the discipline spec 056's T025 established). |
| Second-level navigation ships ahead of most of its demand. | US2 exercises it on this branch; it is not merged untested. |

## Out of Scope for This Plan

US4 (spending pace), US5 (savings trends), US6 (top merchants), US7 (who owes whom), US8
(housing costs) and US9 (goals) — six independent follow-ups, each planned and built in its own
sandbox on top of this base after it merges to main. See
[contracts/follow-up-brief.md](./contracts/follow-up-brief.md).

Also out of scope, per the spec: the financial-health panel, panels for the four
navigation-shortcut widgets, deep-linkable panel URLs, any write action from within a panel
(including settle-up prefill), and the pre-existing safe-area gap in `AnnouncementHost` /
`CsvImportFlow` noted in D4.
