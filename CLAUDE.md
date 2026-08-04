<!-- SPECKIT START -->
Active feature: **spec 038 — planning hub**. Plan:
`specs/038-planning-hub/plan.md` (spec/plan/research/data-model/quickstart/contracts alongside it).
Promotes **Planning** from a Settings sub-page to a **fifth top-level destination** (tab + sidebar,
after Transactions) and rebuilds it as a month-scoped hub: a "Left to plan" health hero (income −
base budget allowances − planned goal contributions), a pace-aware budget summary, a goals summary
(behind-first, with catch-up amounts), and a non-monthly sinking-funds panel. All math is the pure
`web/lib/planning/planSummary.ts` engine (reuses `budgetStatusForMonth` + `goalPacing`; no schema
change). The old `/settings/planning` route client-redirects to `/planning`. Touches: `Sidebar.tsx`,
`TabBar.tsx`, `components/planning/*`, `app/(app)/planning/page.tsx`, `settings/{page,planning}`,
`SettingsSecondaryNav.tsx`, `RouteSkeleton`, 5 i18n catalogs. Fully TDD.
Prior shipped: **spec 035 — dashboard scope foundation**
(`specs/035-dashboard-scope-foundation/plan.md`): one shared month/range scope across dashboard widgets
via `web/lib/useDashboardRange.ts` + `web/lib/widgets/DashboardScopeContext.tsx` (+ `web/lib/dashboard/`).
Prior: **spec 034 — widget system foundation** (`specs/034-widget-system-foundation/plan.md`): the old
"Overview | Reports" mode is gone — the dashboard is now a single-view toggleable widget board (registry
`web/lib/widgets/`, spend heatmap `web/lib/dashboard/spendHeatmap.ts`); widgets toggle per-browser in
Settings → Widgets. Prior: **spec 033 — income deposit accounts**
(`specs/033-income-deposit-accounts/plan.md`, spec/plan/data-model/quickstart/contracts alongside it).
Replaced the hardcoded `INCOME_SOURCES` constant in `TxForm.tsx` with a user-configurable `deposit_accounts`
table (mirrors `cards`). Users add/delete named deposit accounts in Settings → Deposit Accounts. The
"Deposit to" dropdown on income transactions shows configured accounts. No transactions schema change —
`source` already stores the string name. Touched: new migration, `web/lib/store.tsx`, `TxForm.tsx`,
`AddDepositAccountModal.tsx`, `settings/deposit-accounts/page.tsx`, `settings/page.tsx`, 5 i18n catalogs.
Prior: **spec 032 — most-common copy + merchant name suggestions** (`specs/032-common-copy-name-suggest/plan.md`):
rework the New-form copy shortcut (frequency-selects most-common merchants, grouped by category then
alphabetically), relabeled "Copy from most common"; kind-aware merchant/payer name suggestions via
`<datalist>` on Add + Edit. Also: **spec 032 — content-shaped loading skeletons** (`specs/032-loading-skeletons/plan.md`):
calm motionless placeholder skeletons matching each route's shape, sized from the previous load's item
count (`localStorage` `ortho.skeletonCounts`); token-only `Skeleton` primitive + `RouteSkeleton`.
**spec 032 — PDF data export & import** (`specs/032-pdf-data-export/plan.md`): download household data as
a dual-layer PDF (human-readable + embedded machine-readable payload) in 6 languages × 7 currencies and
re-import with two-tier dedup; `web/lib/dataFile/` + Settings → Data. Prior: spec 031 — category &
subcategory expansion (`specs/031-category-subcategory-expansion/plan.md`). Each shipped spec keeps its
`plan.md` for reference.
<!-- SPECKIT END -->

## Project documentation

Deep-dive docs live in `docs/`. **Read `docs/index.md` first** — it maps how web, supabase,
shared, and the frozen iOS app fit together, the regression-vector system, the env vars/keys each
surface needs, and what a fresh (Linux) sandbox can and cannot do (no Xcode — iOS builds are
macOS-only). Per-subsystem deep dives: `docs/web.md`, `docs/finance.md`, `docs/supabase.md`,
`docs/shared.md`, `docs/makefile.md`, `docs/ios.md`. Consult the relevant doc before working in a
subsystem, and update it when your change makes it stale.

## iOS builds & CI (Linux sandboxes cannot build iOS)

iOS ships the web bundle via a Capacitor shell (spec 021) — there is no live
native app to test. iOS feedback comes from GitHub Actions:
`.github/workflows/capacitor-ios-ci.yml` build-verifies the Capacitor iOS
project (`web/ios/App/`) on a macOS runner for pushes/PRs touching `web/**`.
The frozen native app's `.github/workflows/ios-ci.yml` is manual-trigger-only
and build-only (no tests) — an on-demand "does it still compile" check. After
pushing, watch runs with `GH_TOKEN=placeholder gh run watch --exit-status`
(the placeholder is required for `gh` in sandboxes; the proxy injects the real
token). If the gitignored `CI-SETUP.local.md` exists at the repo root, read it
— it has the full CI usage guide plus local credentials for bootstrapping a
fresh sandbox.

## Session continuity

At the start of a session, if `.claude/context-summaries/latest.md` exists, read
it to recover state from the previous session (what we worked on, recent
decisions, current state, and what's pending). It is written by the `/remember`
skill and is the most recent session's handoff. Dated summaries alongside it in
`.claude/context-summaries/` are older handoffs, kept for history. On a fresh checkout the
directory may be empty, so a missing `latest.md` is normal — just start without a handoff.
