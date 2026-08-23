---

description: "Task list for spec 057 — widget detail panels (base branch slice)"
---

# Tasks: Widget Detail Panels — base branch

**Input**: Design documents from `/specs/057-widget-detail-panels/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/)

**Tests**: REQUIRED. Constitution VI (Test-Driven & Regression-Safe) is NON-NEGOTIABLE, and the
spec commits to full TDD. Every test task below is RED-first: write it, watch it fail, then
implement.

**Scope**: US1, US2, US3, US10 and the two collision-proofing measures. **US4–US9 are out of
scope** — six independent sandboxes on top of this base once it merges. See
[contracts/follow-up-brief.md](./contracts/follow-up-brief.md).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1 / US2 / US3 / US10. Setup, foundational, kit and polish tasks carry no label.

## Path Conventions

Single canonical codebase under `web/`. Paths below are repo-relative.

> ⚠️ **This branch is mostly SEQUENTIAL, and that is deliberate.** US3 depends on the D8
> extraction; the kit extraction depends on US2 *and* US3 both existing; US10 is built *on* the
> extracted kit precisely to test it. `[P]` is therefore rare here — mostly independent RED test
> files within one story. Do not reorder the phases to gain parallelism; the ordering is the
> design (plan → Build Order).

---

## Phase 1: Setup

**Purpose**: Establish the regression baseline that FR-025 / SC-007 are measured against.

- [ ] T001 Capture the baseline: run `npm test` from `web/` and record the passing file/test counts in the branch notes, then confirm `git status --short web/test/widgets/` is empty. Everything after this point must leave every pre-existing suite unmodified.
- [ ] T002 [P] Create the directories `web/components/widgets/panels/` and `web/test/widgets/panels/`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The registry field and board wiring every panel depends on.

**⚠️ CRITICAL**: No panel work can begin until this phase is complete.

- [ ] T003 Write RED test `web/test/widgets/widget-panel-registration.test.tsx` covering: (a) a widget declaring `Panel` renders that panel inside the drawer; (b) a widget with no `Panel` still renders the `Details coming soon.` placeholder (FR-003); (c) a widget with `href` set never opens a panel and still navigates (FR-006, data-model R-3).
- [ ] T004 Add `Panel?: ComponentType` to `WidgetDefinition` in `web/lib/widgets/registry.tsx`, with a header comment recording D1: a bare propless `ComponentType` mirroring `Body`, because a `PanelConfig` union would put all nine widgets' requirements into one type — the spec-056 argument. Note that optionality is what allows an incremental rollout.
- [ ] T005 Modify `web/components/widgets/WidgetBoard.tsx` to render `openWidget.Panel` when present and fall back to the existing placeholder otherwise, and pass `fullBleedOnMobile` to the `Drawer` (D3). Panel state stays in `WidgetBoard` — do NOT lift it to `dashboard/page.tsx` (D2, and SC-006 depends on it).
- [ ] T006 Verify the regression lock: `npm test -- test/widgets/widget-board.test.tsx` must pass **unmodified**. Its placeholder assertion opens `defaultEnabledTitles[0]` = `financial-health`, which this feature excludes (D11). If it fails, fix the cause — do not edit the test without deciding that deliberately.

**Checkpoint**: The board can render a panel. Nothing user-visible has changed yet, because no widget declares one.

---

## Phase 3: User Story 1 — Open a widget and see real detail (Priority: P1)

**Goal**: The shared frame every panel renders inside — header, scope caption, scrolling region, route-out footer, second level, mobile full-screen, safe areas.

**Independent Test**: Register any single panel and open it at a phone width and a desktop width. The frame, caption, close control, scroll region and unregistered-widget fallback are all verifiable with one panel present.

### Tests for User Story 1 ⚠️ RED first

- [ ] T007 [P] [US1] Write RED test `web/test/widgets/widget-panel-frame.test.tsx`: the frame renders the widget title as a real heading, a close control, a bounded scrolling content region, and a route-out footer only when a destination is supplied (FR-004).
- [ ] T008 [P] [US1] Write RED test `web/test/widgets/widget-panel-caption.test.tsx` for the scope caption across all four combinations of D5's table: both axes, subject only, period only, and neither. A panel that ignores an axis MUST omit that half rather than state something untrue (FR-013, FR-014).
- [ ] T009 [P] [US1] Write RED test `web/test/widgets/widget-panel-second-level.test.tsx`: pushing a detail swaps close for back; back returns to level one rather than closing; Escape steps back once and only then closes (D6, FR-005).
- [ ] T010 [P] [US1] Write RED test `web/test/widgets/widget-panel-mobile.test.tsx`: below 1024px the panel renders full-screen with no scrim, and its content carries `var(--safe-top)` / `var(--safe-bottom)` padding (FR-009, FR-010).

### Implementation for User Story 1

- [ ] T011 [US1] Create `web/components/widgets/WidgetPanel.tsx`: `DrawerHeader`, the caption, a `flex:1; min-height:0; overflow-y:auto` content region (D7 — the `TrayBody` shape from `CsvImportFlow`, NOT `WidgetScroll`; a long schedule must show its scrollbar), and the route-out footer.
- [ ] T012 [US1] Apply safe-area insets in `WidgetPanel`'s full-screen presentation using the existing `var(--safe-top)` / `var(--safe-bottom)` tokens. **Do NOT modify `Drawer`** — that would change how `AnnouncementHost` and `CsvImportFlow` render as a side effect of a dashboard feature (D4).
- [ ] T013 [US1] Add the second-level stack to `WidgetPanel` and wire `Drawer`'s existing `onEscape` to step back before closing, following `CsvImportFlow`'s `CsvDrawer` (D6).
- [ ] T014 [US1] Wire `WidgetPanel` into `WidgetBoard` so a registered `Panel` renders inside the frame.
- [ ] T015 [US1] Add the frame's strings to all five catalogs `web/lib/i18n/{bn,es,ja,ko,zh}.ts` under a `spec 057 — panel frame` block (FR-023).

**Checkpoint**: The frame is complete and tested, but still shows no real content — US1 alone is not demoable. See Implementation Strategy.

---

## Phase 4: User Story 2 — Home equity (Priority: P1)

**Goal**: The first reference panel. Payoff date, years remaining, the payment schedule, and per-mortgage breakdown with a second level.

**Independent Test**: Open for a household with one mortgage and again with several; verify against the existing mortgage engine's fixtures.

### Tests for User Story 2 ⚠️ RED first

- [ ] T016 [P] [US2] Write RED test `web/test/widgets/panels/home-equity-panel.test.tsx`: payoff date and years remaining appear beside the equity headline; the schedule lists upcoming payments each split into principal and interest; a household with no mortgage gets a calm explanation, not an empty table (FR-020).
- [ ] T017 [P] [US2] Write RED test in the same file for the multi-mortgage case: each mortgage is listed separately rather than summed as the card does, and selecting one pushes its own schedule with a working back affordance — this is what keeps D6 from shipping untested.

### Implementation for User Story 2

- [ ] T018 [US2] Create `web/components/widgets/panels/HomeEquityPanel.tsx` using `upcomingAmortization`, `maturityDate`, `yearsRemaining` and `housingSummary` from `web/lib/finance/`. All are already exported and currently unreachable from the UI — no new money math (data-model §2).
- [ ] T019 [US2] Declare the caption as honouring **neither** scope axis: a property is a household asset and a mortgage schedule is not windowed, consistent with `HomeEquityBody` reading neither context (D5).
- [ ] T020 [US2] Register `Panel: HomeEquityPanel` on the `home-equity` entry in `web/lib/widgets/registry.tsx`.
- [ ] T021 [US2] Add the panel's strings to all five catalogs (FR-023).
- [ ] T022 [US2] Constitution II review: confirm the amortization table reads as calm rather than crammed — this is the one place in the feature where density is a real risk (plan → Constitution Check).

**Checkpoint**: The first real panel is live. The frame is now proven end to end.

---

## Phase 5: User Story 3 — Budgets (Priority: P1)

**Goal**: The second reference panel, deliberately dissimilar in shape. Composing transactions, carry history, month-end projection, and honest handling of a person with no personal limit.

**Independent Test**: Open for a household with several budgets including one carrying a balance forward and one overspent; verify each section against the budget engine.

### Engine extraction first (D8) ⚠️ RED first

- [ ] T023 [US3] Write RED test `web/test/budgets/budget-ledger.test.ts` for `budgetLedgerForMonth`: it returns one entry per month from the budget's creation month through the reference month, and its **last entry equals** what `budgetStatusForMonth` returns for the same inputs.
- [ ] T024 [US3] Extract `budgetLedgerForMonth(budget, transactions, referenceMonth): RolloverMonth[]` in `web/lib/finance/budgets.ts`, and reduce `budgetStatusForMonth` to a thin projection of its last entry. `RolloverMonth` is already exported — introduce no new type. This is a **pure move**: the full ledger is already computed on every render and discarded (D8).
- [ ] T025 [US3] Verify the extraction moved nothing: `npm test -- test/budgets/budget-status.test.ts test/budgets/rollover-engine.test.ts test/planning/planSummary.test.ts test/widgets/budgets.test.tsx` all pass **unmodified**, and `npm run gen:vectors` regenerates byte-identically.

### Tests for User Story 3 ⚠️ RED first

- [ ] T026 [P] [US3] Write RED test `web/test/widgets/panels/budgets-panel.test.tsx`: each budget's section lists the transactions composing its spend; a budget carrying a balance forward shows how that carry accumulated across recent months; a household with no budgets gets a calm prompt (FR-020).
- [ ] T027 [P] [US3] Write RED test in the same file: the month-end projection is present mid-month and **worded as a projection, never as settled fact** (FR-022); and under person scope a category the person spends in with no personal limit is **named as having none**, with no household limit borrowed on their behalf (spec 054 FR-011 — the spec-052 error class).

### Implementation for User Story 3

- [ ] T028 [US3] Create `web/components/widgets/panels/BudgetsPanel.tsx` using `budgetLedgerForMonth`, `scopeBudgets`, and `monthElapsedFraction` from `web/lib/planning/planSummary.ts`.
- [ ] T029 [US3] Declare the caption as honouring **both** axes, and project limits and spend at the same entry point exactly as `BudgetsBody` does (data-model §2).
- [ ] T030 [US3] Register `Panel: BudgetsPanel` on the `budgets` entry, and add the panel's strings to all five catalogs.
- [ ] T031 [US3] Verify nothing red: an overspent budget and a carried shortfall both read in sand accent, never red (FR-021).

**Checkpoint**: Two structurally dissimilar panels exist. The kit can now be extracted from evidence rather than from imagination.

---

## Phase 6: Extract the shared primitives kit (D10)

**Purpose**: Derive the kit from two *built* panels, then freeze its mutation. This phase is why US2 and US3 came first.

- [ ] T032 Identify what `HomeEquityPanel` and `BudgetsPanel` genuinely share — headline stat, section header, dense row/table, list row, empty state — and nothing they do not. Resist adding a primitive that only one of them uses.
- [ ] T033 Extract those primitives into `web/components/widgets/panels/kit/`, one concern per file so a follow-up can add a sibling without touching an existing one.
- [ ] T034 Refactor `HomeEquityPanel` and `BudgetsPanel` onto the kit. **Both panels' test suites from Phases 4 and 5 must pass unmodified** — if a test needs editing, the refactor changed behaviour rather than structure.
- [ ] T035 Document the append-only rule in the kit's entry file: a follow-up may ADD a primitive in a new file and may NEVER modify an existing one, because a kit extracted from two panels is a hypothesis the remaining six will test, and six concurrent mutators recreate the collision the kit exists to prevent (D10, contract X-1).

**Checkpoint**: The kit exists. From here, it is append-only.

---

## Phase 7: User Story 10 — Recent activity, built ON the kit (Priority: P3)

**Goal**: The third panel — and the cheapest possible test of whether the kit generalises, while being wrong still costs one branch instead of six.

**Independent Test**: Open for a household with more than five transactions; verify ordering, grouping, person scoping, and that the time window is ignored.

### Tests for User Story 10 ⚠️ RED first

- [ ] T036 [P] [US10] Write RED test `web/test/widgets/panels/activity-panel.test.tsx`: a feed longer than the card's five, newest first, grouped by date; each row reaches its transaction; a route out to the transactions destination is offered rather than the ledger being reproduced (FR-018).
- [ ] T037 [P] [US10] Write RED test in the same file: under person scope the feed narrows to that person's rows, and changing the selected month does **not** window the feed — with the caption omitting the period accordingly (D5, FR-014). `ActivityBody` ignores time by design (spec 041 O-2) and the panel must not silently start windowing.

### Implementation for User Story 10

- [ ] T038 [US10] Create `web/components/widgets/panels/ActivityPanel.tsx` using **only existing kit primitives** where they fit. If something is missing, ADD a primitive in a new file — never modify one (T035's rule, applied for the first time).
- [ ] T039 [US10] Register `Panel: ActivityPanel` on the `activity` entry, and add the panel's strings to all five catalogs.
- [ ] T040 **The extraction test** (quickstart §4.5): inspect the US10 diff and confirm it touches only its own panel file, its own test file, one registry line, and its own catalog sub-block. If it had to touch `WidgetPanel`, `WidgetBoard`, or an existing kit primitive, **SC-006 is not yet true and the fan-out must wait** — fix the kit before Phase 8.

**Checkpoint**: Three panels shipped, and the kit is demonstrated to generalise.

---

## Phase 8: Collision-proofing for the six follow-ups (D9)

**Purpose**: The six sandboxes are blocked on this. It is invisible to users and is the whole reason the fan-out is safe.

- [ ] T041 Pre-carve a `spec 057 — widget panels` region in each of `web/lib/i18n/{bn,es,ja,ko,zh}.ts`, containing one clearly-labelled, commented sub-block per panel **in registry order, including the six panels this branch does not build** (spending-pace, savings-trends, top-merchants, household-balances, housing-costs, goals). Each catalog is a flat 625-line object with no reserved regions today, so without this six sandboxes append to adjacent lines and collide thirty times.
- [ ] T042 Verify the pre-carve: `grep -n "spec 057" web/lib/i18n/{bn,es,ja,ko,zh}.ts` shows the region in all five, sub-blocks are non-adjacent, and a sandbox can identify its own block unambiguously (quickstart §4.1–4.2).
- [ ] T043 Finalise [contracts/follow-up-brief.md](./contracts/follow-up-brief.md) against what actually shipped: the real kit primitive names, the real catalog block labels, and any frame capability that changed during Phases 3–7.

---

## Phase 9: Polish & Cross-Cutting Concerns

- [ ] T044 [P] Update `docs/web.md`: the panel layer in the dashboard section — the frame, the two scope axes reaching panels for free, and the panels directory as a sandbox's territory.
- [ ] T045 [P] Update the `CLAUDE.md` active-feature block to describe what shipped rather than what was planned.
- [ ] T046 Full verification from `web/`: `npm test` green, `npx tsc --noEmit` clean, `npm run gen:vectors` byte-identical, and `git status --short web/test/widgets/` showing **only added files** — the single most important check on the branch (quickstart §1).
- [ ] T047 Walk quickstart §2 manually at a desktop width and a phone width: all of §2's frame, home-equity, budgets and activity checks.
- [ ] T048 Attempt quickstart §3 on real iOS hardware (safe areas under the Dynamic Island and home indicator). If no device is available, **report it as UNRUN — do not tick it**. FR-010 is a Constitution III hard requirement and D4 established the frame is the only thing providing it.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)** → no dependencies.
- **Phase 2 (Foundational)** → depends on Phase 1. **Blocks every panel.**
- **Phase 3 (US1 frame)** → depends on Phase 2.
- **Phase 4 (US2)** → depends on Phase 3.
- **Phase 5 (US3)** → depends on Phase 3. T023–T025 (the engine extraction) must complete before T026–T031.
- **Phase 6 (kit)** → depends on **both** Phase 4 and Phase 5. This is the ordering constraint the whole branch is arranged around.
- **Phase 7 (US10)** → depends on Phase 6, by design. Building it alongside the kit instead of on it would forfeit the test.
- **Phase 8 (collision-proofing)** → depends on Phase 7's T040 passing. If the kit did not generalise, fix it before pre-carving.
- **Phase 9 (polish)** → depends on everything.

### Within Each Story

RED tests first, always. Then the engine change (US3 only), then the panel, then registration and i18n.

### Parallel Opportunities

Genuinely limited, and that is intentional:

- T007–T010 (US1's four RED test files) — different files, no shared state.
- T016–T017 (US2's RED tests) and T026–T027 (US3's) — same file each, so write them together rather than concurrently.
- T036–T037 (US10's RED tests).
- T044–T045 (docs).

**Not parallelisable**: the phases themselves. US2 and US3 look independent but both feed Phase 6, and US10 must follow it.

---

## Parallel Example: User Story 1

```bash
# The four frame RED tests are independent files — write them together:
Task: "Frame structure test in web/test/widgets/widget-panel-frame.test.tsx"
Task: "Scope caption test in web/test/widgets/widget-panel-caption.test.tsx"
Task: "Second-level navigation test in web/test/widgets/widget-panel-second-level.test.tsx"
Task: "Mobile full-screen + safe-area test in web/test/widgets/widget-panel-mobile.test.tsx"
```

---

## Implementation Strategy

### The honest MVP

**US1 alone is not demoable.** The frame with no registered panel changes nothing a user can
see — every widget still opens the placeholder. The first meaningful increment is
**Phases 1–4** (frame + home equity): one real panel, the frame proven end to end, and the
second-level navigation exercised.

### Incremental delivery

1. Phases 1–2 → the board can render a panel (invisible, but independently tested).
2. Phase 3 → the frame is complete and tested (still invisible).
3. **Phase 4 → first real panel. Stop and validate — this is the MVP.**
4. Phase 5 → second panel, and the engine extraction that recovers discarded computation.
5. Phase 6 → the kit, extracted from evidence.
6. Phase 7 → third panel on the kit, which tests the extraction. **T040 is a gate.**
7. Phases 8–9 → unblock the six sandboxes, then polish.

### Then fan out

After this branch merges to main, six sandboxes start in parallel, one panel each, per
[contracts/follow-up-brief.md](./contracts/follow-up-brief.md). Merge them one at a time as they
go green — the limiter is review capacity, not machines.

---

## Notes

- **The regression lock is evidence, not ceremony.** `git status --short web/test/widgets/` must show only added files at every commit. A modified pre-existing suite means a widget card moved, which FR-025 forbids and SC-007 measures.
- T006, T025, T034 and T040 are all verification gates rather than production tasks. Do not skip them to save time — each one exists because something specific could silently go wrong at that point.
- Commit after each task or logical group.
- ⚠️ T040 can legitimately fail. If it does, that is the process working: fix the kit before six sandboxes inherit it.
