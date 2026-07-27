<!-- SPECKIT START -->
Active feature: **spec 032 — content-shaped loading skeletons**. Plan:
`specs/032-loading-skeletons/plan.md` (spec/plan/data-model/quickstart/contracts alongside it).
Replaces the bare "Loading…" strings (whole-shell bootstrap gate in `web/app/(app)/layout.tsx` and the
Reports views) with calm, motionless placeholder skeletons matching each route's shape; dynamic
list/table surfaces (Transactions/Goals/Housing/Reports rows) are sized from the previous successful
load's item count, persisted in `localStorage` (`ortho.skeletonCounts`). Adds a token-only `Skeleton`
primitive (no shimmer — constitution Principle IV), `lib/skeletonCounts.ts`, and a pathname-keyed
`RouteSkeleton` dispatcher. Prior in-flight sibling: spec 031 — category & subcategory expansion
(`feat/031-category-subcategory-expansion`). Prior shipped: spec 030 — holistic seed system
(`specs/030-holistic-seed-auth/plan.md`). Each shipped spec keeps its `plan.md` for reference.
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
