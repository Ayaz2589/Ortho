# Tasks: Savings & Debts — replacing the Goals section

**Feature**: `specs/059-savings-debts-redesign` | **Branch**: `feat/059-savings-debts-redesign`

**Input**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests are MANDATORY here**, not optional: Constitution VI is NON-NEGOTIABLE, and this feature is
money *and* date logic. Every implementation task is preceded by a test task written and **watched
failing** first.

**Path convention**: all paths are relative to the repo root. The app lives in `web/`.

---

## Phase 1 · Setup

- [X] T001 Read `contracts/presentation-contract.md` end to end and keep it open — P1–P11 are the review criteria for every UI task in this file
- [X] T002 Record the pre-change baseline so drift is detectable: run `cd web && npm test 2>&1 | tail -5` and `npm run gen:vectors && git diff --stat ../shared/test-vectors`, and note the test count in the commit message of the first commit
- [X] T003 [P] Verify the regression lock is in place before touching anything: confirm `git status --short web/lib/finance/goals.ts shared/test-vectors/` is empty and stays empty for the whole feature (research R1)

**Checkpoint**: baseline captured; the vectored engine is known-untouched.

---

## Phase 2 · Foundational — the projection engine (BLOCKS every user story)

⚠️ **No user story can start until this phase is complete.** All four surfaces read this one module,
and the "refusal" contract (C4) is what makes SC-008 provable rather than conventional.

- [X] T004 Create `web/lib/finance/goalProjection-thresholds.ts` exporting `GOAL_PROJECTION_THRESHOLDS` with `onPlanTolerance: 0.02`, `minContributionsToProject: 3`, `recentAverageWindow: 3`, `increaseSteps: [0.25, 0.67]`, each with a comment naming why it is that value (research R3)
- [X] T005 **RED** Write `web/test/finance/goalProjection.test.ts` covering test obligations 1–7 of `contracts/projection-engine.md`: cadence modal selection and both tie-breaks, `null` cadence at zero contributions, contiguous pace months with gaps filled, all four `PaceStatus` values including the exact ±2% boundary, the three `unavailableReason` guards each asserting every date field is `null`, the `cadence`→`recent_average` basis switch, `22.17 ⇒ 23` payment rounding, and what-if row generation for both the on-plan and off-plan shapes. **Run it and watch it fail.**
- [X] T006 **GREEN** Create `web/lib/finance/goalProjection.ts` implementing `goalCadence`, `goalPaceMonths`, `goalProjection`, `whatIfScenarios`, and `savingsDebtsSummary` per `contracts/projection-engine.md`. Pure, integer cents, injected `now`, local-calendar getters only (C1–C3). T005 goes green.
- [X] T007 **RED→GREEN** [P] Add the property test (obligation 8) to `web/test/finance/goalProjection.test.ts`: over generated contribution sets, `paymentsToGo × pacePerMonthCents >= goalProgress(...).remaining_cents` — the two engines may differ in model but must never contradict each other on whether money is still owed (C6)
- [X] T008 **RED→GREEN** [P] Create `web/test/finance/goalProjection-timezone.tz.test.ts` asserting identical month keys and finish months under `TZ=America/New_York`, mirroring the existing `goal-series-timezone.tz.test.ts`. Verify with `npm run test:tz` (C3, research R10)
- [X] T009 **GATE** Run `cd web && npm run gen:vectors && git diff --exit-code ../shared/test-vectors`. It MUST report no diff. A diff means `goals.ts` was edited — revert and re-add the behaviour in `goalProjection.ts` (research R1)

**Checkpoint**: the engine is complete and pinned. Nothing renders yet, and that is correct.

---

## Phase 3 · User Story 1 — A card that answers "when is this done?" (P1) 🎯 MVP

**Goal**: Each savings target and debt renders as a compact, fixed-height card whose headline, bar
direction, verbs, and closing line are correct for its kind.

**Independent test**: Render the Planning section for a household with one steadily-paid debt and one
savings target; confirm each card states a projected finish month, a payment/deposit count, a
type-appropriate headline, and a one-line cadence — with no contribution rows visible.

- [X] T010 **RED** [US1] Create `web/test/goals/savings-debt-card.test.tsx` asserting, for a debt: headline `{amount} left`, sub-line `Debt · {amount}/mo since {month}`, `{n}% paid`, closing `Clear by {month} — {n} more payments`; and for savings: `{amount} saved`, `Savings · …`, `{n}% funded`, `Funded by {month} — {n} more deposits` (FR-012, P1). **Watch it fail.**
- [X] T011 **RED** [US1] Extend that file: a card with fewer than 3 contributions renders the not-enough-history line and **no** month or payment count anywhere (FR-006, P4); and a card renders no contribution rows when collapsed (FR-014)
- [X] T012 **RED** [US1] Extend that file with the fixed-height proof: the same item rendered with 3 and with 30 contributions produces the same collapsed structure (SC-002, P3)
- [X] T013 **GREEN** [US1] Create `web/components/goals/SavingsDebtCard.tsx` — icon (filled well / outlined ring), name with `min-w-0 truncate`, type-appropriate headline with `shrink-0`, cadence sub-line, percentage verb, track, caption, and ETA line. Reads `goalProgress` for money and `goalProjection` for every date. T010–T012 go green.
- [X] T014 [US1] Implement the two track directions inside `SavingsDebtCard.tsx`: savings = one `--positive` segment anchored left; debt = paid share at 22% opacity anchored left with the remaining `--positive` segment anchored right, depleting toward zero. One hue only (FR-013, P1). Keep `role="progressbar"` with `aria-valuenow`/`aria-valuetext` (P7)
- [X] T015 [US1] Swap `web/components/planning/GoalsSummaryCard.tsx` to render `SavingsDebtCard` in place of `GoalCard`, preserving the existing behind-first ordering from `summary.rows`, the `href` to `/planning/goals?id=`, and the add-contribution and edit affordances (FR-017)
- [X] T016 [US1] Point `web/components/goals/GoalDetail.tsx` at `SavingsDebtCard` so the detail page's hero keeps working, then **delete** `web/components/goals/GoalCard.tsx` and `web/test/goals/GoalCard.test.tsx`/`goal-card.test.tsx` once nothing imports them
- [X] T017 **GATE** [US1] `cd web && npx tsc --noEmit && npm test` — green, with no pre-existing suite modified except those deleted in T016

**Checkpoint**: US1 is independently shippable. This is the MVP — the card already answers the
question the old one couldn't.

---

## Phase 4 · User Story 3 — Fixing a contribution without leaving the page (P2)

**Sequenced before US2** despite equal priority: it is what makes T011's removal of the always-visible
ledger safe rather than a regression. Both are P2, so nothing in the spec's ordering forbids this.

**Independent test**: Expand a card's list, edit and delete a row, and confirm both take effect
without navigating away and that the headline and total agree afterwards.

- [X] T018 **RED** [US3] Create `web/test/goals/contribution-ledger.test.tsx`: the disclosure is a `<button>` with `aria-expanded` (P7); activating it reveals rows newest-first; a closing total row states the total contributed (FR-016); rows cap at 12 with a link to the detail page beyond that. **Watch it fail.**
- [X] T019 **RED** [US3] Add to `web/test/goals/savings-debts-section.test.tsx`: expanding card B collapses card A — at most one open at a time (FR-015, research R8)
- [X] T020 **GREEN** [US3] Create `web/components/goals/ContributionLedger.tsx` — the 4-column row grid, newest-first ordering with the existing date-then-`created_at` tie-break, per-row edit and delete buttons with accessible labels, total row, and the 12-row cap
- [X] T021 [US3] Wire the disclosure into `SavingsDebtCard.tsx` as a controlled `expanded` prop plus `onToggle`, and hold `expandedId: string | null` in `GoalsSummaryCard.tsx` so at most one is open (research R8). T018–T019 go green.
- [X] T022 [US3] Animate the disclosure with the `grid-template-rows: 0fr → 1fr` technique at `--duration-fast`/`--ease-out`; confirm the existing global `prefers-reduced-motion` block drops it to instant (research R7, P7)
- [X] T023 [US3] Route the ledger's edit and delete through the store's existing `ContributionForm` and `deleteContribution`, so a correction takes effect without navigation (FR-016, SC-005)
- [X] T024 **GATE** [US3] `cd web && npx tsc --noEmit && npm test` — green

**Checkpoint**: US1 + US3 — cards are compact *and* corrections are still one tap.

---

## Phase 5 · User Story 2 — One line for the whole plan (P2)

**Independent test**: Render the section for a household with three items of mixed type; confirm the
header states the summed monthly commitment, summed progress against summed total, and names the
soonest and latest finishing item.

- [X] T025 **RED** [US2] Create `web/test/goals/savings-debts-header.test.tsx`: the aggregate sentence states monthly commitment, contributed, and combined target (FR-009); the sub-line names next and last with months (FR-010); with exactly one projectable item the "last:" clause is absent; with none, the whole sub-line is absent rather than empty or zeroed. **Watch it fail.**
- [X] T026 **RED** [US2] Add to the same file: the section footer states the active-item count and the total monthly commitment (FR-018)
- [X] T027 **GREEN** [US2] Create `web/components/goals/SavingsDebtsHeader.tsx` rendering the aggregate verdict, the sub-line, and the funded/remaining split bar (FR-011), all from `savingsDebtsSummary`. T025–T026 go green.
- [X] T028 [US2] Mount the header and the footer in `web/components/planning/GoalsSummaryCard.tsx` above and below the card list
- [X] T029 **GATE** [US2] `cd web && npx tsc --noEmit && npm test` — green

**Checkpoint**: the Planning section is complete — header, cards, ledger, footer.

---

## Phase 6 · User Story 4 — Understanding one item in depth (P3)

**Independent test**: Open the detail page for an item with a mixed-pace history; confirm all five
blocks render from that history, including a what-if table whose alternative rows state earlier dates.

- [X] T030 **RED** [US4] Rewrite `web/test/goals/goal-detail-page.test.tsx` for the five-block structure: hero, projected finish, progress toward target, pace against plan, consistency, contributions. Assert the fewer-than-3-contributions case collapses blocks 1–4 to one line while the ledger still renders in full (FR-027). **Watch it fail.**
- [X] T031 **RED** [P] [US4] Add `web/test/goals/detail-blocks.test.tsx` asserting: a sooner what-if delta is marked, a later one is plain and unmarked (FR-022, P2); the off-plan shape puts the recent average first and the planned amount as an improvement (FR-021); a skip row's delta is exactly +1 month
- [X] T032 **GREEN** [P] [US4] Create `web/components/goals/detail/ProjectedFinishBlock.tsx` — the label/value header plus the derived what-if table from `whatIfScenarios` (FR-020)
- [X] T033 **GREEN** [P] [US4] Create `web/components/goals/detail/PaceAgainstPlanBlock.tsx` — one bar per contribution month against a dashed plan line with a panel-coloured caption chip, an over-plan bar drawn at true height, a missed month at zero with no stub, the "N of M on plan" reading, and the one-sentence result (FR-024)
- [X] T034 **GREEN** [P] [US4] Create `web/components/goals/detail/ConsistencyBlock.tsx` — one cell per month, filled / dimmed / dashed-outline-empty, streak count, and the one-sentence reading. A missed month is absence plus an outline, never a colour (FR-025, P2)
- [X] T035 **RED→GREEN** [US4] Create `web/components/goals/charts/GoalProgressChart.tsx` (recharts, reached via `next/dynamic`) — cumulative actual with an end dot, a dashed target line, and a dashed projection from today to the target at the projected finish; x-span = item start → projected finish. **Build the geometry from data; do not transcribe the prototype's SVG path** (research R4, handoff Fidelity). Add `web/components/goals/detail/ProgressTowardTargetBlock.tsx` with the axis strip and legend (FR-023)
- [X] T036 [US4] Rebuild `web/components/goals/GoalDetail.tsx` as hero + the five blocks, with the block-separator rhythm from the handoff, and the full uncapped ledger as block 5 (FR-019, FR-026)
- [X] T037 [US4] Delete `web/components/goals/charts/GoalCumulativeChart.tsx` and `GoalMonthlyChart.tsx` and their references; keep `web/lib/finance/goalSeries.ts` only if something still imports it, otherwise delete it and `web/test/finance/goalSeries.test.ts` with it
- [X] T038 **GATE** [US4] `cd web && npx tsc --noEmit && npm test && npx vitest run test/bundle/no-eager-recharts.test.ts` — the bundle guard must still pass (recharts reached only via `next/dynamic`)

**Checkpoint**: the detail page answers five questions the old one didn't.

---

## Phase 7 · User Story 5 — The same vocabulary everywhere (P3)

**Independent test**: Render the widget and its panel for a household with one item of each type;
confirm type-appropriate headline, verbs, and bar direction, and that panel projections match the
Planning card for the same item.

- [X] T039 **RED** [US5] Rewrite `web/test/widgets/goals.test.tsx` for the new vocabulary: type-appropriate headline and bar direction per row, and **no charts, no ETA line, no disclosure** in the compact cell (research R6). **Watch it fail.**
- [X] T040 **RED** [US5] Rewrite `web/test/widgets/panels/goals-panel.test.tsx` asserting the panel's stated finish month for an item is identical to the card's for the same `now` (SC-006, C7)
- [X] T041 **GREEN** [US5] Rework `web/components/widgets/bodies/GoalsBody.tsx` — vocabulary, headline-by-type, and bar direction only. No aggregate header, no ETA, no chart (research R6)
- [X] T042 **GREEN** [US5] Rework `web/components/widgets/panels/GoalsPanel.tsx` onto `goalProjection`, replacing its local `monthlyRateCents`/`monthsRemaining` arithmetic — that local derivation is exactly the cross-surface disagreement C7 exists to prevent. Apply P8's `min-w-0`/`shrink-0` to every row
- [X] T043 [US5] Update `web/lib/widgets/registry.tsx`: `title: 'Savings & Debts'` and a description covering both kinds. **Leave `id: 'goals'` unchanged** — it is the localStorage key for widget enablement (research R5, P9)
- [X] T044 **RED→GREEN** [US5] Add a test pinning `id === 'goals'` in the registry, so a future tidy-up rename cannot silently reset every user's dashboard layout
- [X] T045 **GATE** [US5] `cd web && npx tsc --noEmit && npm test` — green

**Checkpoint**: all four surfaces speak one vocabulary and agree on every number.

---

## Phase 8 · Polish & cross-cutting

- [X] T046 **RED** Create `web/test/i18n/savings-debts-i18n.test.ts` asserting every new/renamed key resolves in all five catalogs with no English fallback (FR-030, SC-009, P10). **Watch it fail.**
- [X] T047 **GREEN** Add a `// spec 059 — savings & debts` region to each of `web/lib/i18n/{bn,es,ja,ko,zh}.ts` with every new and renamed key translated. Remove the keys the deleted components orphaned
- [X] T048 Sweep every member-facing "Goals" string to "Savings & Debts" per the research R5 inventory: the Planning section title, the widget title and description, `New goal` → `New item`, `Edit goal`/`Delete goal`, and both empty states. **Routes, table names, component names, and the widget `id` stay `goal`** (FR-031, P9)
- [X] T049 [P] Confirm P2 across every new surface: grep the feature's components for any warning/error colour token and assert none is reachable — including missed months, later projections, and off-plan pace (FR-032, SC-007)
- [X] T050 [P] Confirm P6: every money, percentage, count, and date value in the new components carries `tabular-nums` (FR-036)
- [X] T051 [P] Update `docs/web.md` with the Savings & Debts section, the projection engine, and the note that `goals.ts` remains the vectored engine and is deliberately separate
- [X] T052 [P] Rewrite the active-feature paragraph at the top of `CLAUDE.md` to describe spec 059 as shipped, moving spec 057 to "Prior shipped" — matching the file's existing convention
- [X] T053 **FULL GATE** Run every gate in `quickstart.md` §1: `npx tsc --noEmit`, `npm test`, `npm run test:tz`, `npm run gen:vectors && git diff --exit-code ../shared/test-vectors`, `npm run build`
- [ ] T054 Walk `quickstart.md` §3 manually in a browser at desktop and 360px widths, in light and dark, in all six languages. Record the result honestly
- [ ] T055 Attempt `quickstart.md` §4 (real-iOS safe areas). **If no device is available, report it as UNRUN — do not tick it.**

---

## Dependencies & execution order

### Phase dependencies

- **Phase 1 (Setup)** → no dependencies
- **Phase 2 (Engine)** → depends on Phase 1. **Blocks every user story.** T009 is a hard gate
- **Phase 3 (US1)** → depends on Phase 2
- **Phase 4 (US3)** → depends on Phase 3 (the disclosure lives on US1's card)
- **Phase 5 (US2)** → depends on Phase 2 for `savingsDebtsSummary`; independent of Phases 3–4 in principle, but mounts into the same file as T015/T021, so sequenced after to avoid a self-inflicted conflict
- **Phase 6 (US4)** → depends on Phase 2; reuses US3's ledger component
- **Phase 7 (US5)** → depends on Phase 2 only. Genuinely independent of Phases 3–6
- **Phase 8 (Polish)** → depends on everything; the copy sweep runs once, when every string exists

### Within each story

RED tests first, always. Then the component, then its mounting, then the gate.

### Parallel opportunities

- T007 and T008 — different files, both extend a green engine
- T031–T034 — the three detail blocks are separate files with no shared state
- T049, T050, T051, T052 — independent verification and docs passes

**Not parallelisable**: the phases themselves, and anything touching
`components/planning/GoalsSummaryCard.tsx` (T015, T021, T028) — three tasks, one file, sequential.

---

## Implementation strategy

### The honest MVP

**Phases 1–3.** The engine plus the redesigned card. At that point the section is already shorter,
debt and savings already read differently, and every card already answers "when is this done?" — the
handoff's own judgement that "steps 1–2 are a shippable increment".

Phase 2 alone is *not* demoable: a pure engine with no consumer changes nothing a member can see.

### Incremental delivery

1. Phases 1–2 → the engine, fully pinned, invisible
2. **Phase 3 → first real surface. Stop and validate — this is the MVP**
3. Phase 4 → corrections stay one tap, which retires the risk Phase 3 introduced
4. Phase 5 → the aggregate view no single card can give
5. Phase 6 → the detail page
6. Phase 7 → the dashboard catches up
7. Phase 8 → copy, docs, and the full gate

### Notes

- **T009 is not ceremony.** It is the single check that this feature stayed additive to a vectored
  engine. If it ever reports a diff, stop and revert rather than re-baselining
- **T012 is the anti-regression for the whole redesign.** The old card's flaw was height that grew
  with contribution count; without that test it can silently return
- **T042 removes a real hazard**, not just duplication: the panel currently derives its own months-
  remaining figure, so it can already disagree with the card it links to
- Commit after each task or logical group; keep `git status --short web/lib/finance/goals.ts` empty
