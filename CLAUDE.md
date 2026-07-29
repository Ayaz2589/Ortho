<!-- SPECKIT START -->
Active feature: **spec 032 — most-common copy + merchant name suggestions**. Plan:
`specs/032-common-copy-name-suggest/plan.md` (spec/plan/data-model/quickstart/contracts alongside it).
Two additive, client-side improvements to the shared add/edit transaction form: (1) rework the New-form
copy shortcut (`TxCopyList`) — frequency selects the most-common merchants (one representative most-recent
entry each), presented grouped by category then alphabetically by merchant within each — and relabel it
"Copy from most common"; (2) add kind-aware merchant/payer name
suggestions (a native `<datalist>`) to the form's name input on Add + Edit, expense + income. New pure
module `web/lib/txSuggest.ts` reuses the tested `rankedMerchants`/`suggestMerchants` from
`web/lib/csv/merchantSuggest.ts`. Touches: `TxForm.tsx`, `TxFormPageClient.tsx`, 5 i18n catalogs; no
DB/schema change; money/splits logic untouched. Fully TDD.
(Note: three parallel branches took the "032" prefix — see also `specs/032-loading-skeletons/` and
`specs/032-pdf-data-export/`, both shipped on main.)
Prior shipped: **spec 032 — content-shaped loading skeletons** (`specs/032-loading-skeletons/plan.md`):
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
`.claude/context-summaries/` are older handoffs, kept for history.
