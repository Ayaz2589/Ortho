# Feature Specification: Post-Audit Closeout

**Feature Branch**: `013-post-audit-closeout`

**Created**: 2026-07-02

**Status**: Draft

**Input**: User description: "Close out all pending work left after the 2026-07-02 parity audit
remediation, fully test-first (TDD), using the iOS CI pipeline (macOS runner + simulator
screenshots) for all iOS verification since this sandbox cannot build iOS. Scope: (1) translate the
newly extracted iOS strings into bn/es/ja/zh/ko; (2) web translation quality pass + visual
spot-checks in Español and 日本語; (3) golden test vector for availableRanges; (4) close residual
parity gaps (recurring-insight preview ordering, outlier-insight en-US date on web, CLI
divergences: filtering reimplementation, --admin RLS bypass semantics, missing atomic-write
compensation); (5) one-time audit/repair of legacy DB rows in the 00:00–04:00Z window with a
dry-run mode; (6) TestFlight deploy pipeline (blocked on user-provided Apple credentials — spec
explicit setup steps)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Non-English iOS users see a fully translated app (Priority: P1)

A household member who uses the iOS app in বাংলা, Español, 日本語, 中文, or 한국어 opens any screen
touched by the 2026-07-02 remediation (delete confirmations, month grouping headers, FX freshness
captions, batch entry, and the other newly added strings) and sees every label in their language —
no English fallbacks. Shared strings read identically to the web app in the same language, and
বাংলা renders numerals with Latin digits, matching web.

**Why this priority**: This is a visible, currently-broken experience — the new keys exist in the
iOS string catalog but five of six languages fall back to English today. It undoes the "full
localization" commitment made in the audit remediation.

**Independent Test**: Switch the iOS simulator to each of the five languages and walk the four
tabs plus the add/edit and delete flows; every remediation-era string renders translated.
Verifiable from CI simulator screenshots per language without any other story shipped.

**Acceptance Scenarios**:

1. **Given** the iOS string catalog, **When** its keys are enumerated per language, **Then** zero
   keys in bn/es/ja/zh/ko are missing or untranslated (no English fallback values).
2. **Given** a string key that exists in both the iOS catalog and the web catalog for the same
   language, **When** the two values are compared, **Then** they are identical.
3. **Given** the app running in বাংলা, **When** any amount or count renders, **Then** digits are
   Latin (1,234.56), not Bengali numerals.
4. **Given** a push touching the iOS app, **When** CI runs, **Then** simulator screenshots
   demonstrate the translated UI so the change can be visually reviewed from the sandbox.

---

### User Story 2 - Historical transactions land on the right calendar day (Priority: P1)

A household member looks at transactions they entered in the evening before the 2026-07-02 date
fix. Those rows were stored with a wall-clock timestamp that can fall in the 00:00–04:00Z window —
which renders as the *wrong calendar day* in some views/timezones. An operator runs a one-time
audit that reports exactly which rows are affected and what would change (dry run), reviews the
report, and then applies the repair so every legacy row renders on the calendar day the member
originally picked. Rows already correct are untouched.

**Why this priority**: This is real, live household money data rendering on the wrong day — a
correctness bug affecting trust in the ledger, and it silently persists until repaired.

**Independent Test**: Run the audit in dry-run mode against the live backend and verify the report
lists only rows in the affected window with their proposed new timestamps; apply; re-run and
verify zero remaining affected rows and that each repaired row renders on its original local day.

**Acceptance Scenarios**:

1. **Given** the live database, **When** the audit runs in dry-run mode, **Then** it lists every
   transaction whose timestamp falls in 00:00–04:00Z (the evening wall-clock signature), the
   inferred original local calendar day, and the proposed corrected timestamp — and writes nothing.
2. **Given** the dry-run report has been reviewed and approved by the operator, **When** the
   repair is applied, **Then** each affected row's timestamp becomes noon UTC of its inferred
   local calendar day, and no other column or row changes.
3. **Given** a row already stored at noon UTC, **When** the audit runs, **Then** it is not listed
   and not modified.
4. **Given** the repair has been applied, **When** the audit runs again, **Then** it reports zero
   affected rows (the operation is idempotent and re-runnable).

---

### User Story 3 - Insights read identically on web and iOS (Priority: P2)

A member compares the Insights section on their phone and on the web app. The recurring-spending
insight previews the same three merchant names in the same order with the same casing on both
surfaces, and the outlier-insight date reads in the member's display language on web (not
US-English) — matching how iOS renders it.

**Why this priority**: These are the last two known app↔app behavioral divergences after the
audit; the parity bar is exact functionality, and insight text is user-visible on both surfaces.

**Independent Test**: With the same transaction data, generate insights on both surfaces and
compare the recurring preview strings and outlier date strings per language.

**Acceptance Scenarios**:

1. **Given** identical transactions, **When** the recurring insight is produced on web and iOS,
   **Then** the 3-merchant preview lists the same merchants in the same order with the same
   casing on both.
2. **Given** a display language other than English, **When** the outlier insight renders on web,
   **Then** its date is formatted in that language, matching iOS's rendering convention.
3. **Given** the previously vectored insight fields (IDs, severities, magnitudes), **When** the
   fix ships, **Then** they are unchanged.

---

### User Story 4 - The month-range logic is locked by a golden vector (Priority: P2)

A developer changes month-scoping logic on either surface. The cross-language test harness
immediately fails on whichever side diverges, because the available-ranges computation — which
months a household can scope the dashboard to — is now pinned by a shared golden vector asserted
by both platforms' suites, like every other piece of mirrored finance logic.

**Why this priority**: Closes the last unvectored mirrored function; prevents silent drift but has
no user-visible change today.

**Independent Test**: Introduce a deliberate off-by-one in either implementation; both the web and
iOS parity suites must fail; revert and both pass.

**Acceptance Scenarios**:

1. **Given** a representative set of transaction histories (empty, single month, multi-year, gap
   months, year boundaries), **When** vectors are generated, **Then** both the web and iOS parity
   suites assert the identical expected ranges from the same shared file.
2. **Given** an intentional mutation of the range logic on one surface, **When** that surface's
   parity suite runs, **Then** it fails.

---

### User Story 5 - The CLI behaves like the apps where it shares the product (Priority: P3)

An operator using the terminal CLI gets the same results the apps would give: listing transactions
with the same criteria returns the same set the apps show (same filter semantics, household-wide
scope, no silent row cap), a failed two-step write never leaves a half-written transaction that
misattributes money, and split validation accepts the same inputs the apps accept. Deliberate
divergences that remain (admin mode's elevated access, USD-only operation) are explicitly
documented as by-design rather than left ambiguous.

**Why this priority**: The CLI is a trusted, operator-driven tool with a small audience; gaps are
real but lower-exposure than app-facing stories.

**Independent Test**: Run the same filter criteria through the CLI and the shared filtering logic
and compare result sets; kill a write between the two steps and verify no orphaned parent
remains; validate a 99.8%-total custom split and see it accepted.

**Acceptance Scenarios**:

1. **Given** any filter criteria the apps support (free text, owner, multi-select category/source/
   kind), **When** the CLI lists transactions, **Then** the result set matches what the shared
   filtering logic returns for the same household data, with no undisclosed row cap.
2. **Given** a non-admin CLI session, **When** transactions are listed, **Then** the scope matches
   the apps (household-wide), not just rows the operator created.
3. **Given** a failure between writing a transaction and writing its shares, **When** the CLI
   write finishes, **Then** no share-less parent row remains (the partial write is compensated).
4. **Given** a custom split totaling within the apps' accepted tolerance, **When** the CLI
   validates it, **Then** it is accepted — identical tolerance to the apps.
5. **Given** the parity contract document, **When** a reader checks admin mode, **Then** its
   elevated-access semantics are documented as by-design with its constraints stated.

---

### User Story 6 - Web translations read natively and fit the layout (Priority: P3)

A member using the web app in any of the five non-English languages reads UI text that uses the
same terminology as the iOS app and fits its containers — no truncated buttons, overflowing
labels, or leftover English strings — verified by a per-language review of the machine-authored
keys and a visual pass in Español and 日本語.

**Why this priority**: Quality assurance on already-shipped translations; the text exists and
functions today, it just hasn't been quality-checked.

**Independent Test**: Review every web-only key per language against iOS terminology; render the
web app in Español and 日本語 across the four destinations and the add/edit flows and confirm no
overflow or missed strings.

**Acceptance Scenarios**:

1. **Given** the web-only translation keys, **When** each is reviewed per language, **Then** each
   uses terminology consistent with the iOS catalog for that language (same product nouns), and
   corrections are applied where they diverge.
2. **Given** the web app in Español and 日本語, **When** the four destinations and add/edit flows
   render at compact and desktop widths, **Then** no text overflows its container and no English
   fallback appears.

---

### User Story 7 - The iOS app ships to TestFlight from CI (Priority: P3)

The product owner pushes a release-worthy change; a CI pipeline builds a signed iOS archive and
uploads it to TestFlight, so household members can install the real app on their phones without
the owner touching Xcode. Until the owner supplies Apple credentials, the pipeline definition,
its verification, and step-by-step credential setup instructions are complete and waiting.

**Why this priority**: High future value but externally blocked — the pipeline cannot run
end-to-end until the owner provides Apple Developer credentials, so everything except the final
live upload must be deliverable now.

**Independent Test**: The workflow's non-signing stages validate in CI (it parses, gates
correctly, fails fast with a clear message when secrets are absent); the setup document walks the
owner through producing each required credential; once secrets exist, a manual trigger produces a
TestFlight build.

**Acceptance Scenarios**:

1. **Given** the repository without Apple secrets configured, **When** the deploy workflow is
   triggered, **Then** it fails fast at a pre-flight check that names exactly which secrets are
   missing (rather than failing mid-build with a cryptic signing error).
2. **Given** the setup instructions, **When** the owner follows them, **Then** each required
   credential is produced and stored, and each step states where the value comes from.
3. **Given** all secrets configured, **When** the workflow is manually triggered, **Then** a
   signed build reaches TestFlight (verifiable only post-credentials; explicitly out of this
   feature's automated verification).

---

### Edge Cases

- A string key whose English value is intentionally different between web and iOS (platform
  idiom, e.g. "tap" vs "click"): parity applies to shared keys only; platform-idiom keys are
  compared for terminology, not identity.
- Legacy-row inference when 00:00–04:00Z could mean two different local days (operator entered it
  near local midnight): the audit report shows the ambiguity and the repair uses the household's
  timezone convention; ambiguous rows are flagged for operator review in the dry run rather than
  silently repaired.
- A legacy row already edited through the web app after the fix (self-healed): it no longer sits
  in the affected window and must not be re-listed.
- availableRanges with zero transactions, or transactions all in one month, or spanning a year
  boundary — all must be vectored explicitly.
- CLI filter alignment removing the row cap: very large households could return large result
  sets; output remains usable (the cap, if any, must be explicit and user-visible, never silent).
- A recurring-insight tie (two merchants with equal amounts): ordering must be deterministic and
  identical on both surfaces.
- Simulator screenshots in a language whose fonts are missing on the runner: text must still be
  legible in the artifact (fallback fonts acceptable, tofu boxes are not).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Every key in the iOS string catalog MUST have a translated value in bn, es, ja, zh,
  and ko — zero missing or English-fallback entries.
- **FR-002**: Keys shared between the iOS and web catalogs MUST have byte-identical values per
  language; an automated check MUST enforce this and fail when they drift.
- **FR-003**: বাংলা on iOS MUST render numerals as Latin digits everywhere amounts or counts
  appear, matching web.
- **FR-004**: A one-time audit tool MUST identify all live transaction rows with timestamps in
  the 00:00–04:00Z window, report the inferred local day and proposed corrected timestamp per
  row, and MUST default to dry-run (no writes).
- **FR-005**: The repair mode MUST rewrite only the reported rows' timestamps to noon UTC of the
  inferred local day, MUST change nothing else, MUST be idempotent, and MUST require an explicit
  opt-in flag distinct from the dry run.
- **FR-006**: Ambiguous legacy rows (inference could yield two local days) MUST be excluded from
  automatic repair and flagged for operator decision.
- **FR-007**: The recurring-insight 3-merchant preview MUST use the same ordering and merchant
  casing on web and iOS, deterministic under ties.
- **FR-008**: The outlier-insight date on web MUST render in the user's display language,
  matching the iOS convention; previously vectored insight fields MUST remain unchanged.
- **FR-009**: The available-ranges computation MUST be pinned by a golden vector generated from
  the web implementation and asserted by both platforms' parity suites, covering empty history,
  single-month, multi-month with gaps, and year-boundary cases.
- **FR-010**: CLI transaction listing MUST produce the same result set as the shared filtering
  logic for equivalent criteria — free-text query, owner filter, multi-select category/source/
  kind — scoped household-wide for non-admin sessions, with any result limit explicit and
  user-visible.
- **FR-011**: CLI two-step transaction writes MUST compensate on partial failure so no share-less
  parent row can persist.
- **FR-012**: CLI custom-split validation MUST accept the same tolerance as the apps' shared
  validation.
- **FR-013**: CLI category/type lists MUST derive from the shared definitions rather than a
  duplicated hardcoded list.
- **FR-014**: Admin mode's elevated-access semantics MUST be documented as by-design in the
  parity contract, including its attribution behavior and constraints.
- **FR-015**: Machine-authored web-only translation keys MUST be reviewed per language against
  iOS terminology, with corrections applied; the web UI in Español and 日本語 MUST be visually
  verified free of overflow and English fallbacks at compact and desktop widths.
- **FR-016**: A TestFlight deploy pipeline MUST exist that pre-flight-checks required
  credentials, fails fast naming any missing secret, and — when credentials are present — builds,
  signs, and uploads to TestFlight on manual trigger.
- **FR-017**: Owner-facing setup instructions MUST enumerate every required Apple credential,
  where to obtain it, and how to store it.
- **FR-018**: All iOS-side changes MUST be verifiable from the Linux sandbox via the existing CI
  pipeline (build + parity suites + simulator screenshots); no verification step may require
  local macOS access.
- **FR-019**: All behavior changes MUST land test-first: a failing automated test (or golden
  vector) describing the intended behavior precedes the change, on the owning surface(s).
- **FR-020**: The parity contract document MUST be reconciled to reflect every gap this feature
  closes or reclassifies.

### Key Entities

- **String catalog entry**: a key + per-language values; lives in duplicated catalogs (one per
  surface) that must agree on shared keys per language.
- **Legacy transaction row**: a live transaction whose stored timestamp carries the pre-fix
  evening wall-clock signature (00:00–04:00Z); attributes: stored timestamp, inferred original
  local day, ambiguity flag, proposed corrected timestamp.
- **Golden vector (available ranges)**: a shared fixture mapping transaction-history shapes to
  the expected list of scoping ranges, asserted by both platforms.
- **Deploy credential**: an owner-supplied secret required for signing/upload; attributes: name,
  source, storage location, presence (checkable before build).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of iOS string-catalog keys have non-fallback values in all six languages;
  the shared-key identity check passes for all five non-English languages.
- **SC-002**: After repair, zero live transaction rows carry the 00:00–04:00Z signature (except
  operator-deferred ambiguous rows, each explicitly listed), and no non-timestamp data changed.
- **SC-003**: With identical inputs, insight text (recurring preview and outlier date) is
  identical across surfaces in all six languages.
- **SC-004**: A deliberate range-logic mutation on either surface fails that surface's parity
  suite; the unmutated tree passes both suites.
- **SC-005**: For a shared set of filter scenarios, CLI listing output matches the shared
  filtering logic's result set exactly; an interrupted CLI write leaves zero orphaned rows.
- **SC-006**: Web visual pass in Español and 日本語 finds zero overflows/English fallbacks at
  both widths (or all found are fixed within the feature).
- **SC-007**: The deploy workflow, triggered without credentials, fails in under a minute with a
  message naming every missing secret; the setup document lets the owner configure all secrets
  without outside help.
- **SC-008**: Both platforms' full test suites are green at feature completion, and the parity
  contract contains no unreconciled gap introduced or closed by this feature.

## Assumptions

- The five iOS translations may be authored in-repo (editing the string catalog directly) by a
  capable translator process, seeded from the existing web catalogs where keys are shared; a
  native-speaker review remains advisable but is not a blocker for shipping.
- The household operates in a single home timezone (America/New_York) — used to infer the
  original local day for legacy rows; rows where this inference is ambiguous are deferred to the
  operator rather than guessed.
- Repairing live data is in scope, but only after the operator (user) reviews the dry-run
  report; the apply step will not run without their explicit go-ahead.
- The iOS convention is the source of truth for insight-text ordering/formatting (iOS is
  canonical); web changes to match, not vice versa.
- Admin mode's RLS bypass remains by-design (it is the operator's trusted local tool); this
  feature documents it rather than removing it.
- The recurring-preview and outlier-date fixes extend existing vectored coverage where the
  golden-vector harness fits; purely presentational string assembly may be locked by per-surface
  unit tests instead.
- TestFlight upload cannot be end-to-end verified until the user supplies Apple Developer
  credentials; the feature is complete when everything short of the live upload is verified and
  the credential setup path is documented and pre-flight-checked.
- The existing iOS CI pipeline (build + XCTest parity suites + `-uiDemo` simulator screenshots)
  is the sole iOS verification channel from this sandbox.
