# Research: Post-Audit Closeout

**Feature**: `013-post-audit-closeout` | **Date**: 2026-07-02

All Technical Context unknowns resolved. Each decision below records what the codebase
investigation found and what was chosen.

## R1. iOS translation mechanics (US1)

**Findings**: `iOS/Ortho-iOS/Localizable.xcstrings` is a JSON string catalog
(`sourceLanguage: "en"`, `strings.<key>.localizations.<lang>.stringUnit.{state,value}`).
Languages used: `bn`, `es`, `ja`, `ko`, `zh-Hans`. Current state: 263 keys fully translated in
all five languages; **87 keys have no `localizations` entry at all** (the post-remediation
extractions — includes symbols/numerals like `·`, `1Y`, plus real strings like
`6 income · 6 expenses`), and **6 keys sit at `state: "new"` in en only** (format-only keys like
`%@ owes you %@`). Web catalogs (`web/lib/i18n/{bn,es,ja,ko,zh}.ts`) were seeded from the iOS
catalog with `%@`/`%lld` → `{0}`/`{1}` conversion; 261 shared keys + ~100 web-only keys per file,
separated by a `— web-only keys —` comment.

**Decision**: Author the missing translations by directly editing the `.xcstrings` JSON (it is
plain JSON; Xcode is not required to write it, only to extract keys). For every missing key that
has a web-catalog counterpart, **copy the web value back** (converting `{0}` placeholders to the
iOS specifier the en value uses) so shared strings stay byte-identical. Pure-symbol/numeral keys
(`·`, `0.00`, `1Y`…) get `shouldTranslate: false` (the xcstrings mechanism for
not-a-translatable-string) rather than five copies of themselves. TDD lock: a **new web Vitest
suite** (`web/test/i18n/catalog-parity.test.ts`) parses `Localizable.xcstrings` from the repo
(it's plain JSON on disk, readable from Vitest) and asserts (a) zero missing/`state:"new"`
non-en entries for translatable keys, and (b) shared keys are identical between the iOS catalog
and each web catalog after placeholder normalization. This runs on the Linux sandbox — instant
feedback — and iOS CI validates the catalog still compiles + screenshots render.

**Alternatives considered**: Xcode localization export/import (`xcloc`) — requires macOS,
rejected. Leaving symbol keys untranslated-but-listed — rejected; `shouldTranslate: false` is the
catalog's own idiom and removes them from every future coverage count.

## R2. Per-language CI screenshots (US1, US6 evidence)

**Findings**: CI screenshots launch via `xcrun simctl launch "$UDID" "$BUNDLE_ID" -uiDemo
-uiDemoTab "$TAB"` (ios-ci.yml:106-111). App language is an `@AppStorage("language")` value read
by `AppLanguage`; no per-language override exists today. `simctl launch` passes launch arguments
to the process, and iOS honors `-AppleLanguages (bn)` / `-AppleLocale` user defaults overrides —
but Ortho's language is app-managed, not system, so the clean hook is a DEBUG-only
`-uiDemoLanguage <code>` launch argument (same pattern as `-uiDemoTab`).

**Decision**: Add `-uiDemoLanguage <bn|es|ja|zh-Hans|ko>` DEBUG launch argument that overrides
the stored `AppLanguage`; extend the CI screenshot matrix to capture the four tabs in en plus a
rotating language set (all five languages × dashboard + settings, to keep run time sane, plus
all four tabs in one CJK and bn). Screenshot review from the sandbox is the acceptance evidence
for US1/SC-001's visual half.

**Alternatives considered**: `simctl spawn defaults write AppleLanguages` — changes the whole
simulator, slower (respring), and doesn't exercise Ortho's own language plumbing. Rejected.

## R3. Legacy-row audit/repair (US2)

**Findings**: `transactions.date` is `timestamptz` (initial_schema.sql:86). The convention is
noon UTC of the picked local day (web `TxForm.tsx:339`, iOS `AddTransactionSheet.swift:527-549`).
Pre-fix, iOS saved the picker's wall-clock instant; evening entries in America/New_York land at
23:00–04:59Z on the **next** UTC day. The 00:00–04:00Z window is the unambiguous wrong-day
signature (EST evenings 19:00–23:00 → 00:00–04:00Z; EDT 20:00–23:59 → 00:00–03:59Z). The CLI
already has the client factory to reuse: `web/scripts/import/db/client.ts` (`makeClient` — email
OTP or `ADMIN=1` service-role), and the `--dry-run`/confirmation-gate conventions live in
`cli.ts`/`tx.ts`. **The service-role key is not stored on this machine** (placeholder in
`web/.env.local`), so the script must run through the operator's OTP session by default.
Blast radius of changing `date`: month scoping, insights bucketing, list grouping — that is the
point (rows move back to the day the user picked); shares/balances are date-independent.

**Decision**: New standalone script `web/scripts/maintenance/repair-legacy-dates.ts` + Make
target `repair-dates` (`DRY_RUN=1` default-on; `APPLY=1` required to write; reuses `makeClient`).
Selection: rows where the UTC time-of-day is **not** 12:00:00 **and** falls in `[00:00, 04:00)Z`.
Correction: local calendar day computed per-instant via `Intl.DateTimeFormat` with
`timeZone: 'America/New_York'` → write `<local-day>T12:00:00.000Z`. Ambiguity flag: rows whose
computed NY local time falls in 00:00–01:00 (could genuinely be a just-after-midnight entry
rather than an evening one) are reported but **excluded** from `APPLY`, per spec FR-006.
Idempotent: repaired rows are noon UTC, which the selector excludes. TDD: pure functions
(`selectLegacyRows`, `proposeRepair`) extracted and unit-tested in Vitest with mocked rows
(including DST boundaries, exactly-04:00Z, exactly-noon, already-repaired); the Supabase I/O
wrapper is tested with the existing mock-builder pattern from `web/test/import/`.

**Alternatives considered**: SQL migration doing the rewrite server-side — rejected: no dry-run
review surface, and migrations run on `supabase db push` without an operator gate. Requiring the
service-role key — rejected as default (key not present); OTP session works because household
members can update household rows under RLS, `ADMIN=1` remains available.

## R4. Insight-text parity (US3)

**Findings**: Recurring preview — web (`web/lib/finance/insights.ts:209-231`) iterates the
merchant Map in insertion order, takes the **oldest** transaction's casing, and does **not**
sort names; iOS (`InsightEngine.swift:286-346`) sorts detected merchants by monthly amount
descending, takes the **most recent** transaction's casing. Outlier date — web hardcodes
`Intl.DateTimeFormat('en-US', …)` (`insights.ts:267-269`); iOS uses pattern `MMM d` with
`Localizer.currentLocale`. The insights golden vector pins only
`{id, severity, category, magnitude_cents}` (gen-vectors.ts:220-225) — body strings are
deliberately unvectored. iOS is canonical.

**Decision**: Change **web only**: (a) sort recurring merchants by monthly amount descending
before slicing 3, tie-broken deterministically by case-insensitive merchant name (mirror the
identical tie-break into iOS's `detected.sort` — the only Swift edit in this story); use the most
recent transaction's casing; (b) `generateInsights` already receives a locale-capable `tr`; pass
the display locale into the outlier date formatting (thread `locale` as a parameter with `en-US`
as the explicit caller-supplied value from tests, never a hardcode). Extend the **insights
golden vector** `expected` with a new `preview_merchants: string[]` field (ordering + casing are
cross-surface logic, exactly what vectors are for) — body strings themselves stay per-surface
(localized). TDD: regenerate vectors after adding the field; web + iOS parity suites both gain
the assertion; failing first on iOS is proven by CI run.

**Alternatives considered**: Vectoring the full body string — rejected: bodies are localized
per-surface, vectors must stay language-neutral. Fixing iOS to match web — rejected: iOS is
canonical and amount-descending is the deliberate "highest burn first" behavior.

## R5. availableRanges golden vector (US4)

**Findings**: TS `availableRanges(transactions, now)` at `web/components/dashboard/range.ts:84-99`
(month-index difference vs `monthCount(r) - 1`); Swift computed property at
`AppState.swift:684-698` — but the pure logic mirror belongs in `DashboardRange.swift` (where
`availableMonths`/`monthReferenceDate`/`stepMonth` live and are already vectored via
`dashboard-month-scope.json`). A new vector **file** needs pbxproj edits (PBXFileReference +
PBXBuildFile + group + Resources phase — all plain-text, existing entries at project.pbxproj:42-55
and 228-234 show the exact shape); an added case/field in an **existing** file needs none.

**Decision**: Extend the existing `dashboard-month-scope.json` vector (add an
`availableRanges` section: cases = empty history, single month, 2/5/11/12/13-month spans, gap
months, year boundary, future-dated tx) rather than creating an eighth file — zero pbxproj risk,
and availableRanges is the same "month scope" capability family. Refactor iOS: extract the pure
`availableRanges(transactions:now:)` function into `DashboardRange.swift`; `AppState` property
delegates to it. `DashboardScopeParityTests.swift` and the web parity suite both assert the new
section. TDD order: add generator cases + web assertions (red on web if logic wrong) → mirror
Swift extraction + assertions → single CI push proves iOS green.

**Alternatives considered**: New `available-ranges.json` file — workable (pbxproj is
hand-editable, CI validates) but strictly more moving parts for the same coverage. Rejected.

## R6. CLI alignment (US5)

**Findings** (all with line refs): `listTransactions` builds SQL per-flag, non-admin scopes
`created_by = userId`, default `.limit(200)` silent (`db/transactions.ts:23-38`); the apps'
`filterTransactions(txs, criteria, ctx)` supports free-text/multi-select/owners
(`web/lib/transactionFilters.ts:41-58`). `persist()` throws with no parent rollback
(`db/persist.ts:29-42`); web's compensation pattern is in `store.tsx addTransaction`.
`validateCustomSplit` requires exactly 100 (`engine/split.ts:15-31`) vs shared ±0.5
(`lib/splits.ts:77-86`, `PERCENT_TOLERANCE = 0.5`). `CATEGORY_LIST` hardcoded twice
(`engine/filters.ts:5-8`, `cli.ts:21-24`) vs `lib/types.ts` union. Existing CLI test suite +
mock-builder pattern in `web/test/import/` is mature.

**Decision**:
- **Filtering**: fetch household-wide rows server-side with only the date window (broadest
  criterion) in SQL, then run the shared `filterTransactions` in-process for
  query/category/source/kind/owner semantics — one filtering brain, CLI gains free-text/owner/
  multi-select for free. Non-admin scope becomes household-wide (resolve household membership
  like the apps; `resolveHousehold` already exists in `db/lookups.ts`). Row cap: keep a `LIMIT`
  flag but make truncation explicit in output ("showing 200 of 483 — pass LIMIT= to raise").
- **Atomic write**: `persist()` compensates like the apps — on shares failure, delete the
  just-inserted parent, then throw.
- **Split tolerance**: `validateCustomSplit` delegates to shared `validateSplit` (adapting the
  return shape), inheriting ±0.5.
- **Categories**: derive a single `CATEGORY_LIST` from a new exported const array in
  `lib/types.ts` (type derives from the array via `typeof[number]`, so the union and list can
  never drift); both CLI copies import it.
- **--admin**: documented in PARITY.md as by-design (no code change).
All TDD-able on-sandbox in Vitest; no iOS involvement.

**Alternatives considered**: Reimplementing multi-select/text in SQL — rejected: that is the
divergence being removed. Postgres RPC for atomic writes — the *right* long-term fix but a schema
change touching all three surfaces; out of scope, stays a PARITY.md note.

## R7. Web translation QA (US6)

**Findings**: ~100 web-only keys per language after the `— web-only keys —` marker in each
catalog; terminology anchor is the iOS-seeded block above it. Web renders at compact/desktop;
languages switch via Settings (`language.ts` locale map, bn pinned `bn-BD-u-nu-latn`).

**Decision**: Terminology review = per-language subagent pass comparing web-only values against
the iOS-seeded block's vocabulary (product nouns: household, split, settle up, budget, housing
terms), fixes applied directly to the catalogs. The catalog-parity Vitest suite (R1) locks
structure (no missing keys vs en usage — it can also extract `t('…')` call sites); rendering
check = Playwright-less manual pass using the existing dev server + the user's browser is NOT
available from the sandbox, so: use the web test suite's jsdom render of key screens under es/ja
where feasible for "no English fallback" assertions, and flag the visual overflow pass as an
operator-assisted step (user's browser) documented in quickstart.md.

**Alternatives considered**: Adding Playwright to CI for web screenshots — new infra, real value,
but out of scope for a closeout feature; noted as future work in the plan.

## R8. TestFlight pipeline (US7)

**Findings**: CI-SETUP.local.md §4 sketches the exact secret set: `ASC_ISSUER_ID`, `ASC_KEY_ID`,
`ASC_PRIVATE_KEY` (App Store Connect API key), `DIST_CERT_P12`/`DIST_CERT_PASSWORD`
(distribution cert). No secrets currently exist in the repo (deliberately secretless CI). Public
repo: deploy job must gate on non-fork events. The repo has no fastlane setup.

**Decision**: New `.github/workflows/ios-deploy.yml`, `workflow_dispatch`-only, raw
`xcodebuild archive` + `-exportArchive` + `xcrun altool`/`notarytool` upload path — no fastlane
dependency (one less Ruby toolchain on a public repo). Job 1 `preflight`: checks every required
secret, fails listing the missing ones by name (SC-007's under-a-minute check); job 2 `deploy`:
needs preflight, gated `if: github.event_name == 'workflow_dispatch'`. TDD-shaped verification
from the sandbox: `actionlint` the workflow + a triggered run proving the preflight fails fast
naming all five secrets. Owner setup doc: committed `docs/deploy.md` (no secret VALUES — this
repo is public; values stay in CI-SETUP.local.md/GitHub secrets), with per-credential
where-to-get-it steps mirroring CI-SETUP.local.md §4.

**Alternatives considered**: fastlane — richer but adds Gemfile/toolchain maintenance to a repo
with zero Ruby; rejected for a single-lane upload. Auto-deploy on tag push — deferred until the
lane has run manually at least once.

## R9. Verification topology (constraint from user input)

**Decision**: Order all work so on-sandbox loops come first and iOS CI pushes are batched:
1. Everything web/CLI/vector-generation TDD-able in Vitest on-sandbox (R1 catalog suite, R3
   repair script, R4 web insights, R5 vector generation + web assertions, R6 CLI, R7 QA).
2. All Swift edits batched into as few CI pushes as possible (catalog JSON + `-uiDemoLanguage` +
   `DashboardRange` extraction + tie-break + parity-test additions + workflow matrix — one push;
   fix-up pushes only on CI failure).
3. Live-DB repair last (operator-gated).
CI loop per CI-SETUP.local.md §3 (`GH_TOKEN=placeholder gh run watch`; artifacts via `gh api`).
Note: this feature's branch is `013-post-audit-closeout`; ios-ci.yml triggers on push only for
`main` but on **pull_request** for any branch touching `iOS/**` — so open a draft PR early to get
CI on every push.
