# Implementation Plan: PDF Data Export & Import (Ortho Data File)

**Branch**: `feat/pdf-data-export` (spec dir `032-pdf-data-export`) | **Date**: 2026-07-27 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/032-pdf-data-export/spec.md`

---

## Summary

Let users **download their household data as a single PDF** and later **upload that PDF to refill their data** without creating duplicates. v1 covers two sections — **transactions** and **housing** — behind a **versioned section-registry envelope** so future sections (widgets, budgets, goals) plug in additively.

The PDF is dual-layer: a **human-readable presentation** (rendered in any of the 6 languages × 7 currencies, defaulting to the app's current pair) plus an **embedded machine-readable JSON payload** that is the authoritative source for re-import. The ledger stays **USD integer cents**; display currency is render-time only, and the embedded payload always stores canonical cents so re-import is lossless and currency-choice-independent.

Import reads the embedded payload (never scrapes visible text), validates the format version, and applies **two-tier dedup**: exact by canonical record id, then fuzzy content match (reusing the existing CSV-import matcher) for records without an id hit. Import is **additive and idempotent**.

**Technical approach** (verified via research, see [research.md](./research.md)): `pdf-lib` + `@pdf-lib/fontkit` for generation and payload attachment; `unpdf` (pdf.js `getAttachments()`) for read-back; lazy per-language TTF Noto fonts for the visible layer. The **payload round-trip and dedup are fully headlessly testable** (Vitest, node env) and form the test backbone; **glyph rendering is on-device visual QA**, documented as a follow-up (a Linux sandbox cannot render/verify fonts).

---

## Technical Context

**Language/Version**: TypeScript 5.x + React 19

**Primary Dependencies**: Next.js 16 (App Router, `output: 'export'`), Tailwind v4, Supabase (data layer, unchanged). **New**: `pdf-lib` (^1.17.1), `@pdf-lib/fontkit` (^1.1.1). **Promoted dep**: `unpdf` (^1.6.2, devDep → dep — now used at runtime for import). Testing: Vitest + React Testing Library.

**Storage**: No schema changes. Reads existing store (`useApp()`); writes via existing mutations (`addTransaction`, property/rental mutations). Display currency + language read from store. New static assets: TTF fonts under `web/public/fonts/`.

**Testing**: Vitest (`cd web && npm test`), node env by default (jsdom opt-in per file via `// @vitest-environment jsdom`). New golden vectors under `shared/test-vectors/` for envelope round-trip + dedup where they fit. `npx tsc --noEmit` is a CI gate. Vector-drift check (`npm run gen:vectors`) must stay green.

**Target Platform**: Responsive web (Vercel) + Capacitor iOS shell. Client-side only; no server/edge function.

**Project Type**: Web application (Next.js static export → Capacitor iOS). Single project under `web/` + `shared/`.

**Performance Goals**: Interactive. Export of a typical household (hundreds of transactions) completes in < 15s (SC-001). Dedup is O(n·m) over the ledger, bounded to household scale. Fonts lazy-loaded per language so the JS bundle is unaffected.

**Constraints**: `output: 'export'` — all new code is `'use client'`, reads the store, no server components with dynamic data, no new routes required beyond a Settings sub-page. **`web/AGENTS.md`: this is a modified Next.js — read `node_modules/next/dist/docs/` before writing any Next-specific code.** CSP/Capacitor: fonts are same-origin static assets (`/fonts/*.ttf`), fetched on demand — no CSP relaxation needed. pdf-lib CFF subsetting is broken → **TTF/`glyf` Noto only**, never `.otf`/`.otc`.

**Scale/Scope**: Households 1–4 people, hundreds (not millions) of transactions. 6 languages × 7 currencies = 42 display combinations. Two sections in v1; registry designed for N.

---

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Status |
|-----------|-------|--------|
| I. One Design System, Tokens Only | New Settings → Data UI uses `var(--token)` only. PDF visible layer uses token-derived colors (graphite text, hairlines) — no palette additions. Amounts never red. | ✅ Required |
| II. Calm Over Dense | Export/import panels are inset cards, hairlines, no shadow (except the drawer/modal chrome itself). PDF is a calm money document — no gradients, no color-coded status. | ✅ Required |
| III. Right Form Factor Per Canvas | Settings → Data is a master-detail sub-page on desktop, list-then-detail on mobile (matches existing settings pattern). Download uses `share.ts` (native share sheet on iOS, download on web). | ✅ Required |
| IV. Plainspoken Voice & Money Formatting | "Download your data", "Restore from a file", "Already in your data (skipped)". Money via existing `formatMoney` (tabular, `+` income, Unicode minus, never abbreviated). | ✅ Required |
| V. Accessible & Interaction-Complete | Selectors are `<select>`/`Seg` with `aria-label`; file input is a real labelled control; all buttons `<button type="button">`, hit targets ≥ 40px. | ✅ Required |
| VI. Test-Driven & Regression-Safe (NON-NEGOTIABLE) | Envelope serialize/read, PDF attach→read round-trip, two-tier dedup, currency-independence, and section forward/back-compat are all written test-first with node-env Vitest + golden vectors. Glyph rendering is the one part not headlessly gateable — documented as manual QA, and it does not touch pure money math. | ✅ Non-negotiable |

**No violations.** No Complexity Tracking entry needed. No schema change, no new palette, no red.

**One documented limitation (not a violation):** visible-layer glyph rendering for non-Latin scripts cannot be asserted headlessly and is covered by on-device QA. All *money/date logic* (dedup, cents, conversion-independence, envelope integrity) remains fully test-locked per Principle VI.

---

## Project Structure

### Documentation (this feature)

```text
specs/032-pdf-data-export/
├── plan.md              # This file
├── research.md          # Phase 0 — library + font + dedup decisions (verified)
├── data-model.md        # Phase 1 — envelope, section, import-result shapes
├── quickstart.md        # Phase 1 — runnable validation scenarios
├── contracts/
│   ├── data-file-envelope.md   # envelope + section registry contract
│   └── import-dedup.md         # import pipeline + two-tier dedup contract
├── checklists/
│   └── requirements.md         # spec quality checklist (done)
└── tasks.md             # Phase 2 (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
web/
├── lib/
│   └── dataFile/                       # NEW module (the whole feature core)
│       ├── envelope.ts                 # ExportEnvelope type + version constant + validate()
│       ├── registry.ts                 # SectionRegistry + Section interface + register()
│       ├── sections/
│       │   ├── transactions.ts         # transactions Section (serialize/read/dedupe/render-model)
│       │   └── housing.ts              # housing Section (properties + mortgage/lease/units + rentals)
│       ├── pdf/
│       │   ├── generate.ts             # buildPdf(envelope, renderModels, {lang, currency, ...}) → Uint8Array
│       │   ├── fonts.ts                # lazy per-language font loader (/public/fonts/*.ttf) + Latin fallback
│       │   └── layout.ts               # low-level pdf-lib drawing helpers (rows, headings, pagination)
│       ├── readPdf.ts                  # extract embedded payload via unpdf getAttachments()
│       ├── export.ts                   # orchestrate: store → envelope → renderModels → pdf bytes
│       └── import.ts                   # orchestrate: bytes → envelope → per-section dedup → ImportResult/apply
├── components/
│   └── settings/
│       ├── DataSection.tsx             # NEW: Settings → Data panel (export + import entry)
│       ├── DataExportPanel.tsx         # NEW: language + currency selectors, section toggles, Download
│       └── DataImportPanel.tsx         # NEW: file picker → preview counts → confirm → summary
├── app/(app)/settings/
│   ├── data/page.tsx                   # NEW: settings sub-route (desktop master-detail + mobile)
│   └── layout.tsx / SettingsSecondaryNav.tsx  # update: add "Data" nav entry
├── public/fonts/                       # NEW: NotoSans (Latin) always; JP/KR/SC/Bengali TTF per-lang
└── test/
    ├── dataFile/
    │   ├── envelope.test.ts            # round-trip + version validate
    │   ├── sections-transactions.test.ts
    │   ├── sections-housing.test.ts
    │   ├── pdf-roundtrip.test.ts       # attach → save → unpdf read → deepEqual
    │   ├── import-dedup.test.ts        # two-tier dedup, idempotency, currency-independence
    │   └── registry-compat.test.ts     # unknown/missing section forward-back compat
    ├── data-export-panel.test.tsx      # defaults to current lang+currency; selectors work
    └── data-import-panel.test.tsx      # preview → confirm → summary; rejects non-Ortho file

shared/
└── test-vectors/
    └── data-file-dedup.json            # golden vectors: dedup outcomes + envelope round-trip cases
```

**Structure Decision**: Single-project web app. All logic lives in a new self-contained `web/lib/dataFile/` module (pure + testable), with a thin UI layer under `components/settings/` and one new settings sub-route. `shared/` gains one vector file. No new packages beyond the two pdf libs; no new routes beyond `settings/data`.

---

## Phase 0: Research

*See [research.md](./research.md) for full, web-verified findings. Decisions:*

1. **Generation lib = `pdf-lib` + `@pdf-lib/fontkit`** — the only candidate with a real `attach()` EmbeddedFiles API (our payload requirement) and font subsetting; runs headlessly in node for tests.
2. **Read-back = `unpdf` (pdf.js `getAttachments()`)** — base pdf-lib cannot read attachments; the upstream PR is closed/unmerged. `unpdf` ships a serverless pdf.js and reads attachments in node → the round-trip is unit-testable. Promote `unpdf` to a runtime dependency.
3. **Payload location = embedded FILE attachment** `ortho-export.json` (structured, binary-safe, tool-portable) — not custom XMP (pdf-lib can't write arbitrary keys) and not hidden text (raster/subset mangles it).
4. **Fonts = TTF/`glyf` Noto, lazy per language** from `/public/fonts`. CFF/OTF subsetting is broken in pdf-lib. Latin (Noto Sans) bundled as always-available default; JP/KR/SC/Bengali fetched on demand and embedded `{ subset: true }` (shrinks output, source stays out of the JS bundle). Same-origin fetch works under static-export + Capacitor CSP.
5. **Dedup = two-tier**, reusing `web/lib/csv/duplicateMatch.ts` (`findDuplicateId`/`merchantsSimilar`) for the fuzzy fallback. Exact-id first, content-fuzzy second, additive + idempotent.
6. **Testability split**: payload round-trip, dedup, currency-independence, and section compat are node-headless-testable (the backbone). Glyph rendering + pagination fidelity + iOS font fetch = on-device QA, documented, not CI-gated.

---

## Phase 1: Design & Contracts

*See [data-model.md](./data-model.md) and [contracts/](./contracts/) for full detail.*

### Key Design Decisions

**D1 — Versioned envelope.** `ExportEnvelope = { formatVersion: 1, generatedAt, app: {name, version}, household: {id, name}, display: {language, currency}, sections: SectionPayload[] }`. `display` records what the *visible* layer used (for provenance) but has **no effect on import** — amounts inside sections are always USD cents. `validate(envelope)` rejects unknown/unsupported `formatVersion` with a typed error and zero side effects.

**D2 — Section interface (the extensibility seam).** Each section is:
```
interface DataSection<TRecord> {
  key: string                                   // 'transactions' | 'housing' | future
  serialize(store): TRecord[]                   // store → canonical records (USD cents)
  read(payload): TRecord[]                      // envelope section payload → records (+ version-tolerant)
  dedupe(records, store): SectionDedupePlan      // { add, skipById, skipByContent }
  apply(plan, store): Promise<void>             // create the `add` records via existing mutations
  renderModel(records, ctx): SectionRenderModel  // headings + rows for the PDF visible layer
}
```
Registry holds an ordered list; export maps over registered sections, import looks up by `key` and **skips unknown keys with a note** (FR-020). Adding a section = one file + one `register()` call; no edits to existing sections (FR-019, SC-007).

**D3 — Canonical id dedup.** Records carry their canonical primary key (transaction id, property id, rental payment id). Tier 1: if that id already exists in the store → `skipById`. Tier 2 (records whose id is absent locally): transactions fall through to `findDuplicateId` (amount + fuzzy merchant + ±3 day). Housing sub-records dedup by natural identity (property by id/address; rental payment by property+date+amount). Everything else → `add`.

**D4 — Additive apply only.** `apply` only creates `add` records. It never updates or deletes. Transactions created via `addTransaction` (which routes through the atomic `upsert_transaction` write path, preserving splits). Housing created via the existing property/mortgage/lease/unit/rental mutations. Unknown-person owners resolve to `currentPersonId` (documented in Assumptions), keeping splits valid.

**D5 — Currency independence proven by test.** A golden vector exports the same records with `display.currency` = usd vs jpy vs bdt; the embedded section payloads must be byte-identical. Import ignores `display` entirely. This locks FR-006/FR-007/SC-004.

**D6 — Font provider abstraction.** `pdf/fonts.ts` exposes `loadFontForLanguage(language): Promise<FontBytes>` — Latin bundled, others `fetch('/fonts/…')` on demand with a Latin fallback if an asset is missing (so English/Spanish always work even if CJK assets aren't provisioned). This isolates the one non-headless-verifiable dependency behind a seam and lets the rest of the pipeline be tested with a stub font.

**D7 — Download/share.** Web: trigger a Blob download (and offer `share.ts`); iOS: `share.ts` (native share sheet). File name: `ortho-<household>-<YYYY-MM-DD>.pdf`.

### New golden vectors (summary)

`shared/test-vectors/data-file-dedup.json`:
1. Round-trip: a fixture household → envelope → read back → identical records.
2. Currency-independence: same records, three display currencies → identical payloads (D5).
3. Dedup tier 1: all ids present → all `skipById`, zero `add` (idempotency).
4. Dedup tier 2: id absent but content matches → `skipByContent`; id absent + no content match → `add`.
5. Section compat: envelope with an unknown section key → known sections import, unknown skipped.
6. Empty household → valid envelope with empty section payloads.

### Agent context update

Update the managed pointer in root `CLAUDE.md` to reference this plan (via `speckit-agent-context-update` hook / `after_plan`).

---

## Complexity Tracking

No constitution violations. No entry needed.
