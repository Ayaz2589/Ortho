# Research: Widget Detail Panels (base branch)

**Feature**: 057 | **Date**: 2026-08-22 | **Spec**: [spec.md](./spec.md)

Scope of this document: the **base branch only** — US1 (frame), US2 (home equity), US3
(budgets), US10 (activity), plus the two collision-proofing measures the base owes the six
parallel follow-ups. US4–US9 are out of scope here and are planned in their own sandboxes.

Every decision below was verified against the code rather than inferred.

---

## D1 — Panel registration: `Panel?: ComponentType`, mirroring `Body`

**Decision**: Add one optional field to `WidgetDefinition`:

```ts
/** Optional propless detail panel (spec 057). Absent ⇒ the placeholder. */
Panel?: ComponentType
```

**Rationale**: `WidgetDefinition.Body` is already a bare, propless `ComponentType`
(`registry.tsx:41`), and spec 056 went out of its way to keep it that way — threading a
`personId` prop would have changed the type "for all fifteen widgets to serve six". The same
argument applies here with more force: a `PanelConfig` union describing nine different panel
shapes would put every widget's requirements into one type, and the widget needing an
interactive control would drag the rest along. A bare `ComponentType` keeps the registry entry
as boring as it is today.

Optionality is load-bearing, not convenience: it is what lets three panels ship on this branch
and six more arrive later without the registry ever being in a broken intermediate state.

**Alternatives rejected**:
- *A single config-driven universal panel.* The content shapes genuinely do not rhyme — an
  amortization table, a debt-settlement list, a per-goal trajectory chart and an interactive
  what-if have no common structure. A schema expressive enough for all of them is a programming
  language encoded in JSON.
- *Making `Panel` required.* Would force nine panels onto one branch, which is precisely the
  fan-out this feature is shaped to avoid.

---

## D2 — Panel state stays in `WidgetBoard`

**Decision**: `WidgetBoard` keeps owning `openWidget` (it already does, `WidgetBoard.tsx:26`)
and gains one further piece of state for the second level (D6). The dashboard page is not
touched.

**Rationale**: This is what makes SC-006 achievable. If panel state lifted to
`dashboard/page.tsx`, every follow-up sandbox would have a reason to touch the page component,
and six sandboxes editing one file is the collision the whole plan exists to prevent.

**Alternatives rejected**: *The transactions-style in-page branch* (`transactions/page.tsx:69`
branches on `useIsExpanded()` and replaces the page body on mobile). Truest to the literal
phrase "same as the transactions panel", but it requires exactly the state lift above. Rejected
with the user; see D3 for what replaces it.

---

## D3 — Mobile: the drawer's existing `fullBleedOnMobile`

**Decision**: Pass `fullBleedOnMobile` to the `Drawer` already rendered by `WidgetBoard`.

**Rationale**: The prop exists and is documented for exactly this
(`Drawer.tsx:29-32` — "On mobile (<1024px), render a full-screen panel with no scrim instead of
the 90vw right-side drawer — matching the full-page add/edit form"). It is already proven by
two shipped surfaces, `AnnouncementHost.tsx:53` and `CsvImportFlow.tsx:325`. The implementation
is `position: fixed; inset: 0` over `var(--bg)` with the scrim suppressed
(`Drawer.tsx:62-71`), which is genuinely full-screen — it covers the hero and the scope
controls, not just the board.

The breakpoint is `useIsExpanded()` = `(min-width: 1024px)`, matching the constitution's
expanded tier.

**Accepted cost**, recorded in the spec's Assumptions: panels get no URL, so they are neither
deep-linkable nor dismissible by the device back gesture.

**Alternatives rejected**: *A route per widget* (`/dashboard/w/[id]` + `generateStaticParams`
over the registry, the technique spec 045 used for landing locales). Genuinely attractive —
deep links, free OS back, and the cleanest possible sandbox split, since each panel would own a
route file. Rejected with the user as more surface than this feature needs; revisitable later
without touching any panel's content, because the change is confined to the frame.

---

## D4 — Safe-area insets belong to the frame, not to `Drawer`

**Decision**: `WidgetPanel` applies `var(--safe-top)` / `var(--safe-bottom)` padding in the
full-screen presentation. `Drawer` itself is **not** modified.

**Rationale**: The tokens exist (`globals.css:175-178`) and the app shell already uses them
(`app/(app)/layout.tsx:53`) — but a `Drawer` portals to `<body>` and is `position: fixed;
inset: 0`, so it escapes the shell's padding entirely. Nothing in `mobileFullScreenStyle`
compensates. Constitution III makes this a hard requirement on iOS, not a nicety.

The fix is scoped to the frame deliberately. Adding the padding to `Drawer` would improve the
announcement host and the CSV import flow too — but it would also move two shipped surfaces'
rendering as a side effect of a dashboard feature, which is the kind of quiet blast radius this
project consistently refuses. FR-025's discipline applies to neighbours as well as to cards.

**Observation for a separate change**: `AnnouncementHost` and `CsvImportFlow` appear to have
the same gap on a notched device today. Worth confirming on hardware and fixing on its own
merits; explicitly **not** fixed here.

---

## D5 — The scope caption is mostly free, and must caption honestly

**Decision**: The frame renders a caption from two sources:
- **Period** — `DashboardScope.periodLabel`, which already yields `"June 2026"` for a selected
  month and the range's long label otherwise (`useDashboardRange.ts:83-84`).
- **Subject** — `"Household"` for household scope, else `resolveUser(personId).name`.

Panels that deliberately ignore an axis MUST caption only the axis they honour (FR-014):

| Panel | Honours time? | Honours person? | Caption |
|---|---|---|---|
| Home equity (US2) | no | no | property-level, no scope caption |
| Budgets (US3) | yes (reference month) | yes | `{Subject} · {periodLabel}` |
| Activity (US10) | **no** (live feed by design) | yes | `{Subject} · Recent` |

**Rationale**: `periodLabel` existing means the expensive half of FR-013 is already solved.
Honest captioning is the non-negotiable half: `ActivityBody` ignores the time window on purpose
(spec 041 O-2), and a panel captioned "August 2026" over a feed that is not windowed to August
would be a *new* mixed-subject defect — the exact class spec 056 was written to remove. Better
to say less than to say something untrue.

---

## D6 — Second level: a small stack in the frame + `Drawer.onEscape`

**Decision**: `WidgetPanel` accepts an optional pushed detail view. When one is pushed, the
header's control becomes "back" (returning to the panel's first level) rather than "close", and
`Drawer`'s `onEscape` is wired to the same step-back.

**Rationale**: `Drawer` was built for this — `onEscape` is documented as "Pass a custom one to
step back within a pushed detail view before closing the whole drawer" (`Drawer.tsx:33-34`) and
`CsvImportFlow`'s `CsvDrawer` already threads it. So the capability is proven, not speculative.

Shipping it in the base rather than retrofitting is the point: **US6** (per-merchant detail) and
**US7** (per-pair breakdown) both need it, and adding a back affordance across six merged panels
later is materially harder than having it from the start.

**US2 exercises it on this branch** — a household with several mortgages lists them, and
selecting one shows that mortgage's schedule. That keeps the API from shipping untested, which
was the main argument against including it.

---

## D7 — Scroll region: the `TrayBody` shape

**Decision**: The frame's content region uses
`flex: 1; min-height: 0; overflow-y: auto` beneath a fixed `DrawerHeader`.

**Rationale**: This is `CsvImportFlow`'s `TrayBody` verbatim — a solved problem in this codebase
for "bounded scrolling content under a drawer header". Widget *cards* use `WidgetScroll` (hidden
scrollbar + edge fade) because they are small uniform tiles where a visible scrollbar would be
noise; a full-height panel is a different situation, and hiding the scrollbar on a long
amortization schedule would obscure how much content there is.

---

## D8 — The budgets panel needs a ledger that already exists but is discarded

**Decision**: Extract the rollover series from `budgetStatusForMonth` into an exported
`budgetLedgerForMonth(budget, transactions, referenceMonth): RolloverMonth[]`, and reduce
`budgetStatusForMonth` to a thin projection of its last entry.

**Rationale**: This is the single most valuable finding for US3. `budgetStatusForMonth`
(`budgets.ts:111`) already builds the full monthly-spend series, runs `computeRolloverLedger`
over it, and then keeps **only `ledger[ledger.length - 1]`**, discarding every prior month. The
carry history US3 needs is computed on every render today and thrown away.

The refactor must be strictly behaviour-preserving: `budgetStatusForMonth`'s existing tests are
the pin, and they must pass unmodified. `RolloverMonth` is already exported (`budgets.ts:22`),
so no new type is introduced.

**Alternatives rejected**: *Rebuilding the series inside the panel.* Would duplicate the
month-bucketing and anchor rules — including the "anchor at the budget's creation month" subtlety
— giving two implementations of one rule to drift apart. Exactly what spec 051 avoided by making
`moneyScope.ts` the single place the attribution rule lives.

---

## D9 — Pre-carved i18n sub-blocks (collision-proofing #1)

**Decision**: The base branch adds, to each of the five catalogs (`bn`, `es`, `ja`, `ko`, `zh`),
a spec-057 region containing one commented sub-block per panel in registry order — including
sub-blocks for the six panels this branch does not build.

**Rationale**: Verified structure — each catalog is a flat 625-line `Record<string, string>`
grouped by spec, with new keys appended per block, and **no reserved-region markers** (those
exist only in the landing catalogs from spec 045). Six sandboxes each appending a spec-057 block
to five files means thirty edits landing on adjacent lines, and git will conflict on most of
them. Pre-carving turns that into six sandboxes editing six non-adjacent, individually-owned
regions.

This is what makes SC-006 true rather than aspirational. The cost is a handful of comment lines
per catalog on this branch; the saving is thirty mechanical merge conflicts later.

**Alternatives rejected**: *Per-panel catalog modules* (à la `lib/i18n/landing/*.ts`). Fully
eliminates the shared file, but changes i18n architecture for a problem that comment markers
solve. Reconsider only if the panels' string volume turns out large enough to justify it.

---

## D10 — Kit extraction after US2 + US3, then append-only (collision-proofing #2)

**Decision**: Build US2 and US3 fully bespoke **first**. Only then extract the shared primitives
they actually have in common. From the moment the base merges, the kit is **append-only**: a
follow-up may add a primitive in a new file, never modify an existing one. Duplicate primitives
are consolidated in a separate pass afterwards.

**Rationale**: A kit designed for nine imagined panels will have the wrong seams; one extracted
from two real, deliberately dissimilar panels will not. US2 is a headline + dense table + second
level; US3 is repeated per-entity sections with bars and nested lists. What those two share has
a strong claim to being universal rather than coincidental.

The append-only rule addresses the residual risk that survives extraction: a kit from two panels
is a *hypothesis*, and the remaining six will want to stretch it. Six branches mutating shared
primitives concurrently would recreate the exact collision the kit was meant to prevent. Adding
is safe; modifying is not.

**Alternatives rejected**: *Designing the kit up front.* Tempting because it would let all nine
panels start at once — and it is how you get primitives that fit none of them.

---

## D11 — The regression lock survives, by a genuine accident of ordering

**Finding**: Exactly one test asserts the placeholder —
`test/widgets/widget-board.test.tsx:111` — and it opens `defaultEnabledTitles[0]`, which in
registry order is **`financial-health`**: the one widget this feature explicitly excludes
(FR-007).

**Consequence**: the test passes **unmodified**, and so SC-007's "every pre-existing widget suite
passes without modification" holds literally, with no test edited to make it true. That untouched
green is the evidence that no card moved — the technique spec 050 used with its five untouched
form suites and spec 056 used with its twenty.

⚠️ **This is contingent, not structural.** It holds only while financial health is both
default-enabled, first in registry order, and panel-less. Any future change to those three facts
must update that test deliberately, and should say so.

---

## D12 — Activity is folded into the base

**Decision**: US10 ships on this branch as the third panel, not in a sandbox of its own.

**Rationale**: It is the smallest panel in the set — a longer feed and a hand-off to
`/transactions` — and an isolated environment, a pull request and a review cycle cost more than
the panel does. It also earns its place as a third data point for D10's extraction: a flat
date-grouped list is a shape neither US2 nor US3 produces, so it tests the kit's seams cheaply
before six sandboxes depend on them.

`ActivityBody` ignores the time window by design, so its panel must caption per D5 and must not
silently start windowing.

---

## Resolved without research

- **Scope arrives free.** The `Drawer` is rendered from inside `WidgetBoard`, which sits inside
  both `DashboardScopeProvider` and `MoneyScopeProvider`, so every panel can call
  `useDashboardScopeContext()` and `useScopedTransactions()` with no plumbing. FR-012 is
  therefore a constraint to honour, not a mechanism to build.
- **No new financial engine.** US2 uses `upcomingAmortization` / `maturityDate` /
  `yearsRemaining` (all exported, all currently unreachable from the UI); US3 uses D8's
  extraction; US10 uses the store directly. No new money math, so no new golden vector.
- **Focus management is already handled** — `Drawer` runs `useFocusTrap` and an Escape handler
  (`Drawer.tsx:37-58`), satisfying FR-011 without new work.
- **No schema change, no migration, no new dependency** (FR-024). Nothing in the base slice
  reads or writes anything not already loaded for the dashboard.
