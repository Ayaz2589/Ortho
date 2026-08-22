# Research: Goal Detail & Contribution Editing (spec 045)

Phase 0. Each item below was an open question in the Technical Context; each is closed by a
decision grounded in something already in this repo.

---

## R1 — Addressing one goal under a static export

**Decision**: `/planning/goals?id=<goalId>`, parsed with the existing `parseIdParam`
(`web/lib/formPageIntent.ts`). The existing `app/(app)/planning/goals/page.tsx` route file is
repurposed from the index list into the detail page.

**Rationale**: `web/next.config.ts` sets `output: 'export'`. A dynamic `[goalId]` segment would
have to enumerate every id at build time via `generateStaticParams`, but goal ids are runtime
UUIDs. A hard load or refresh of `/planning/goals/abc-123` therefore 404s on web; on the
Capacitor iOS shell it is worse — `web/lib/nav.ts` documents that the iOS asset router serves
`index.html` for *any* extensionless path, so the URL would silently open the app root and
bounce to the dashboard. `?id=` is already this repo's answer to exactly this problem:
`app/(app)/housing/edit/page.tsx` and `app/(app)/transactions/edit/page.tsx` both resolve their
target that way.

**Alternatives considered**:
- *`[goalId]` dynamic segment* — rejected above; breaks refresh, bookmarks, and iOS.
- *A catch-all with client-side path parsing* — same static-export problem: the HTML file does
  not exist, so the first load never reaches the client code that would parse the path.
- *A new `/planning/goal` route, keeping `/planning/goals` as the index* — rejected because the
  spec retires the index (FR-016); keeping both is the duplication this feature removes.

---

## R2 — Reading the query parameter

**Decision**: read `window.location.search` once in a mount effect and hold it in state
(`undefined` until read), then parse with `parseIdParam`. Render nothing until it is known.
Do **not** use `useSearchParams`.

**Rationale**: the pattern and its reason are already documented in `lib/useMobileFormPage.ts`
and `lib/formPageIntent.ts`: a static export prerenders at build time where `window` is absent,
and `useSearchParams` forces a Suspense deopt. Rendering nothing until `search !== undefined`
avoids a flash of the "goal not found" redirect on first paint.

**Note**: `useMobileFormPage` itself is **not** reused. It redirects to the list route at
≥1024px because the four spec-025 form pages have a desktop drawer equivalent. The goal detail
page is a real destination at every width and has no drawer twin, so it needs the search-reading
half without the desktop redirect. The shared piece is extracted as `useRouteSearch()` so the
two pages cannot drift.

**Alternatives considered**:
- *Reuse `useMobileFormPage`* — rejected: its desktop redirect would make the detail page
  unreachable on desktop, the primary canvas.
- *`useSearchParams` with a Suspense boundary* — rejected: contradicts the documented repo
  decision (research D2) and adds a boundary for no gain.

---

## R3 — Charts

**Decision**: recharts, imported **only** from new leaf components under
`web/components/goals/charts/`, reached from the detail page via `next/dynamic`. Two leaves:
`GoalCumulativeChart` (an area/line of cumulative saved cents, plus a straight pace reference
line when the goal is dated) and `GoalMonthlyChart` (a bar per month).

**Rationale**: recharts is already the app's chart library (`components/dashboard/charts/`), and
spec 022 established a hard rule — it is the heaviest dependency and may only be reached through
`next/dynamic`, statically imported *only* inside `components/**/charts/`. `SavingsRateChart.tsx`
is the working precedent for the calm styling: no gridlines, no axes chrome, no tooltip junk,
`isAnimationActive={false}`, token colors only.

**Guard gap found**: `test/bundle/no-eager-recharts.test.ts` only scans `components/dashboard`,
`components/housing`, and `components/widgets`. New chart consumers under `components/goals` and
`components/planning` would be unguarded, so this feature **extends `EAGER_DIRS`** with both.
That is a real gap being closed, not incidental churn.

**Alternatives considered**:
- *Hand-rolled inline SVG* — rejected: recharts is already paid for in this codebase and gives
  responsive sizing for free; hand-rolling would be a second charting idiom to maintain.
- *Eagerly importing recharts on the detail page* — rejected: violates the spec-022 rule and
  would be caught by the (extended) guard.

---

## R4 — `updateContribution` in the store

**Decision**: add `updateContribution(c: GoalContribution)` to `lib/store.tsx`, mirroring
`updateGoal` exactly: capture the previous row, apply optimistically, `await` the Supabase
`.update({ amount_cents, date, note }).eq('id', c.id)`, and on error restore the previous row and
`setError`. Only the three user-editable columns are written — `goal_id`, `created_by`, and
`created_at` are never reassigned by an edit.

**Rationale**: `updateGoal` is the established optimistic-with-rollback shape in this store, and
`deleteContribution` already proves the rollback pattern for this table. Matching it keeps the
failure behavior consistent and satisfies FR-023 ("leaves the ledger unchanged if persisting
fails").

**No migration** (FR-027): `goal_contributions` already carries `amount_cents`, `date`, and
`note`, and its RLS policies already permit household members to write. Nothing schema-level
changes.

**Alternatives considered**:
- *Delete-then-insert* — rejected: two round trips, a new id, and a window where the goal's saved
  total is visibly wrong.
- *Await before applying to state* — rejected: every other mutation in this store is optimistic;
  diverging here would make the ledger feel slower than the rest of the app.

---

## R5 — Preserving stored cents across a display-currency round trip

**Decision**: the contribution form's edit mode snapshots the pre-filled amount **text** at open
(`originalAmountText`) alongside the stored cents. On save, if the amount field still equals that
snapshot, write the stored cents verbatim; otherwise parse the field.

**Rationale**: this is the exact mechanism `useTxForm` uses (`originalAmountCents` /
`originalAmountText` / `effectiveCents`, spec 023 B1), and it exists because the round trip is
genuinely lossy: at GBP 0.78, `centsToDisplay(2)` is `"0.02"` and `parseMoney("0.02")` is `3`.
Without the guard, opening a contribution in a non-USD currency and saving it untouched would
silently change the household's saved total — the precise failure FR-021 forbids.

**Alternatives considered**:
- *Always re-parse the field* — rejected: that is the bug.
- *Store the display amount* — rejected: violates the "all money is integer USD cents" invariant
  (FR-024, constitution Additional Constraints).

---

## R6 — Chart series derivation

**Decision**: two new pure functions in `web/lib/finance/goalSeries.ts`, unit- and property-tested
in `web/test/finance/goalSeries.test.ts`:
- `cumulativeSeries(contributions, opts)` → ascending points of `{ day, cumulativeCents }`, plus
  an optional `paceCents` per point when a target date and created date are supplied.
- `monthlySeries(contributions)` → `{ monthKey, cents }` per month, covering only months from the
  earliest to the latest contribution (no unbounded empty span — spec Assumptions).

**Rationale**: constitution Principle VI requires money and date math to be pure and covered.
Keeping the series derivation out of the chart components means the numbers can be asserted
directly, and the recharts leaves stay dumb — which also keeps them out of the jsdom test path.
The pace line reuses the same steady-pace basis as `goalPacing` (`expected = target ×
clamp(elapsed/span, 0, 1)`), so the chart and the "behind pace" text can never contradict each
other.

**NOT promoted to `shared/test-vectors/`**: these are new presentation-support series, not a
change to the vectored `goalProgress`/`goalPacing` contract. `npm run gen:vectors` must show no
diff — same call made by spec 044 (research §3) for `routines.ts`.

**Alternatives considered**:
- *Compute inside the chart components* — rejected: untestable without rendering, and it would
  put date math inside a dynamically-loaded leaf.
- *Add a goals-series golden vector* — rejected: vectors pin cross-cutting money contracts; a
  chart series does not qualify, and adding one would make future chart tweaks read as behavior
  changes.

---

## R7 — What happens to `GoalCard` and `GoalsSummaryCard`

**Decision**: `components/goals/GoalCard.tsx` becomes the hub's per-goal card, gaining an "open"
affordance and a capped recent-contributions list; `components/planning/GoalsSummaryCard.tsx`
renders those cards (behind-first) instead of its own thin `GoalRow`, and its "View all goals"
link is removed — there is no longer an "all goals" page to link to. The full ledger moves to
the detail page.

**Rationale**: `GoalCard` already renders progress, pacing, and a contribution list; the hub's
`GoalRow` is a thinner duplicate of the same information. Collapsing to one card component is
what FR-001/FR-005 ask for and removes a real drift risk (two components computing the same
status text, already visible today: `GoalCard` says "On pace · due {0}" while `GoalRow` says
"On track · due {0}").

**Follow-on cleanups this forces** (each has a test asserting it today, so each is a deliberate
update, not a silent break):
- `test/web/planning-hub.test.tsx` asserts the `/planning/goals` "View all goals" link ×3.
- `components/skeletons/RouteSkeleton.tsx` keys a `skeleton-goals` shape off the
  `/planning/goals` pathname — the route still exists, so the skeleton stays, but it should match
  a detail page rather than a list.
- The `GoalsBody` dashboard widget is untouched — it is a separate surface with its own scope.

---

## R8 — i18n

**Decision**: every new string goes into `web/lib/i18n/{bn,es,ja,zh,ko}.ts` with a guard test
`web/test/i18n/goal-detail-i18n.test.ts` mirroring `routines-i18n.test.ts`. Strings retired with
the old index page (notably `View all goals`) are removed from all five catalogs.

**Rationale**: `test/i18n/catalog-reachability.test.ts` fails on any catalog key with no source
literal, so removing UI copy without removing its keys breaks the suite — the removal is
mandatory, not optional. Placeholder arity is separately pinned by `placeholder-parity.test.ts`.
