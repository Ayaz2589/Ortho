# Phase 0 Research: PDF Data Export & Import

All findings below were verified against current (2025/2026) library docs, npm, and issue trackers via web search — not from memory alone.

---

## Decision 1 — PDF generation library

**Decision**: `pdf-lib` (^1.17.1) + `@pdf-lib/fontkit` (^1.1.1).

**Rationale**:
- **Only candidate with a real file-attachment API** (`PDFDocument.attach(bytes, name, opts)` → PDF `EmbeddedFiles` name tree). Our design requires stashing a machine-readable JSON payload *inside* the PDF; jsPDF/pdfmake/@react-pdf have no attachment API.
- Runs in browser, Node, Deno, React Native — works under static export + Capacitor AND runs **headlessly in node** for tests (no canvas/DOM needed for `create → embedFont → drawText → attach → save`).
- Supports custom TTF font embedding with subsetting (`embedFont(bytes, { subset: true })`) after `registerFontkit(fontkit)`.

**Alternatives considered**:
- **jsPDF** — no attachment API; whole-font embedding (no true subsetting). Only attractive as the raster fallback (html2canvas → jsPDF).
- **pdfmake** — no attachment API; vfs font model is awkward for lazy per-language loading.
- **@react-pdf/renderer** — heavier, no attachment API, and its renderer is less suited to headless payload tests.

**Key API**:
```ts
import { PDFDocument } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
const doc = await PDFDocument.create()
doc.registerFontkit(fontkit)
const font = await doc.embedFont(fontBytes, { subset: true })
await doc.attach(new TextEncoder().encode(JSON.stringify(envelope)), 'ortho-export.json', {
  mimeType: 'application/json', description: 'Ortho data file payload v1',
})
const bytes = await doc.save()
```

---

## Decision 2 — Reading the embedded payload back

**Decision**: `unpdf` (^1.6.2) via pdf.js `getAttachments()`. **Promote `unpdf` from devDependency → dependency** (runtime use).

**Rationale**:
- Base **pdf-lib cannot read attachments** it wrote — the `getAttachments` PR (#1242) is **closed/unmerged**; it only lives in the unmaintained `@cantoo/pdf-lib` fork (no npm publish in 12+ months). Do not depend on that fork.
- **pdf.js exposes `PDFDocumentProxy.getAttachments()`** returning named attachments → `{ filename, content: Uint8Array }`. `unpdf` ships a serverless pdf.js build that runs in node, so read-back is **unit-testable headlessly**.

**Key API**:
```ts
import { getResolvedPDFJS } from 'unpdf'
const { getDocument } = await getResolvedPDFJS()
const pdf = await getDocument(new Uint8Array(bytes)).promise
const attachments = await pdf.getAttachments()          // { [name]: { filename, content } }
const envelope = JSON.parse(new TextDecoder().decode(attachments['ortho-export.json'].content))
```

**Round-trip test contract**: `data → attach+save → bytes → getAttachments → JSON.parse → deepEqual(data)`.

**Alternatives considered**: custom XMP metadata (pdf-lib can't write arbitrary XMP keys — issue #352); hidden text markers (raster/subsetting can mangle text; brittle). Both rejected in favor of a structured, binary-safe file attachment.

---

## Decision 3 — Multi-script fonts (the key risk)

**Decision**: Ship **TTF/`glyf`-outline Noto** fonts under `web/public/fonts/`, **lazy-loaded per selected language** at export time. Latin (Noto Sans) is the bundled always-available default and fallback.

**Rationale / verified facts**:
- **No single font covers Latin + Bengali + JP + SC + KR** — Noto is explicitly a *collection*; a single global font is technically impossible.
- **pdf-lib's subsetter is broken for CFF/OTF** Noto CJK (`.otf`/`.otc`; issues #494, #664 — "Font DICT invalid without 'Private' entry"). **The `glyf`-outline TTF variants subset correctly.** → Must use TTF from Google Fonts / `@fontsource/noto-sans-*`, never `.otf`/`.otc`.
- Realistic source sizes: Noto Sans Latin ~0.3–0.5 MB; Bengali ~0.4–0.8 MB; JP ~4.5–7 MB; KR ~5–9 MB; SC ~7–10 MB. Unified CJK OTC ~16 MB (avoid).
- **Subsetting shrinks the OUTPUT PDF, not the app bundle** — the full source font must be loaded into the browser to subset from. So we **must not bundle** the CJK fonts into the JS. Instead `fetch('/fonts/NotoSans<Lang>.ttf')` **only for the chosen language** at export time; the exported PDF then carries only the ~30–60 KB subset.
- **Static-export + Capacitor CSP**: same-origin `fetch` of a local static file is allowed by default; on iOS the bundle is served from the app's own origin so `/fonts/*.ttf` is same-origin — no `connect-src` relaxation needed. Fonts ship inside the web bundle → offline-available on device.

**Alternative considered — raster (html2canvas/html-to-image → jsPDF)**: the browser rasterizes text, so *any* script the WebView renders works with zero font embedding. Rejected as the primary because for a multi-page, hundreds-of-rows financial document it yields large files, non-selectable/non-searchable text, and it **requires a real browser/canvas** (not testable headlessly). Kept as a documented escape hatch if a specific script's TTF won't subset; if used, still run a final `pdf-lib.attach()` pass to embed the payload.

**Provisioning + QA caveat (explicit)**: committing the large CJK TTFs and verifying that glyphs actually render (no tofu) requires on-device / real-browser QA — **not possible in the Linux sandbox**. Implementation ships the Latin path (fully working + testable) and the lazy-loader seam; provisioning the CJK TTF binaries and on-device glyph QA is a tracked follow-up. The font provider (`loadFontForLanguage`) falls back to Latin if a script's asset is absent, so export never hard-fails for a missing font — it degrades to Latin glyphs for that run.

---

## Decision 4 — Two-tier deduplication

**Decision**: Tier 1 exact canonical-id match → skip; Tier 2 (id absent locally) content-fuzzy match reusing `web/lib/csv/duplicateMatch.ts` (`findDuplicateId` / `merchantsSimilar`) → skip; otherwise add. Additive + idempotent, never delete/overwrite.

**Rationale**:
- We control the export format, so every record carries its canonical primary key — exact-id dedup makes re-import of an unchanged backup a guaranteed no-op (idempotency, SC-005).
- The fuzzy fallback handles records whose local id differs (e.g. a hand-entered equivalent of an exported transaction) using the already-tested matcher (amount + fuzzy merchant + ±3-day window). Reuse avoids a second, drifting matcher.
- Housing sub-records dedup by natural identity (property by id then address; rental payment by property+date+amount) since they lack a merchant/amount fuzzy analog.

**Alternatives considered**: content-hash-only dedup (misses legitimately edited records and can't distinguish same-shape different-day recurring charges); overwrite/merge on id match (out of scope for v1 — additive-only is safer and matches the "refill" framing).

---

## Decision 5 — Testability split

**Decision**: Make the headlessly-verifiable core the test backbone; document glyph rendering as manual QA.

**Headlessly testable (Vitest, node env)** — these gate merges:
- Envelope serialize → read round-trip (identical records).
- PDF `attach` → `save` → `unpdf.getAttachments` → `JSON.parse` deep-equal.
- Two-tier dedup vectors (tier-1 idempotency, tier-2 fuzzy hit/miss).
- Currency-independence of the payload (same records, different `display.currency` → identical section payloads).
- Section forward/back-compat (unknown key skipped; missing section absent, no error).
- Attachment metadata (name = `ortho-export.json`, mime = `application/json`) and subset output-size sanity.

**Needs on-device / real-browser QA** (documented, not CI-gated): actual glyph rendering per script, pagination/layout fidelity, iOS WKWebView font fetch + CSP, native share sheet.

**Rationale**: pdf-lib and unpdf both run in node; the html2canvas raster path does not (needs canvas). Anchoring tests on the vector + payload path keeps the money/data logic fully locked per Constitution VI while being honest that font pixels can't be asserted in the sandbox.

---

## Open items resolved (no NEEDS CLARIFICATION remain)

- **Unknown-person owners on import** → resolve to `currentPersonId` (keeps splits summing; documented in spec Assumptions).
- **Selection scope** → all sections on by default; a per-section toggle is offered but not required for v1. No date-range/partial export in v1.
- **Where the UI lives** → new `Settings → Data` master-detail sub-route, consistent with the existing settings shell.
