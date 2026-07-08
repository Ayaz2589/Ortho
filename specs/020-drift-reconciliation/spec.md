# Feature Specification: Drift Reconciliation

**Feature Branch**: `020-drift-reconciliation`

**Created**: 2026-07-07

**Status**: Draft

**Input**: Fix all documentation, configuration, code-comment, and cross-platform (iOS↔web) parity drift across the Ortho monorepo surfaced by an exhaustive, adversarially-verified audit (41 distinct verified items). Restore a single source of truth, fix the two real defects, and pin every previously vector-blind parity behavior with new golden vectors so drift cannot silently recur.

> **Authoritative item list**: [`drift-inventory.md`](./drift-inventory.md) in this directory holds all 41 verified drifts with file:line, claim, reality, and one-line fix. This spec groups them into prioritized, independently-shippable user stories; the inventory is the line-item backing.

## User Scenarios & Testing *(mandatory)*

Ortho spans three surfaces (canonical iOS app, web app, import/CRUD CLI) over one Supabase backend, with pure finance logic mirrored in Swift + TypeScript and pinned by golden vectors. Over 19 features the docs, config, and two implementations have drifted apart in 41 verified ways — two of them real defects, the rest a spectrum from user-visible inconsistency to cosmetic doc lag. The "users" here are household members (who must see correct money and consistent behavior across their devices), operators (who use the CLI and local stack), and contributors (who rely on docs and the parity contract being true).

### User Story 1 - Recorded money is attributed correctly and sign-in works everywhere (Priority: P1)

Two live defects that break core behavior. (a) Expenses imported through the CLI are silently excluded from settle-up because the importer never records who paid; a household's reimbursement balance is quietly wrong. (b) On the local Supabase stack the emailed sign-in code is a different length than every client will accept, so local sign-in is impossible.

**Why this priority**: These are the only two items that produce wrong results or block a core flow today. Money attribution errors erode the app's central promise (trustworthy shared balances); an unenterable sign-in blocks all local development and testing. Everything else is consistency or documentation.

**Independent Test**: Record an expense through the CLI with a known payer, then view settle-up on either app — the expense is included and attributed to that payer. Separately, request a sign-in code on the local stack and confirm its length matches what the apps/CLI accept, and that sign-in completes.

**Acceptance Scenarios**:

1. **Given** a two-person household, **When** an expense is imported via the CLI with a payer, **Then** that expense appears in settle-up balances attributed to the payer (identical to an expense entered in-app).
2. **Given** the local Supabase stack, **When** a person requests an email sign-in code, **Then** the code length equals the length every client requires and sign-in succeeds.
3. **Given** the parity contract (`PARITY.md`), **When** the CLI payer behavior is corrected, **Then** the matrix row describing CLI payer support reflects reality.

---

### User Story 2 - Configuration and CLI options tell the truth (Priority: P2)

The system exposes knobs that do nothing and declares files that don't exist: a CLI `SCOPE` option that is silently ignored, a hidden admin-attribution option that is never passed, and a database-seed config pointing at a missing file. Operators should never be able to set an option that has no effect or trust a config line that references a phantom file.

**Why this priority**: No wrong results, but these actively mislead operators and waste debugging time. Removing them is low-risk and makes the tooling honest.

**Independent Test**: Inspect the CLI help/README and the config — no option is documented or forwarded that the code ignores, and every file the config references exists (or the referencing block is disabled).

**Acceptance Scenarios**:

1. **Given** the CLI, **When** an operator reads the help/README, **Then** no removed or no-op option (e.g. scope selection, admin-user override) is presented as usable.
2. **Given** a local database reset, **When** the seed step runs, **Then** it references only files that exist (or seeding is explicitly disabled).

---

### User Story 3 - The two apps compute and display money and dates identically (Priority: P3)

A household member using iOS and their partner using web must see the same currency names and symbols, the same amounts (decimals, signs), the same rent-due dates, and the same filtered/sorted lists. The audit found a cluster of iOS↔web divergences in formatters, rounding, input normalization, sorting, and lease date math — none currently covered by golden vectors (the safety net that is supposed to prevent exactly this).

**Why this priority**: These are real, user-observable inconsistencies, but each is narrow and today mostly cosmetic (one is a genuine off-by-one in a rent-due date). The durable fix is not just aligning the code but adding golden vectors so the two languages can never re-diverge — closing the gap that let this happen.

**Independent Test**: New golden vectors for currency names, currency symbols, and lease date math pass on both the web and iOS suites; for each enumerated divergence, both implementations produce identical output for the same inputs, including the previously-divergent edge cases.

**Acceptance Scenarios**:

1. **Given** any supported currency, **When** its name and symbol are displayed, **Then** iOS and web show the same string.
2. **Given** a lease whose rent-due day exceeds a month's length, **When** the days-until-next-rent is computed, **Then** iOS and web return the same day count (the clamped, correct value).
3. **Given** the previously vector-blind behaviors (money decimals/sign, split-percent rounding, month-string validation, query trimming, source ordering), **When** exercised with edge-case inputs, **Then** both platforms agree, and a golden vector locks each newly-aligned behavior.
4. **Given** the existing golden vectors, **When** the parity fixes land, **Then** no existing vector changes except where an engine intentionally changed.

---

### User Story 4 - Occupancy is an explicit, correct state (Priority: P4)

Rental occupancy is currently inferred from whether a tenant name happens to be filled in — so a rent-earning unit with a blank name is silently treated as vacant and dropped from income, and the add-property helper text still says net is "total unit rent" when the app actually counts occupied units only. Landlords should declare occupancy deliberately, and the copy should match what the number means.

**Why this priority**: Completes the one item spec 019 deliberately deferred (it needs a schema change). It prevents silent income loss and fixes misleading copy, but it is lower urgency than the live defects and cross-cutting parity, and it is the only item requiring a database migration.

**Independent Test**: On both apps, a unit can be explicitly marked occupied or vacant independent of the tenant-name field; net rental income counts only occupied units and matches between the dashboard and the property detail; the helper copy reads "occupied unit rent."

**Acceptance Scenarios**:

1. **Given** a multifamily unit, **When** the landlord marks it occupied or vacant, **Then** that state is stored explicitly and no longer inferred from the tenant name.
2. **Given** existing units, **When** the occupancy state is introduced, **Then** each unit's occupancy is backfilled to match its current computed state so no displayed net changes on migration.
3. **Given** a vacant unit, **When** net rental income is shown, **Then** the dashboard and the property detail both exclude it and agree, and the helper copy says "occupied unit rent" on both surfaces and in all translations.

---

### User Story 5 - Translations stay consistent and the parity lock can't silently rot (Priority: P5)

The web translation catalogs have a structural marker separating iOS-shared keys from web-only keys, but ~34 iOS-shared keys have drifted below the marker and one catalog (Spanish) is missing/misplaced keys — and the automated lock never checks for this, so it went unnoticed. Contributors should be able to trust the catalog structure, and the lock should catch this class of drift automatically.

**Why this priority**: No user-facing breakage today (values fall back to identical English), but the mislabeling defeats the intent of the parity lock and will cause real translation gaps later. Fixing it plus hardening the lock prevents recurrence.

**Independent Test**: In all five catalogs, iOS-shared keys sit above the marker and web-only keys below; the Spanish catalog matches the other four's shared-key set; the hardened lock fails if any iOS-shared key is placed below the marker.

**Acceptance Scenarios**:

1. **Given** the five web catalogs, **When** their structure is inspected, **Then** the below-marker block contains no key that also exists in the iOS string catalog.
2. **Given** the hardened parity lock, **When** a contributor mislabels an iOS-shared key as web-only, **Then** the test suite fails.
3. **Given** the Spanish catalog, **When** compared to the other four, **Then** its shared-key set matches (no misplaced or missing shared keys).

---

### User Story 6 - Code comments and internal notes describe the current schema (Priority: P6)

Several in-code doc comments and internal notes still describe the pre-migration data model (a dropped `scope` column, percent-based/`user_id` share rows, two-value transaction kinds, `Set<User.ID>` ownership). A contributor reading these is actively misled about how the system works today.

**Why this priority**: Zero runtime effect, but stale descriptions of core data structures cause real confusion and bad changes. Pure prose corrections.

**Independent Test**: The named files no longer describe dropped columns/percent shares/two-value kinds; the pre-Supabase architecture note is either rewritten to the current model or clearly marked archived.

**Acceptance Scenarios**:

1. **Given** the transaction API doc comments and internal data-model notes, **When** read, **Then** they describe person-keyed, cents-based shares, no `scope`, and the current three transaction kinds.
2. **Given** the legacy architecture document, **When** opened, **Then** it either reflects the current backend/ownership model or carries an unmistakable "archived / historical" banner.

---

### User Story 7 - Project documentation matches reality (Priority: P7)

The largest bucket: docs point at a closed feature as "active," undercount vectors/tests/features, misname files, omit tree entries, and the parity contract overstates one CLI capability. Onboarding contributors are misled on nearly every count. All are find-and-replace corrections with no runtime risk.

**Why this priority**: Lowest risk and lowest urgency, but highest volume; batching them into one sweep restores trust in the docs and the parity contract with no behavior change.

**Independent Test**: Every count, pointer, filename, and tree entry enumerated in the audit matches the repository; the parity contract matches the code; the prior feature's task ledger reflects its completed state.

**Acceptance Scenarios**:

1. **Given** the index/makefile docs, **When** read, **Then** the active-feature pointer, feature count, and vector count match the repository.
2. **Given** the iOS and web subsystem docs, **When** their file trees/counts/filenames are checked, **Then** each matches the source (line counts, test-suite counts, folder and file names, omitted entries).
3. **Given** the shared/vector and CLI docs, **When** read, **Then** all vectors are documented, the vector-shape descriptions are accurate, and every module is listed.
4. **Given** the parity contract, **When** a fix in this feature changes a described capability, **Then** the matrix cell is reconciled to match the code.

### Edge Cases

- **Unintended golden-vector drift**: regenerating vectors after an accidental logic change would "launder" a bug into the vectors (web passes, only iOS CI catches it). The feature MUST treat any change to an existing vector that was not explicitly intended as a failure.
- **iOS validated only on CI**: no local Xcode on the dev sandbox, so every Swift change (including new vectors and pbxproj wiring) is confirmed only by the macOS CI run. A new vector file that is not wired into the iOS test bundle fails on CI, not locally.
- **New user-facing iOS strings** (occupancy toggle, "occupied unit rent") extend the iOS string catalog and can break the catalog-parity lock unless handled the same way as existing shared/dev strings.
- **Occupancy migration on a live shared backend**: the new occupancy state MUST be backfilled from the current inference so no existing property's displayed net changes at migration time.
- **User-visible canonical choices**: aligning a currency name or symbol changes what a user sees; the canonical value MUST be chosen deliberately (default: the canonical iOS app), not whichever was easier to change.
- **Removing a documented option**: operators may have muscle memory or scripts using the removed `SCOPE` knob; because it was already a no-op, removal changes no behavior, but the removal MUST be noted so it isn't mistaken for a regression.
- **The "731 tests" figure**: the exact test total MUST be reconfirmed by running the suite, not copied forward.

## Requirements *(mandatory)*

### Functional Requirements

**P1 — Real defects**

- **FR-001**: Every expense recorded through the CLI MUST persist its payer so it participates in settle-up balances identically to an in-app expense; all CLI write paths (create and update) MUST include the payer.
- **FR-002**: The parity contract MUST be corrected so it no longer claims the CLI records a payer it does not.
- **FR-003**: The email one-time-code length declared by the backend configuration MUST match the length every client (web, iOS, CLI) requires, so sign-in is completable on the local stack.

**P2 — Config & dead-knob truth-up**

- **FR-004**: No CLI option that the code ignores may be documented or forwarded (the scope selection and the never-passed admin-attribution option MUST be removed from tooling, docs, and code).
- **FR-005**: The database seed configuration MUST reference only files that exist, or the seed step MUST be explicitly disabled.

**P3 — Cross-platform parity + vectors**

- **FR-006**: For each enumerated money/currency behavior (currency display name, currency symbol, negative-sign handling, leading-plus on zero, zero/negative rate guard, insight money decimals) iOS and web MUST produce identical output for identical inputs.
- **FR-007**: Share-percent rounding MUST agree between iOS and web for all inputs, including negative half-values; any comment claiming the two "cannot diverge" MUST be made true or corrected.
- **FR-008**: Transaction-filter helpers MUST agree between iOS and web on month-string validation, query whitespace trimming (including newlines), and source-list ordering.
- **FR-009**: The lease "days until next rent" computation MUST clamp the rent-due day to the target month's length on both platforms (no overflow into the following month).
- **FR-010**: New golden vectors MUST be added for currency names, currency symbols, and lease date math; every newly-aligned behavior MUST be locked by a deterministic vector so the two languages cannot re-diverge.
- **FR-011**: No existing golden vector may change except where an engine intentionally changed; unintended vector drift MUST be treated as a failure.

**P4 — Occupancy**

- **FR-012**: A rental unit's occupancy MUST be an explicitly stored state, settable on both apps, independent of whether a tenant name is filled in.
- **FR-013**: Introducing the occupancy state MUST backfill existing units so no property's displayed net rental income changes at migration time.
- **FR-014**: Net rental income MUST count occupied units only and agree between the dashboard and property detail on both platforms; the occupancy rule MUST remain vector-locked.
- **FR-015**: The unit-editor helper copy MUST describe net as based on "occupied unit rent" (not "total unit rent") on both surfaces and in all translations.

**P5 — i18n**

- **FR-016**: In every web catalog, keys shared with the iOS string catalog MUST sit in the shared block and web-only keys in the web-only block; no shared key may be mislabeled as web-only.
- **FR-017**: The Spanish catalog's shared-key set MUST match the other four catalogs.
- **FR-018**: The catalog-parity lock MUST fail when an iOS-shared key is placed in the web-only block (the blind spot MUST be closed).

**P6 — Obsolete comments**

- **FR-019**: In-code doc comments and internal notes MUST describe the current data model (person-keyed cents-based shares, no `scope`, three transaction kinds); no reference to dropped `scope`/`percent`/`user_id` share columns or two-value kinds may remain.
- **FR-020**: The legacy architecture document MUST either be updated to the current backend/ownership model or clearly marked archived/historical.

**P7 — Documentation & parity refresh**

- **FR-021**: All documentation pointers to the active feature MUST reference the current feature, and feature/vector/test/line counts MUST match the repository.
- **FR-022**: Subsystem doc file trees, filenames, folder listings, and per-file annotations MUST match the source.
- **FR-023**: The vector and CLI reference docs MUST document all vectors and modules accurately, with correct vector-shape descriptions and no stale "pending setup" framing.
- **FR-024**: The parity contract MUST be reconciled wherever a fix in this feature changes a described capability.
- **FR-025**: The prior feature's task ledger MUST reflect its completed state.

**Cross-cutting**

- **FR-026**: All new or changed money and date logic MUST be developed test-first and covered by deterministic tests (golden vectors where they fit), per Constitution VI.
- **FR-027**: Both automated test suites (web Vitest locally; iOS XCTest via CI) MUST pass; iOS changes are confirmed only through the CI run, and any new vector file MUST be wired into the iOS test bundle.
- **FR-028**: All design changes (the occupancy toggle) MUST use existing design tokens and semantic controls per the constitution (no new palette entries, ≥44px touch targets, real controls).

### Key Entities

- **Drift item**: one verified discrepancy (surface, kind, file:line, claim, reality, fix, severity) — the 41 rows in the inventory; the unit of work.
- **Golden vector**: a generated `input → expected` JSON fixture asserted by both platforms; this feature adds currency-names, currency-symbols, and lease vectors and must avoid unintended changes to the existing eight.
- **Unit occupancy state**: a new explicit per-unit occupied/vacant attribute replacing tenant-name inference; drives occupied-only net rental income.
- **Catalog partition**: the shared-vs-web-only structure of each web translation catalog, and the lock that must enforce it.
- **Parity contract (`PARITY.md`)**: the capability × surface matrix that must match the code after this feature.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of expenses recorded through any surface (in-app or CLI) appear in settle-up balances attributed to the correct payer.
- **SC-002**: A person can complete email sign-in on both the local and hosted environments with no code-length mismatch.
- **SC-003**: For every enumerated money/date parity behavior, iOS and web produce identical output on 100% of the new golden-vector cases, including the previously-divergent edge cases.
- **SC-004**: Zero of the 41 audited discrepancies remain: every count, pointer, filename, comment, config value, and matrix cell matches the repository.
- **SC-005**: Both test suites pass and no golden vector changes except the intended new/updated ones (zero unintended drift).
- **SC-006**: Landlords can set occupancy explicitly on both apps; net rental income counts occupied units only and agrees between dashboard and detail, with no net change for any existing property at migration.
- **SC-007**: The i18n parity lock fails when an iOS-shared key is mislabeled web-only (proven by a regression test), and all five catalogs share the same shared-key set.
- **SC-008**: No configuration option or CLI flag is documented or forwarded that the code ignores, and no config line references a missing file.

## Assumptions

- **Scope is all 41 audited items**, enumerated in [`drift-inventory.md`](./drift-inventory.md), organized into the seven priority stories above; stories are independently shippable and may be delivered/deferred in priority order.
- **Canonical alignment target**: iOS is the canonical product, so presentation divergences (currency name/symbol, money decimals/sign, leading-plus) align web → iOS. Where iOS holds the actual bug (lease due-day overflow, lax month-string parsing) the correct/stricter behavior is canonical and iOS is changed. The per-item direction is recorded in the inventory.
- **iOS builds only on CI**: the Linux dev sandbox cannot compile/test iOS; all Swift changes (logic, new vectors, pbxproj wiring, new strings) are validated via `.github/workflows/ios-ci.yml` on push.
- **Vector discipline**: any parity fix touching a vectored engine regenerates `shared/test-vectors/` from the TS engines and mirrors the change in Swift; a new vector file also requires an iOS test-bundle (pbxproj Copy Bundle Resources) entry.
- **Occupancy migration**: adds a defaulted/backfilled explicit occupancy column on the shared Supabase backend; existing units are backfilled from current inference so displayed nets are unchanged. This is the only schema migration in the feature.
- **i18n lock changes** are additive test hardening plus catalog reorganization; new iOS strings for occupancy are handled the same way existing shared/dev strings are (translated or marked non-translatable) so the lock stays green.
- **The "731 tests" count** and any other live count are reconfirmed by running the suite, not carried forward.
- **No end-user feature redesign**: this feature is correctness + truth-up; the only new UI is the occupancy toggle, built from existing tokens.
- **Constitution VI governs**: money/date fixes are test-first; `npm test` (web) gates locally and CI gates iOS before merge.
