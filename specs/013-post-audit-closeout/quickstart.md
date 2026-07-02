# Quickstart: Validating Post-Audit Closeout

**Feature**: `013-post-audit-closeout` — per-story validation runbook. Contracts under
[./contracts/](./contracts/) define the details; this is how to prove each one works.

## Prerequisites

```bash
cd web && npm install           # Node 22 (.nvmrc); Linux ARM may need @rolldown/binding-linux-arm64-gnu
# web/.env.local with NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY (see CI-SETUP.local.md §5)
export GH_TOKEN=placeholder     # gh CLI in the sandbox (proxy injects the real token)
```

A **draft PR** for `013-post-audit-closeout` must exist — ios-ci.yml runs on `pull_request` for
any branch, but on `push` only for main.

## US1 — iOS translations

```bash
cd web && npx vitest run test/i18n/catalog-parity.test.ts   # C1–C4: coverage, identity, bn digits
```
Then (after the batched Swift push): watch CI, download `simulator-screenshots`, inspect the
per-language shots (Settings + Dashboard in all five languages; four tabs in bn + one CJK):

```bash
GH_TOKEN=placeholder gh run watch --exit-status
GH_TOKEN=placeholder gh api repos/Ayaz2589/Ortho/actions/runs/<run>/artifacts   # get id
GH_TOKEN=placeholder gh api repos/Ayaz2589/Ortho/actions/artifacts/<id>/zip > shots.zip && unzip shots.zip
```
Expected: no English fallbacks, no tofu, Latin digits under বাংলা.

## US2 — Legacy date repair (live data — operator-gated)

```bash
make repair-dates                 # DRY RUN (default): report only, zero writes
# → deliver report to the operator; on their explicit go-ahead only:
make repair-dates APPLY=1         # prompts: type "repair" to proceed
make repair-dates                 # re-run: expect "0 repairable" (idempotence, SC-002)
```
Unit level: `npx vitest run test/maintenance/repair-legacy-dates.test.ts` (window boundaries,
DST, ambiguity band, no-write dry run).

## US3 — Insight parity

```bash
cd web && npm run gen:vectors     # adds preview_merchants; diff insights.json — id/severity/
git diff shared/test-vectors/     #   category/magnitude_cents must be UNCHANGED (FR-008)
npx vitest run test/insights.parity.test.ts test/insights.test.ts
```
iOS side proven in the batched CI run (InsightParityTests asserts preview_merchants).

## US4 — availableRanges vector

```bash
cd web && npm run gen:vectors && git diff shared/test-vectors/dashboard-month-scope.json
npx vitest run test/dashboard-scope.parity.test.ts
```
Mutation check (once, during dev): flip `>=` in `range.ts availableRanges`, expect the suite
red, revert. iOS assertion runs in the batched CI push (SC-004).

## US5 — CLI alignment

```bash
cd web && npx vitest run test/import/            # includes new red-first suites
make tx-list MONTH=2026-06 LIMIT=5               # truncation notice is explicit
make tx-list QUERY=coffee                        # free-text now works
```
SC-005 contract test compares CLI result ids against shared `filterTransactions` output.

## US6 — Web translation QA

```bash
cd web && npx vitest run test/i18n/ && npm test  # structure + no-fallback locks; full suite green
```
Visual overflow pass (operator-assisted — sandbox has no browser): `npm run dev`, user opens
Español and 日本語, walks the four destinations + add/edit at compact and desktop widths.
Findings fixed in the catalogs, then re-run the suites.

## US7 — TestFlight pipeline

```bash
actionlint .github/workflows/ios-deploy.yml
GH_TOKEN=placeholder gh workflow run ios-deploy.yml --ref 013-post-audit-closeout
GH_TOKEN=placeholder gh run watch --exit-status   # expect: preflight FAILS < 60 s naming all 7 secrets
```
Owner setup: follow `docs/deploy.md`; once secrets exist, re-trigger and expect a TestFlight
build (post-credentials — outside this feature's automated verification).

## Full gates (every story)

```bash
cd web && npx tsc --noEmit && npm test            # web gate: everything green
GH_TOKEN=placeholder gh run watch --exit-status   # iOS gate: batched CI run green
```
Finish: reconcile `PARITY.md` (FR-020) and refresh `docs/` pages made stale.
