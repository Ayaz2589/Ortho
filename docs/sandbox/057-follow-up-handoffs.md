# Spec 057 — six follow-up panel sandboxes (ready-to-fire handoffs)

> Prepped 2026-08-22. **MODE: branched off the base branch (#119 not yet merged to `main`).**
> The six sandboxes below are already created (clone mode, `-m 4g` each) and each branches off
> `feat/057-widget-detail-panels`, so they have the frame + kit + `Panel?` field + pre-carved i18n
> today. Trade-off (chosen deliberately over waiting): once #119 merges to `main`, each panel branch
> must be **rebased onto `origin/main`** before its PR opens. The follow-up brief advises waiting;
> we're not, so mind the rebase.
>
> Source of truth on the branch: `specs/057-widget-detail-panels/contracts/{panel-contract,follow-up-brief}.md`.
> If a prompt below and those contracts ever disagree, the **branch wins**.
> Host-side ops doc (like `sandbox-history.md`); not part of the feature.

## The six sandboxes (already created)

| Sandbox | Branch (off `feat/057-widget-detail-panels`) | Panel |
|---|---|---|
| `panel-pace` | `feat/057-panel-spending-pace` | US4 Spending pace |
| `panel-savings` | `feat/057-panel-savings-trends` | US5 Savings trends |
| `panel-merchants` | `feat/057-panel-top-merchants` | US6 Top merchants |
| `panel-balances` | `feat/057-panel-household-balances` | US7 Who owes whom |
| `panel-housing` | `feat/057-panel-housing-costs` | US8 Housing costs |
| `panel-goals` | `feat/057-panel-goals` | US9 Goals |

## How to start each one

1. **Enter it** (host terminal) — drops you into the Claude agent inside the sandbox:
   ```bash
   sbx run --name panel-pace
   ```
2. **Paste that panel's prompt** (the quote-block under its heading below) into the agent and press
   enter. The agent bootstraps itself (branch off the base, `npm ci`, local Supabase, `.env.local`),
   then builds the panel TDD, commits, and pushes.

**RAM:** each sandbox is capped at 4g, but each also spins up its own local Supabase on bootstrap.
Six at once is heavy — **stagger**: enter/paste 2–3 at a time, or reuse a finished sandbox before
starting the next. Reconnect anytime with `sbx run --name <sandbox>`.

**Merging:** the base (#119) must land on `main` first. Until then, agents push their panel branch
but **hold the PR**. After #119 merges: `git fetch origin && git rebase origin/main` in each panel
sandbox, then open its PR to `main`. Merge them one at a time; the only expected conflict is the
single `registry.tsx` line. Tear each down with `/kill-sandbox feat/057-panel-<slug>` once merged.

---

## US4 — Spending pace · `panel-pace`

```bash
sbx run --name panel-pace
```

> You're building ONE widget detail panel in the Ortho web app, in an in-container clone. Spec 057's
> base lives on branch `feat/057-widget-detail-panels` (NOT yet merged to main) — it has the frame
> (`WidgetPanel`), the kit (`@/components/widgets/panels/kit`), the `Panel?` registry field, and your
> reserved i18n sub-block. You branch off that base branch so you have all of it today.
>
> **Setup first (branch off the base branch, then bootstrap):**
> ```
> git fetch origin && git checkout -B feat/057-panel-spending-pace origin/feat/057-widget-detail-panels
> ./.claude/skills/docker-sandbox/bootstrap-sandbox.sh
> cd web && npm test   # sanity: base suite green
> ```
>
> **Workflow (required):** This is part of the already-specced feature 057 — do NOT create a new
> `specs/NNN` dir. Read `specs/057-widget-detail-panels/contracts/panel-contract.md` (the binding
> frame↔panel agreement) and `contracts/follow-up-brief.md` (your assignment), then `spec.md` for
> user story **US4**, BEFORE writing code. Work fully TDD: write the panel test FIRST (RED) at
> `web/test/widgets/panels/spending-pace-panel.test.tsx`, implement to green, refactor.
>
> **Your panel — US4 Spending pace (`SpendingPacePanel`).** The question the card cannot answer:
> the card shows one ±% vs the prior 30 days — that single number hides a dozen category movements
> in both directions. Surface the **biggest movers** (the highest-value part — do not stop at a flat
> category list). Honours **both** axes (time + people). Engine: `rankCategories`
> (`lib/reports/categories.ts`); the spending-pace **body already computes the 60-day series and
> discards the prior 30** — reuse that, don't re-bucket. No route-out. Watch (FR-021): an increase
> must read **no more alarmingly than a decrease** — no red, no alarm colour.
>
> **You own exactly four touch points, nothing else:**
> - NEW `web/components/widgets/panels/SpendingPacePanel.tsx`
> - NEW `web/test/widgets/panels/spending-pace-panel.test.tsx`
> - ONE line in `web/lib/widgets/registry.tsx`: add `Panel: SpendingPacePanel,` to the spending-pace widget entry
> - your reserved i18n sub-block in all 5 catalogs — `grep -n "US4" web/lib/i18n/es.ts` to find the marker, add keys directly under it in each of `{bn,es,ja,ko,zh}.ts`; touch no other sub-block
>
> **Never touch (contract §4):** `WidgetBoard`/`Widget`/`WidgetPanel`/`dashboard/page.tsx`; any
> existing kit primitive (append-only — add a NEW kit file if you need one, never modify); any other
> panel's i18n sub-block; any pre-existing test under `web/test/widgets/`; any widget card's output.
> Don't fetch (derive from loaded data). No projection stated as fact.
>
> **Panel shape:** propless. Inside it use `useApp()`, `useDashboardScopeContext()` (time),
> `useScopedTransactions(all)` (people), and the frame hooks from `@/components/widgets/WidgetPanel`:
> `usePanelCaption({ subject?, period? })` (C-1 — declare ONLY the axes you honour), and optionally
> `usePanelRouteOut`/`usePanelDetail`. Empty state via `<PanelEmpty>` matching the card (C-2). In
> tests wrap the panel in `<WidgetPanel open title=… onClose=…>` (the hooks throw outside it).
>
> **Done:** tests first + green (empty state + both scope cases); `git status --short web/test/widgets/`
> shows only files you added; diff = one shared registry line + your catalog sub-block; no kit
> primitive modified; copy in all 5 catalogs; verified phone + desktop widths; `npm test` green,
> `tsc --noEmit` clean, no golden-vector drift. Then commit and push to `feat/057-panel-spending-pace`.
> **Do NOT open a PR to main yet** — main doesn't have the base until #119 merges. After it merges,
> `git fetch origin && git rebase origin/main`, then open the PR to `main`. Work only in the writable
> clone (not `/run/sandbox/source`); push before this sandbox is ever removed.

---

## US5 — Savings trends · `panel-savings`

```bash
sbx run --name panel-savings
```

> You're building ONE widget detail panel in the Ortho web app, in an in-container clone. Spec 057's
> base lives on branch `feat/057-widget-detail-panels` (NOT yet merged to main) — it has `WidgetPanel`,
> the kit (`@/components/widgets/panels/kit`), the `Panel?` registry field, and your reserved i18n
> sub-block. You branch off that base branch.
>
> **Setup first:**
> ```
> git fetch origin && git checkout -B feat/057-panel-savings-trends origin/feat/057-widget-detail-panels
> ./.claude/skills/docker-sandbox/bootstrap-sandbox.sh
> cd web && npm test
> ```
>
> **Workflow (required):** Part of already-specced feature 057 — do NOT create a new `specs/NNN` dir.
> Read `specs/057-widget-detail-panels/contracts/panel-contract.md` and `contracts/follow-up-brief.md`,
> then `spec.md` for **US5**, before writing code. Fully TDD: test FIRST (RED) at
> `web/test/widgets/panels/savings-trends-panel.test.tsx`, then green, then refactor.
>
> **Your panel — US5 Savings trends (`SavingsTrendsPanel`).** The question the card cannot answer: a
> savings rate is a ratio and the card discards **both terms**. Show income and expense terms behind
> the rate over time. Honours **both** axes. Engines: `savingsRate`, `buildSavingsSeries`
> (`lib/reports/savings.ts` — `buildSavingsSeries` is currently unused here). The savings-trends
> **body already buckets income and expense per month and keeps only the rate** — reuse that shape,
> don't re-bucket. Watch: a shortfall reads by **sign and position, never colour**.
>
> **You own exactly four touch points:**
> - NEW `web/components/widgets/panels/SavingsTrendsPanel.tsx`
> - NEW `web/test/widgets/panels/savings-trends-panel.test.tsx`
> - ONE line in `web/lib/widgets/registry.tsx`: `Panel: SavingsTrendsPanel,` on the savings-trends widget entry
> - reserved i18n sub-block in all 5 catalogs — `grep -n "US5" web/lib/i18n/es.ts`, add keys under the marker; no other sub-block
>
> **Never touch / panel shape:** identical to the common contract — `WidgetBoard`/`Widget`/
> `WidgetPanel`/`dashboard/page.tsx`, existing kit primitives (append-only), other panels' i18n, and
> pre-existing `web/test/widgets/` suites are off-limits; no fetch; no colour; propless panel using
> `useApp`/`useDashboardScopeContext`/`useScopedTransactions` + `usePanelCaption` (declare only the
> axes you honour) + optional `usePanelRouteOut`/`usePanelDetail`; `<PanelEmpty>` for C-2; wrap in
> `<WidgetPanel open title=… onClose=…>` in tests.
>
> **Done:** tests first + green (empty + both scope cases); diff = one registry line + your catalog
> sub-block; copy in all 5 catalogs; phone + desktop verified; `npm test` green, `tsc --noEmit`
> clean. Commit + push to `feat/057-panel-savings-trends`. **No PR to main yet** — after #119 merges,
> `git fetch origin && git rebase origin/main`, then PR to `main`. Writable clone only; push before removal.

---

## US6 — Top merchants · `panel-merchants`

```bash
sbx run --name panel-merchants
```

> You're building ONE widget detail panel in the Ortho web app, in an in-container clone. Spec 057's
> base lives on branch `feat/057-widget-detail-panels` (NOT yet merged to main) — frame, kit,
> `Panel?` field, and your reserved i18n sub-block are all there. You branch off that base branch.
>
> **Setup first:**
> ```
> git fetch origin && git checkout -B feat/057-panel-top-merchants origin/feat/057-widget-detail-panels
> ./.claude/skills/docker-sandbox/bootstrap-sandbox.sh
> cd web && npm test
> ```
>
> **Workflow (required):** Part of feature 057 — no new `specs/NNN` dir. Read `panel-contract.md` +
> `follow-up-brief.md`, then `spec.md` for **US6**, before code. Fully TDD: test FIRST at
> `web/test/widgets/panels/top-merchants-panel.test.tsx`.
>
> **Your panel — US6 Top merchants (`TopMerchantsPanel`).** The question the card cannot answer: rows
> **6 and beyond**, and **which merchants are subscriptions**. Honours **both** axes. Engines:
> `detectRoutines` / `normalizeMerchantKey` (`lib/finance/routines.ts`) — the **recurring flag is the
> new insight**; a longer list alone barely satisfies C-3. **Uses the second level** (C-3 /
> `usePanelDetail`): per-merchant detail. **Route out** (C-4 / `usePanelRouteOut`): transactions,
> filtered by merchant. Summarise and hand off — don't rebuild the transactions screen.
>
> **You own exactly four touch points:**
> - NEW `web/components/widgets/panels/TopMerchantsPanel.tsx`
> - NEW `web/test/widgets/panels/top-merchants-panel.test.tsx`
> - ONE line in `web/lib/widgets/registry.tsx`: `Panel: TopMerchantsPanel,` on the top-merchants widget entry
> - reserved i18n sub-block in all 5 catalogs — `grep -n "US6" web/lib/i18n/es.ts`
>
> **Never touch / panel shape:** per the common contract (see US4/US5). Note the second-level content
> unmounts the list beneath it — keep detail views to derived data, not state you need preserved.
>
> **Done:** tests first + green (empty + both scope cases + the per-merchant detail); diff = one
> registry line + your sub-block; all 5 catalogs; phone + desktop; `npm test` + `tsc` clean. Commit +
> push to `feat/057-panel-top-merchants`. **No PR to main yet** — after #119 merges, rebase onto
> `origin/main`, then PR to `main`. Writable clone only; push before removal.

---

## US7 — Who owes whom · `panel-balances`

```bash
sbx run --name panel-balances
```

> You're building ONE widget detail panel in the Ortho web app, in an in-container clone. Spec 057's
> base lives on branch `feat/057-widget-detail-panels` (NOT yet merged to main) — frame, kit,
> `Panel?` field, reserved i18n sub-block all there. You branch off that base branch.
>
> **Setup first:**
> ```
> git fetch origin && git checkout -B feat/057-panel-household-balances origin/feat/057-widget-detail-panels
> ./.claude/skills/docker-sandbox/bootstrap-sandbox.sh
> cd web && npm test
> ```
>
> **Workflow (required):** Part of feature 057 — no new `specs/NNN` dir. Read `panel-contract.md`
> (**including §5, which is about YOUR panel**) + `follow-up-brief.md`, then `spec.md` for **US7**,
> before code. Fully TDD: test FIRST at `web/test/widgets/panels/household-balances-panel.test.tsx`.
>
> **Your panel — US7 Who owes whom (`HouseholdBalancesPanel`).** The question the card cannot answer:
> **why** the debt exists and the **shortest way to end it**. Honours **neither** axis — a debt is a
> standing position and does not expire at month end; caption accordingly (omit both). Engines:
> `simplifyDebts`, `allPairBalances`, `outstandingBalances`, `peopleInLedger`
> (`lib/finance/balances.ts`); `simplifyDebts` currently has **no UI consumer at all**. **Uses the
> second level:** per-pair breakdown. **No route out** — and FR-019: do **not** add a settle-up
> action (spec 043 removed that plumbing; restoring it is separate scope).
>
> ⚠️ **THE TRAP (contract §5 — plausible wrong number, no crash):** read the **WHOLE household
> ledger** and narrow only the OUTPUT. **Do NOT call `useScopedTransactions`.** `projectForPerson`
> rewrites every row to `{ amount_cents: <their share>, owner_ids: [personId] }`, which deletes the
> co-ownership a debt derives from — fed projected rows, `outstandingBalances` nets every pair to
> zero and calmly renders "All settled up." for a household that owes money. `HouseholdBalancesBody`
> carries a ⚠️ comment and `test/widgets/household-balances.test.tsx` a guard case — inherit both and
> **write a test that fails if scoping is reintroduced.**
>
> **You own exactly four touch points:**
> - NEW `web/components/widgets/panels/HouseholdBalancesPanel.tsx`
> - NEW `web/test/widgets/panels/household-balances-panel.test.tsx`
> - ONE line in `web/lib/widgets/registry.tsx`: `Panel: HouseholdBalancesPanel,` on the who-owes-whom widget entry
> - reserved i18n sub-block in all 5 catalogs — `grep -n "US7" web/lib/i18n/es.ts`
>
> **Never touch / panel shape:** per the common contract. No colour — a debt is never red (read by
> sign + position).
>
> **Done:** tests first + green (empty "all settled up" state + the un-scoped-ledger guard + per-pair
> detail); diff = one registry line + your sub-block; all 5 catalogs; phone + desktop; `npm test` +
> `tsc` clean. Commit + push to `feat/057-panel-household-balances`. **No PR to main yet** — after
> #119 merges, rebase onto `origin/main`, then PR to `main`. Writable clone only; push before removal.

---

## US8 — Housing costs · `panel-housing`

```bash
sbx run --name panel-housing
```

> You're building ONE widget detail panel in the Ortho web app, in an in-container clone. Spec 057's
> base lives on branch `feat/057-widget-detail-panels` (NOT yet merged to main) — frame, kit,
> `Panel?` field, reserved i18n sub-block all there. You branch off that base branch.
>
> **Setup first:**
> ```
> git fetch origin && git checkout -B feat/057-panel-housing-costs origin/feat/057-widget-detail-panels
> ./.claude/skills/docker-sandbox/bootstrap-sandbox.sh
> cd web && npm test
> ```
>
> **Workflow (required):** Part of feature 057 — no new `specs/NNN` dir. Read `panel-contract.md` +
> `follow-up-brief.md`, then `spec.md` for **US8**, before code. Fully TDD: test FIRST at
> `web/test/widgets/panels/housing-costs-panel.test.tsx`.
>
> **Your panel — US8 Housing costs (`HousingCostsPanel`).** The question the card cannot answer:
> **which property**, and **what share of income**. Axes: honours **neither** on the housing figures
> (a property is a household asset, point-in-time) — **but the income share needs a period, so
> caption that axis honestly** (declare `period` only for the income-share part; C-1 is about being
> honest, not about honouring nothing). Engines: `housingSummary`, `incomeForMonth`
> (`lib/planning/planSummary.ts`). **Route out:** housing. Watch: **omit the income share entirely
> when there is no recorded income** — never zero, never infinite. State the share plainly, with **no
> pass/fail judgement**.
>
> **You own exactly four touch points:**
> - NEW `web/components/widgets/panels/HousingCostsPanel.tsx`
> - NEW `web/test/widgets/panels/housing-costs-panel.test.tsx`
> - ONE line in `web/lib/widgets/registry.tsx`: `Panel: HousingCostsPanel,` on the housing widget entry
> - reserved i18n sub-block in all 5 catalogs — `grep -n "US8" web/lib/i18n/es.ts`
>
> **Never touch / panel shape:** per the common contract. No colour.
>
> **Done:** tests first + green (with-income and **no-income** states — the no-income case must omit
> the share, not show 0/∞); diff = one registry line + your sub-block; all 5 catalogs; phone +
> desktop; `npm test` + `tsc` clean. Commit + push to `feat/057-panel-housing-costs`. **No PR to main
> yet** — after #119 merges, rebase onto `origin/main`, then PR to `main`. Writable clone only; push
> before removal.

---

## US9 — Goals · `panel-goals`

```bash
sbx run --name panel-goals
```

> You're building ONE widget detail panel in the Ortho web app, in an in-container clone. Spec 057's
> base lives on branch `feat/057-widget-detail-panels` (NOT yet merged to main) — frame, kit,
> `Panel?` field, reserved i18n sub-block all there. You branch off that base branch.
>
> **Setup first:**
> ```
> git fetch origin && git checkout -B feat/057-panel-goals origin/feat/057-widget-detail-panels
> ./.claude/skills/docker-sandbox/bootstrap-sandbox.sh
> cd web && npm test
> ```
>
> **Workflow (required):** Part of feature 057 — no new `specs/NNN` dir. Read `panel-contract.md` +
> `follow-up-brief.md`, then `spec.md` for **US9**, before code. Fully TDD: test FIRST at
> `web/test/widgets/panels/goals-panel.test.tsx`.
>
> **Your panel — US9 Goals (`GoalsPanel`).** The question the card cannot answer: the **trajectory**
> and the **projected arrival date**. Honours **time only** (`now`, for pacing) — goals span their
> lifetime, not the scope window. Engines: `cumulativeSeries`, `monthlySeries`
> (`lib/finance/goalSeries.ts`, built for the spec-049 goal detail page), `goalProgress`,
> `goalPacing`. **Route out:** the goal's existing detail page. Watch: **behind pace is a calm accent,
> never red** (X-7); **never state a projection as fact** (X-8 — an arrival date is projected, phrase
> it so). ⚠️ Goals is the subject of a **separate open question** about whether it should be
> person-scoped at all — **do not settle it here and do not assume an answer**; build the household
> view and flag the question if it blocks you.
>
> **You own exactly four touch points:**
> - NEW `web/components/widgets/panels/GoalsPanel.tsx`
> - NEW `web/test/widgets/panels/goals-panel.test.tsx`
> - ONE line in `web/lib/widgets/registry.tsx`: `Panel: GoalsPanel,` on the goals widget entry
> - reserved i18n sub-block in all 5 catalogs — `grep -n "US9" web/lib/i18n/es.ts`
>
> **Never touch / panel shape:** per the common contract.
>
> **Done:** tests first + green (empty "no goals yet" state + on-pace and behind-pace cases,
> asserting the projected date is phrased as a projection, not a fact); diff = one registry line +
> your sub-block; all 5 catalogs; phone + desktop; `npm test` + `tsc` clean. Commit + push to
> `feat/057-panel-goals`. **No PR to main yet** — after #119 merges, rebase onto `origin/main`, then
> PR to `main`. Writable clone only; push before removal.

---

## Parallel-collision notes

- **No DB migrations** in any of the six → none of the usual migration-index collisions.
- **`registry.tsx`** is the only shared file — each adds one `Panel: …,` line. Rebase between merges;
  resolve the one-line conflict trivially.
- **i18n sub-blocks** were pre-carved in registry order in the base, so appends don't collide —
  each sandbox writes only under its own `US<n>` marker.
- **Kit is append-only.** If two panels independently add near-identical primitives, that's correct;
  it gets consolidated in one pass after all six land.
- **Off-base caveat:** because all six are based on `feat/057-widget-detail-panels`, don't open PRs
  to `main` until #119 merges; then rebase each onto `origin/main` first. If #119 changes during its
  own review, rebase the panel branches on the updated base branch too.
