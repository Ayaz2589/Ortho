<!-- SPECKIT START -->
Active feature: **spec 032 — PDF data export & import**. Plan:
`specs/032-pdf-data-export/plan.md` (spec/plan/research/data-model/quickstart/contracts alongside it).
Download household data (transactions + housing) as a dual-layer PDF — human-readable pages in any of
6 languages × 7 currencies (default = current) plus an embedded machine-readable JSON payload that is
the source of truth for lossless re-import. Extensible versioned section-registry envelope (future:
widgets/budgets/goals). Import is additive + idempotent with two-tier dedup (canonical id, then the
CSV fuzzy matcher). No schema changes. Stack: `pdf-lib` + `@pdf-lib/fontkit` (generate + attach),
`unpdf` getAttachments (read back), lazy per-language TTF Noto fonts. Payload round-trip + dedup are
headlessly tested; glyph rendering is on-device QA. Prior: spec 031 — category & subcategory expansion
(`specs/031-category-subcategory-expansion/plan.md`). Each shipped spec keeps its `plan.md` for reference.
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
