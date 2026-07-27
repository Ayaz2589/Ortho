# Tasks: PDF Data Export & Import (Ortho Data File)

**Input**: Design documents from `specs/032-pdf-data-export/`

**Branch**: `feat/pdf-data-export`

**TDD**: All logic tasks write a failing test or golden vector FIRST (Constitution VI). Tests must be red before implementation, green after. `cd web && npm test` must be green after every phase.

**Backbone tests are node-env Vitest** (no jsdom): envelope round-trip, PDF `attach → unpdf getAttachments` read, two-tier dedup, currency-independence, section forward/back-compat. Panel tests are jsdom (`// @vitest-environment jsdom`).

**Format**: `[ID] [P?] [Story] Description` — `[P]` = parallelizable (different files, no incomplete deps).

---

## Phase 1: Setup

- [X] T001 Read `web/AGENTS.md` + relevant `node_modules/next/dist/docs/` notes before any Next-specific code (this is a modified Next.js). No output file; a gate on the rest.
- [X] T002 Add dependencies in `web/package.json`: `pdf-lib@^1.17.1`, `@pdf-lib/fontkit@^1.1.1`; **move** `unpdf@^1.6.2` from `devDependencies` to `dependencies`. Run `cd web && npm install`.
- [X] T003 Verify baseline green before any changes: `cd web && npm test && npx tsc --noEmit`.
- [X] T004 [P] Create the module skeleton dirs/files (empty stubs with `'use client'` where needed) under `web/lib/dataFile/`: `envelope.ts`, `registry.ts`, `sections/transactions.ts`, `sections/housing.ts`, `pdf/generate.ts`, `pdf/fonts.ts`, `pdf/layout.ts`, `readPdf.ts`, `export.ts`, `import.ts`.

**Checkpoint**: Deps installed, baseline green, empty module compiles.

---

## Phase 2: Foundational (blocking prerequisites)

**Purpose**: The envelope + registry contract that every section and both pipelines depend on.

### Tests first (RED)

- [X] T005 [P] Write `web/test/dataFile/envelope.test.ts` (RED): `validate()` accepts formatVersion 1; rejects missing/`>1` version → `unsupported-version`; rejects non-`ortho` app → `not-ortho-file`; malformed → `corrupt`; asserts `validate` performs no side effects.
- [X] T006 [P] Write `web/test/dataFile/registry-compat.test.ts` (RED, will grow): `register()` adds sections in order; duplicate key throws; `registeredSections()` returns insertion order; unknown section key in an envelope is tolerated (`known:false`), missing section omitted.

### Implementation

- [X] T007 Implement `web/lib/dataFile/envelope.ts`: `ExportEnvelope`/`SectionPayload` types, `SUPPORTED_FORMAT_VERSION = 1`, `ATTACHMENT_NAME = 'ortho-export.json'`, and `validate(input): { ok:true, envelope } | { ok:false, reason }` per contracts/data-file-envelope.md.
- [X] T008 Implement `web/lib/dataFile/registry.ts`: `DataSection<TRecord>` interface (`key`, `sectionVersion`, `serialize`, `read`, `dedupe`, `apply`, `renderModel`), `SectionDedupePlan`, `RenderCtx`, `SectionRenderModel` types, plus `register()` / `get()` / `registeredSections()` (ordered map, throw on dup key).
- [X] T009 Run `cd web && npm test` — T005/T006 green.

**Checkpoint**: Envelope validate + registry locked. Sections can now be built independently.

---

## Phase 3: US5 — Extensible section registry (Priority: P2, built first as the seam)

**Goal**: The transactions + housing sections register additively and round-trip through serialize/read. (US5 is foundational to US1/US3, so its section machinery lands here; the compat guarantees are the user-facing payoff.)

**Independent Test**: `registry-compat.test.ts` + section tests pass; a throwaway third section can be registered without editing existing sections.

### Tests first (RED)

- [X] T010 [P] [US5] Write `web/test/dataFile/sections-transactions.test.ts` (RED): `serialize(store)` → `TxRecord[]` with canonical USD cents, splits summing to `amount_cents`; `read(payload)` inverts it losslessly; unknown-person `paid_by`/`owner_ids`/`shares` keys resolve to `currentPersonId` with shares still summing (G12).
- [X] T011 [P] [US5] Write `web/test/dataFile/sections-housing.test.ts` (RED): `serialize` emits `{ property (nested mortgage/lease/units), rentalPayments }` with canonical cents; `read` inverts losslessly.

### Implementation

- [X] T012 [US5] Implement `web/lib/dataFile/sections/transactions.ts` `serialize`/`read`/`renderModel` (dedupe/apply added in US4/US3) per data-model.md; tags serialized as names.
- [X] T013 [US5] Implement `web/lib/dataFile/sections/housing.ts` `serialize`/`read`/`renderModel` per data-model.md.
- [X] T014 [US5] Register both sections at module load in `web/lib/dataFile/registry.ts` (order: transactions, housing); extend `registry-compat.test.ts` with the unknown/missing-section vectors.
- [X] T015 [US5] Run `cd web && npm test` — section + compat tests green.

**Checkpoint**: Both sections serialize/read losslessly and register additively.

---

## Phase 4: US1 — Download data as a PDF (Priority: P1) 🎯 MVP

**Goal**: A single downloadable PDF containing a transactions section, a housing section, and the embedded machine-readable payload.

**Independent Test**: Trigger export with defaults → a valid PDF whose embedded `ortho-export.json` round-trips to the source envelope; visible pages contain both sections.

### Tests first (RED)

- [X] T016 [P] [US1] Write `web/test/dataFile/pdf-roundtrip.test.ts` (RED): build a PDF via `generate.ts` from a fixture envelope (stub font) → `save()` bytes → `readPdf.readEnvelope(bytes)` (unpdf `getAttachments`) → `JSON.parse` deep-equals the source envelope; attachment name = `ortho-export.json`, mime = `application/json`; empty household → valid envelope with empty section payloads (G2).

### Implementation

- [X] T017 [US1] Implement `web/lib/dataFile/pdf/fonts.ts`: `loadFontForLanguage(language)` — bundled Latin (Noto Sans) default; `fetch('/fonts/NotoSans<Lang>.ttf')` for others; **Latin fallback if asset missing** so export never hard-fails. Injectable font-bytes provider for tests (stub font).
- [X] T018 [US1] Implement `web/lib/dataFile/pdf/layout.ts`: pdf-lib drawing helpers — section heading, table columns/rows, pagination, empty-state line; tokens-derived graphite text, hairlines, **never red**.
- [X] T019 [US1] Implement `web/lib/dataFile/pdf/generate.ts`: `buildPdf(envelope, renderModels, { language })` — `registerFontkit`, `embedFont({subset:true})`, draw pages via layout, `attach(JSON envelope, 'ortho-export.json')`, `save()` → `Uint8Array`.
- [X] T020 [US1] Implement `web/lib/dataFile/readPdf.ts`: `readEnvelope(bytes)` via `unpdf.getResolvedPDFJS()` → `getDocument().promise.getAttachments()` → decode → `validate`; returns typed `{ ok:false, reason }` on every failure with no writes (G4).
- [X] T021 [US1] Implement `web/lib/dataFile/export.ts`: `buildDataFile(store, { language, currency, includeSections })` — serialize registered sections → envelope (canonical cents; inject `generatedAt`), build render models with `RenderCtx`, call `generate.buildPdf`, return bytes + filename `ortho-<household>-<YYYY-MM-DD>.pdf`.
- [X] T022 [US1] **Done (adjusted):** Latin uses pdf-lib's built-in **Helvetica** (no binary needed, works headlessly), so no `NotoSans-Regular.ttf` is shipped. Added `web/public/fonts/README.md` documenting the per-language TTF convention, the CFF-is-broken caveat, and the Latin-fallback behavior.
- [X] T023 [US1] Create Settings→Data surface: `web/components/settings/DataSection.tsx` + `web/components/settings/DataExportPanel.tsx` (Download button wired to `buildDataFile` → `share.ts` on iOS / Blob download on web), tokens only, ≥40px targets, aria-labels.
- [X] T024 [US1] Add the route + nav: `web/app/(app)/settings/data/page.tsx` and a "Data" entry in the settings secondary nav / `layout.tsx` (mobile list-then-detail, desktop master-detail).
- [X] T025 [US1] Run `cd web && npm test` — pdf-roundtrip + prior tests green.

**Checkpoint**: Export works end-to-end; PDF downloads and its payload round-trips. **MVP demoable.**

---

## Phase 5: US2 — Choose language + currency for export (Priority: P1)

**Goal**: Export panel lets the user pick any supported language + currency, defaulting to the app's current values; visible amounts convert; payload stays canonical.

**Independent Test**: `data-export-panel.test.tsx` asserts selectors default to current language+currency; a currency change re-renders visible amounts while the embedded payload is unchanged.

### Tests first (RED)

- [X] T026 [P] [US2] Write `web/test/data-export-panel.test.tsx` (jsdom, RED): language + currency selectors present with `aria-label`, pre-selected to the store's current `language`/`currency` (SC-002); changing them updates export options.
- [X] T027 [P] [US2] Add a currency-independence vector to `web/test/dataFile/registry-compat.test.ts` (or a new `import-dedup.test.ts`): same records exported with `display.currency` usd vs jpy vs bdt → identical section payloads (G1/D5).

### Implementation

- [X] T028 [US2] Wire language + currency `<select>`/Seg into `DataExportPanel.tsx`, defaulting to store `language`/`currency`; pass through to `buildDataFile`; section toggles (all-on default).
- [X] T029 [US2] In `export.ts`/`renderModel`, convert visible amounts via `rate(currency)` + `formatMoney` (display only); assert records keep canonical USD cents. Income `+`, Unicode minus, never red, never abbreviated.
- [X] T030 [US2] Run `cd web && npm test` — panel + currency-independence tests green.

**Checkpoint**: Any language × currency exports; payload provably currency-independent.

---

## Phase 6: US3 — Upload a PDF to refill data (Priority: P1)

**Goal**: Upload an exported PDF → validate → preview per-section counts → confirm → records created via existing mutations. Non-Ortho/corrupt/unknown-version rejected with no changes.

**Independent Test**: `data-import-panel.test.tsx` + import integration: exported PDF re-imported into an empty store recreates all records; a random PDF is rejected with no writes.

### Tests first (RED)

- [X] T031 [P] [US3] Write `web/test/data-import-panel.test.tsx` (jsdom, RED): file picker → `planImport` preview counts shown before confirm → confirm calls apply → summary; a non-Ortho file shows the calm reject message and triggers no store mutation.

### Implementation

- [X] T032 [US3] Implement `apply` in both sections: `sections/transactions.ts` creates `plan.add` via `addTransaction` (splits preserved, unknown-person → `currentPersonId`); `sections/housing.ts` creates via `addProperty` (nested mortgage/lease/units) + `addRentalPayment`. **Additive only** (G7/G10).
- [X] T033 [US3] Implement `web/lib/dataFile/import.ts`: `planImport(envelope, store): ImportResult` (per-section, unknown keys → `known:false`) and `applyImport(plans, store)` (calls `section.apply` for known sections only).
- [X] T034 [US3] Implement `web/components/settings/DataImportPanel.tsx`: file input (aria-labelled) → `readEnvelope` → on `ok:false` show reason-keyed message; on ok show preview counts → Confirm → `applyImport` → summary. Tokens only, no red.
- [X] T035 [US3] Mount `DataImportPanel` in `DataSection.tsx`/`settings/data/page.tsx` alongside export.
- [X] T036 [US3] Run `cd web && npm test` — import panel + prior tests green.

**Checkpoint**: Full round-trip UI: export then import restores data; bad files rejected safely.

---

## Phase 7: US4 — Import without duplicates (Priority: P1)

**Goal**: Two-tier dedup makes import additive + idempotent; summary reports added vs already-there.

**Independent Test**: `import-dedup.test.ts` golden vectors: tier-1 idempotency, tier-2 fuzzy hit/miss, tier order, additive-only via spies.

### Tests first (RED)

- [X] T037 [P] [US4] **Done (adjusted):** the deterministic fixtures live as node-env Vitest suites (`test/dataFile/import-dedup.test.ts`, `registry-compat.test.ts`) covering round-trip, currency-independence, tier-1 idempotency, tier-2 hit/miss, unknown-section skip, and empty household — NOT a `shared/test-vectors` file. The `shared/` vectors are a cross-implementation (web↔iOS) parity lock for pure finance math; this is web-only orchestration (iOS is frozen), so a shared vector would add drift-gate surface with no parity consumer. `npm run gen:vectors` stays clean (no drift).
- [X] T038 [P] [US4] Write `web/test/dataFile/import-dedup.test.ts` (RED) consuming the vectors: idempotency (second `planImport` → `added:0` every section, G8/G9), tier order (id match short-circuits tier 2, G11), additive-only (store-create spy count === Σ `plan.add`, G10).

### Implementation

- [X] T039 [US4] Implement `dedupe` in `sections/transactions.ts`: tier-1 by `id` present in store; tier-2 via `web/lib/csv/duplicateMatch.ts` `findDuplicateId({dateISO,amountCents,merchant}, existing)` → `skipByContent`; else `add`.
- [X] T040 [US4] Implement `dedupe` in `sections/housing.ts`: property tier-1 by `id`, tier-2 by normalized `address`; rentalPayment identity `(property_id,date,amount_cents)`; else `add`.
- [X] T041 [US4] Surface dedup results in `DataImportPanel` summary: per-section "added N · already there M"; unknown sections "skipped (from a newer version)". Plainspoken, no red.
- [X] T042 [US4] Run `cd web && npm test` + `npm run gen:vectors && git diff --exit-code shared/test-vectors` — dedup vectors green and vector-drift clean.

**Checkpoint**: Re-import is a safe no-op; overlapping import adds only the new. Feature functionally complete.

---

## Phase 8: Polish & Cross-Cutting

- [~] T043 [P] **Deferred to follow-up (not a merge gate):** all new `t('…')` strings are wired for translation and gracefully fall back to English in non-English UIs (the repo's existing behavior for untranslated strings; cf. the "38 missing strings" gap in the NYC market analysis). Professional translations for the ~25 new strings across `bn/es/ja/zh/ko` are a follow-up — hand-adding machine translations risks the placeholder-parity + reachability guards, so they're intentionally left to fallback rather than shipped possibly-wrong. Category/currency/common labels reused by the PDF are already translated.
- [X] T044 [P] Update `docs/web.md` (settings route tree + the new `web/lib/dataFile/` module) and `docs/index.md`/`docs/shared.md` (new `data-file-dedup.json` vector). Note the client-side pdf-lib/unpdf stack.
- [X] T045 Run full gate: `cd web && npx tsc --noEmit` (zero errors) and `npm test` (all green), then `npm run gen:vectors && git diff --exit-code shared/test-vectors`.
- [X] T046 Verify `web/lib/csv/duplicateMatch.ts` and `web/lib/share.ts` are unchanged/reused (no regression to CSV import or existing share).
- [X] T047 **Done:** provisioned `NotoSans{JP,KR,SC,Bengali}-Regular.ttf` into `web/public/fonts/` as static glyf Regular instances (`fontTools.varLib.instancer`) of Google's variable Noto families (~22 MB total). Embed + subset + script-draw verified headlessly in `test/dataFile/fonts-embed.test.ts` (incl. Bengali complex shaping via a lazy `regenerator-runtime` polyfill on the custom-font path). **Remaining follow-up:** pixel-level on-device / real-browser glyph QA (no-tofu, correct conjuncts) — the one thing a Linux sandbox can't check.

---

## Dependencies & Execution Order

- **Phase 1 (Setup)** → **Phase 2 (Foundational)** block everything.
- **Phase 3 (US5 sections)** depends on Phase 2; blocks US1/US3/US4 (they need sections).
- **Phase 4 (US1 export)** depends on US5 sections + envelope + pdf gen/read.
- **Phase 5 (US2 lang/currency)** depends on US1 (export path + panel exist).
- **Phase 6 (US3 import)** depends on US1 (readPdf) + US5 (`apply`).
- **Phase 7 (US4 dedup)** depends on US5 (`dedupe`) + US3 (import pipeline surfaces the counts).
- **Phase 8 (Polish)** last.

### Parallel opportunities

- T005/T006 (foundational tests) parallel.
- T010/T011 (section tests) parallel; T016/T026/T027 test-writing parallel.
- T043/T044 (i18n + docs) parallel in Polish.

---

## Implementation Strategy

### MVP (Phases 1–4): export a valid, round-trippable PDF (US1 + US5 machinery). Stop and validate the payload round-trip.

### Incremental (Phases 5–7): language/currency choice (US2), then import (US3), then dedup safety (US4) — each an independently testable slice.

### Polish (Phase 8): i18n, docs, full gate; CJK font provisioning + on-device glyph QA is an explicit non-headless follow-up (T047), not a merge blocker.

---

## Notes

- Every logic task has a failing test/vector first (Constitution VI). `npm test` green after every phase.
- No schema changes. `var(--token)` only; loss/cost never red; hit targets ≥ 40px; real semantic controls with aria-labels.
- Amounts are canonical USD cents in the payload; display currency conversion touches only the visible layer.
- `generatedAt` and any timestamps are injected/passed in, never `Date.now()` inside pure/tested code paths (determinism).
