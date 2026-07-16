# Bank-Statement Upload — Feature-Planning Research Report

## 1. TL;DR

- **We are not starting from zero.** Spec 004 (`web/scripts/import/`) is already a deterministic, pure ENGINE + thin per-bank PROFILES design, and its entire parse path is portable to the browser/edge except a single `node:fs` read. The real question is not "how do we parse statements" — it's **how do we scale past the 4 hand-built banks to arbitrary banks the family actually uses, without losing the trust anchor.**
- **Recommended architecture: a tiered HYBRID, not "per-bank" vs "generalized" as an either/or.** Tier 0 structured file (OFX/QFX/CSV) → Tier 1 the existing 4 profiles (printed-subtotal reconcile) → Tier 2 a generalized positional parser gated by a **balance-identity reconciler** → Tier 3 an opt-in Claude fallback for scanned/unknown layouts. Every tier emits the same `ParsedStatement` and feeds one `reconcile → dedupe → review → persist` path.
- **The single most important insight:** the trust anchor (today: per-bank printed-subtotal reconciliation) is what makes import *safe*, and it **generalizes without per-bank knowledge** via the balance identity — running-balance continuity (`balance[i] − balance[i-1] == signed amount[i]`) for checking accounts, and `prev + purchases + fees − payments == new balance` for cards. That is what lets us scale past 4 banks while keeping "refuse rather than guess."
- **No npm library parses arbitrary bank PDFs generically** (confirmed). The leading OSS one, `statement-parser`, is literally our profile model — per-bank, English/USD-only, dormant since 2021, Node-only. "Generalized" means *our own* coordinate-based parser + balance check, or an LLM — both gated by reconciliation.
- **Prefer machine-readable downloads.** OFX/QFX/CSV/XLSX are an order of magnitude more reliable than scraping a PDF text layer, run client-side, and (OFX/QFX) carry stable `FITID`s for better dedupe than our current day+amount heuristic. Make "bring your own file" the primary path; treat PDF as the fallback.
- **It can run on-device.** `unpdf` (already a dependency) is browser/edge-safe, and RLS already lets a signed-in user write their own rows — so the default flow keeps bytes on the device and needs no server. Only the LLM tier requires a Supabase Edge Function + explicit consent.

---

## 2. What we already have

### Spec 004 engine — reusable vs Node-bound (`web/scripts/import/`)

**Pure-reusable verbatim (import into browser/edge/React as-is):**
- `engine/types.ts`, `money.ts`, `dates.ts`, `categorize.ts`, `exclusions.ts`, `reconcile.ts` (the trust anchor), `dedupe.ts`, `csv.ts`, `detectBank.ts`, `toTransaction.ts`, `split.ts`, `ownerMatch.ts`
- All 4 profiles: `profiles/{td-bank,amex-gold,apple-card,chase-csv}.ts`
- Shared helpers: `web/lib/splits.ts`, `web/lib/format.ts`, `web/lib/finance/money.ts` (golden-vector parity-tested)

**Needs-adaptation (small, mechanical):**
- `engine/extractText.ts` — the ONLY Node seam: `readFile(path)`. `unpdf` is canvas/DOM-free and ships an `edge` export. Change signature `(path) → (bytes: Uint8Array)` and the whole parse path runs client-side.
- `engine/readInput.ts` — rewrite to `(bytes, filename/mime)`.
- `db/persist.ts`, `db/lookups.ts` — take any `SupabaseClient`; feed the user-authed browser session, not the CLI admin client.

**Discard / rewrite (operator-shell only):** `db/client.ts` (service-role — never ship to browser), `cli.ts`, `engine/render.ts` (terminal tables). The 10-step orchestration is a blueprint to re-implement in React.

**Auth already solved.** `transactions_insert` RLS is `created_by = auth.uid() AND is_household_member(household_id)` — a signed-in user can insert their own imported rows. No schema change, no service-role. Caveats: importer must belong to a household; `paid_by` written null.

### Spec 014 scan UI — what UX to reuse (`web/lib/scan/`, `web/components/`)

The web app **already contains a complete, browser-runnable statement-review pipeline** — everything except extraction:
- Reducer/brain: `web/lib/scan/scanSession.ts` (idle→parsing→interstitial→reviewing→summary) — pure, runs unchanged.
- A generalized, profile-free parser already exists: `scanParser.ts` + `scanHeuristics.ts` + `scanInference.ts` + `scanModels.ts`.
- Review chrome done and web-native: `components/web/ScanFlow.tsx`, `components/scan/ScanInterstitial.tsx`, `ScanSummary.tsx`, `TxForm.loadFromScanCandidate`.

**Missing web piece:** extraction (`bytes → ScanDocumentText`) is implemented only by the native Swift plugin. No browser impl, no `<input type=file>`, no Supabase Storage usage, no desktop scan entry.

**Smallest viable web loop:** add `<input type=file accept=application/pdf>`; add `useScanFlow.startBrowserFileImport(file)` reading `file.arrayBuffer()`, run `unpdf` per-page, adapt to `ScanDocumentText`, call existing `processDocument`. Everything downstream works unchanged, client-side, no upload.

---

## 3. Bank-specific vs generalized — the decision

**You need both, tiered — and the deciding factor is the trust anchor, not the parser.**

Per-bank reconciliation (`sum(rows) == printed Subtotal`) is trustworthy but per-bank knowledge; generalized heuristic table extraction alone is only ~81-84% accurate (Tabula/Camelot ~81%, PDFTables ~83.6% — confirmed) and fails on messy cases. Un-reconciled, unusable for money.

**Resolution — a generic trust anchor lives in almost every statement: the balance identity.** Real OSS parsers prove it: `bankstatementparser` verifies with the "Golden Rule" (`opening + credits − debits == closing`), per-currency, emitting `VERIFIED / DISCREPANCY / UNVERIFIABLE / FAILED`; `pdf_statement_reader` validates the running balance.

Two enabling facts: `unpdf`'s `getDocumentProxy()` returns a real pdf.js `PDFDocumentProxy`, so `getTextContent()` yields per-item `transform` (x/y) — **coordinate/column reconstruction with the dependency we already ship** (confirmed). There is **no JS/TS table library** (Camelot/Tabula/pdfplumber are Python/Java) — we build row-by-y/column-by-x clustering ourselves.

| Tier | Path | Reconciliation anchor | Cost / where |
|---|---|---|---|
| 0 | Structured file (OFX/QFX/CSV/XLSX) | format's balance fields + FITID dedupe | free, client-side |
| 1 | `detectBank()` → 4 profiles | printed subtotal (strongest) | free, client-side |
| 2 | Generalized positional parser | running-balance + Golden Rule + count sanity | free, client-side |
| 3 | Claude (opt-in) | **same** balance verifier over LLM output | ~$0.05-0.50/stmt, Edge Function |

If no anchor is found → `UNVERIFIABLE`, force full manual review — never import silently.

---

## 4. npm libraries & tools

**Reliability headline: "just download the machine-readable file."** OFX/QFX, CSV, XLSX are structured exports — more reliable than any PDF path, run client-side, and OFX/QFX carry stable `FITID`s.

| Format | Library | Browser/Node/Edge | Status | Notes |
|---|---|---|---|---|
| PDF text + coords | **`unpdf`** (already a dep, MIT) | ✅/✅/✅ | **confirmed** | `getDocumentProxy → getTextContent().items[].transform` gives x/y — no new dep for tables. Throws on scanned PDFs. |
| PDF | ~~`pdf-parse`~~ | Node (fragile) | **avoid** | Serverless footgun (sync fs read of bundled test PDF); no coords. |
| PDF | `pdfjs-dist`/`pdf2json`/`pdfreader` | mixed | possible/weak | Redundant with `unpdf`; `pdfreader` Node-only. |
| CSV | **`papaparse`** (MIT) | ✅/✅ | strong | Handles BOM/CRLF/embedded newlines our ~40-line `engine/csv.ts` misses. |
| OFX/QFX | **`ofx-data-extractor`** (TS, MIT) | ✅/✅ | strong | `Ofx.fromBlob`/`fromBuffer`; maintained to 2026-03. Verify vs real exports; lenient mode. |
| XLSX | **ExcelJS** (MIT) | ✅/✅ | **preferred** | Stays on npm. |
| XLSX | SheetJS `xlsx` | ✅/✅ | **caveat** | **No longer on npm** (frozen 0.18.5); 0.20.x only from cdn.sheetjs.com, bypasses `npm audit`. Prefer ExcelJS. |
| "generic" PDF | `statement-parser` | Node | **avoid** | Per-bank (~4), "English USD only," dormant since Oct 2021. |

**OCR (fallback tier only):** `tesseract.js` (browser WASM, $0) — confirmed weak for statements (flat text, ~85-90% char, 60-80% row-level; digit errors break penny reconciliation). Azure `prebuilt-bankStatement.us` — ~$0.01/page, US-only, structured JSON, server-only. Google Bank Statement Parser — $0.75/doc, server-only. AWS Textract — NO statement model, skip. iOS Vision (on-device, free, table structure in iOS 26) — already wired for the iOS phase.

**Aggregation APIs (connect the account):** **Teller** — free dev tier ~100 live connections + free sandbox, ~7,000 institutions; the only option fitting a household without a sales call; production needs KYB + paid. **Plaid** — "200 free calls" deprecated → Trial plan (~10 Production Items); Transactions ~$0.25/acct/mo (buyer-reported); production needs KYB, LEI required but not currently enforced. Avoid MX/Finicity/Yodlee/Akoya (enterprise). GoCardless/Nordigen EU-only.

**Templateless SaaS:** CapyParse $24/mo for 150 pages (CSV/Excel/QBO); AccountingConverter from $15/mo/500 pages (JSON). Statements leave the device.

**LLM (Claude):** PDF document block reads each page as text + image → handles scanned statements. Limits 32MB/req, 600 pages. Structured output guarantees shape not values; incompatible with citations same call. Pricing: Haiku 4.5 $1/$5, Sonnet 5 $3/$15 ($2/$10 intro to 2026-08-31), Opus 4.8 $5/$25 per 1M. **~$0.05-0.50/statement, ~$1-3/mo for a family**, halvable via Batch API.

---

## 5. Recommended approach (phased)

**Phase 1 — Web upload behind the existing engine (known banks + CSV/OFX).** Adapt `extractText(bytes)`/`readInput(bytes)`; reuse `detectBank` + 4 profiles + `reconcile` + `dedupe` + `toTransaction` verbatim; add `papaparse` + `ofx-data-extractor`; wire file input + `startBrowserFileImport` into existing `ScanFlow`; persist via user session. *Effort:* moderate. *Risk:* low. *Unlocks:* real end-user upload for 4 banks + any bank exporting CSV/OFX/QFX, fully client-side, bytes never leave device.

**Phase 2 — Generalized parser + generic reconciliation + review queue.** Coordinate row/column clustering on the unpdf/pdf.js proxy; tiered reconciler (`VERIFIED`/`DISCREPANCY`/`UNVERIFIABLE`, per-currency, running-balance + Golden Rule + count sanity); `needs-review` staging with confidence badges + `source_method` provenance + **import-batch id + "undo this import"** (current persist is row-by-row with no batch id). *Effort:* high. *Risk:* medium (correctness rests on balance check + human review; degrades to UNVERIFIABLE). *Unlocks:* arbitrary banks with a text-layer PDF + balance column — the core goal, still free/offline.

**Phase 3 — Opt-in Claude fallback (and/or aggregation spike).** Supabase Edge Function `parse-statement`, consent-gated, ZDR. Prefer text-only route (extract on-device with unpdf, redact account numbers, send text); PDF document block only for scanned. Same balance verifier over LLM output — LLM is untrusted extractor gated by trusted checker. Default Sonnet 5 (or Haiku-first, escalate). Optionally spike Teller — budget for KYB. *Effort:* medium. *Risk:* medium-high (privacy + non-determinism, mitigated by consent + ZDR + reconcile gate). *Unlocks:* scanned/image-only + arbitrary layouts.

---

## 6. Where parsing runs / privacy

Static-export Next has **no server** — a "server route" can only be a Supabase Edge Function (Deno), never a Next API route. That pushes the minimal-risk answer toward the client (`unpdf` runs in the Capacitor webview).

**Recommended default (Phases 1-2):** pick PDF → read into `Uint8Array` in memory (no upload) → `unpdf` extracts on-device → engine `detectBank → parse → reconcile → categorize → markDuplicates` (dedupe vs user's own rows) → review → on confirm, insert `transactions` (+ `transaction_shares`) via user session → **discard bytes and text.**

**Minimal-risk defaults:** don't persist raw PDF or full text (bank statements are high-value NPI); never log statement content; never reuse the CLI `--admin`/service-role path; Edge Function limits (2s CPU/req) → don't run server-side PDF.js; the LLM tier is the one place data leaves first-party — document as intentional, opt-in, consent-gated divergence from spec-014, under ZDR.

---

## 7. Open questions for the user

1. **Cloud LLM at all, or strictly local/deterministic?** Decides whether we ever reach scanned/arbitrary banks (Phase 3) or cap at text-layer PDFs + structured files (Phases 1-2).
2. **Files-only, or also an aggregation API (Teller spike)?** Removes the monthly-upload chore + per-bank treadmill, but adds registered-business + KYB + standing custody of the family's live bank link.
3. **Which banks/formats first — do the family's real banks offer OFX/QFX/CSV downloads?** If most do, Phase 1 covers them cheaply/privately, Phase 2 lower priority.
4. **Web-first only, or iOS parity in the same spec?** iOS already has a native on-device Vision path; web needs the new browser extractor.
5. **Persist raw statements for audit/undo, or strict no-file-at-rest?** Recommendation: no-file-at-rest (import-batch id + undo gives the useful part without storing NPI).
6. **`paid_by` on imported rows** — leave null or default to uploader? Affects settle-up math.

---

## 8. Suggested next step

Run **`/speckit-specify`**. One-line framing:

> *"In-app end-user upload of bank statements (web first), parsed into reviewable transactions via a tiered pipeline — structured files (OFX/QFX/CSV) and the existing 4 deterministic bank profiles first, a generalized coordinate-based PDF parser gated by generic balance-identity reconciliation second, and an opt-in, consent-gated Claude fallback (Supabase Edge Function, ZDR) for scanned/unknown statements — all feeding one reconcile → dedupe → review → persist path that writes under the user's own RLS session and never persists the raw file."*
