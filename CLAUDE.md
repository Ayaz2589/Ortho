<!-- SPECKIT START -->
Active feature: **spec 041 — financial health**. Plan:
`specs/041-financial-health/plan.md` (spec/plan/research/data-model/quickstart/contracts alongside it;
design doc `docs/plan/financial-health.md`). A baseline **financial-health metric**: a first-run
questionnaire (income incl. variable/low-estimate; housing incl. shared share; monthly commitments with
a first-class **remittance** kind; safety-net emergency-fund chip; per-dimension 1–5 importance sliders)
feeds the pure engine `web/lib/finance/financialHealth.ts` (+ `financial-health-thresholds.ts`), which
blends the profile with transactions/budgets/goals into a 0–100 score across **five dimensions** (cash
flow, safety net, commitment load, savings momentum, plan engagement), weighted by the user's sliders.
Bands Strong/Steady/Building/Getting started — **calm, never red**, always one next step; profile-first
(works with zero history/no bank). Four **user-scoped** tables (`user_financial_profile`,
`user_fixed_costs`, `user_dimension_weights`, `financial_health_snapshots`; RLS `user_id=auth.uid()`;
migration `20260806120000`). Surfaced as a dashboard **widget** (`FinancialHealthBody`, registry
`financial-health`) with a baseline-vs-now progress line; first-run flow at `welcome/financial-profile`
(shell-gated on profile===null + a localStorage dismissal); re-take at `settings/financial-profile`.
Engine pinned by unit/property tests (not a golden vector). This is feature one of two — the deferred
**Purchase Advisor** (`docs/plan/purchase-advisor.md`) will consume this engine. Fully TDD.
Prior shipped: **spec 040 — global text size**. Plan:
`specs/040-text-size/plan.md` (spec/plan/research/data-model/quickstart/contracts alongside it).
A per-device **Text size** setting that scales the whole UI proportionally via a `zoom` on `<html>`
(the app is not rem-based, so `zoom` is the reliable lever). Four levels — Small (1.00, today's
density) / **Medium (1.06, new default — a subtle global bump)** / Large (1.14) / X-Large (1.22).
Single source of truth `web/components/settings/textSize.ts` (`read/write/applyTextSize` +
`textSizeBootScript`), mirroring `appearance.ts`: a pre-paint `TEXT_SIZE_BOOT` in `app/layout.tsx`
(no flash) and re-apply at shell mount in `app/(app)/layout.tsx`. Picker at
`settings/text-size/page.tsx`, registered in `settings/page.tsx` + `SettingsSecondaryNav.tsx`; 6
strings × 5 catalogs. Motivated by the lower-income/older launch market (docs/research). Fully TDD.
Standardized `zoom` (Baseline 2024) rescales the CSS pixel, so `h-dvh`/fixed tab bar don't overflow
(needs one manual in-browser visual confirm — quickstart.md).
Prior shipped: **spec 038 — planning hub** (`specs/038-planning-hub/plan.md`): Planning promoted to a
fifth top-level destination, a month-scoped hub over the pure `web/lib/planning/planSummary.ts` engine.
**spec 039 — settings-shortcut widgets** and **spec 036 — housing widgets** also shipped. Prior:
**spec 035 — dashboard scope foundation**
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
