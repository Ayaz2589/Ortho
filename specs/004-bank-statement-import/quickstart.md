# Quickstart: Bank-Statement PDF Import CLI

End-to-end validation guide. Assumes the feature is implemented per plan.md.

## Prerequisites
- Node + the `web/` deps installed (`cd web && npm install`), including the new `pdfjs-dist`.
- `web/.env.local` has `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- For sign-in mode: your Ortho account email (set `IMPORT_EMAIL` or be prompted). Auth is email OTP — the tool emails a 6-digit code which you enter at the prompt (no password).
- A statement PDF. The sample used in tests: `iOS/temp/View PDF Statement_2026-05-25.pdf` (TD Bank).

## 1. Run the deterministic test suite (no DB, no network)
```bash
cd web && npm test
```
Expected: all `test/import/*` suites pass — golden TD parse, reconciliation, money/date/category/exclusion/split/dedupe units. This is the Principle VI gate.

## 2. Dry-run preview against the real PDF (no writes)
```bash
make ingest FILE="iOS/temp/View PDF Statement_2026-05-25.pdf" DRY_RUN=1
```
Expected:
- `Detected bank: TD Bank (Premier Checking)`
- `Reconciliation: OK (7/7 sections)`
- A preview table of May 1–25 activity with suggested categories; rows like `AMEX EPAYMENT`, `APPLECARD`, `CHASE CREDIT CRD AUTOPAY`, `Transfer to SV/ML`, `WEALTHFRONT` shown as `EXCLUDED`.
- Ends with `Dry run — nothing written.`
- **Validation**: spot-check a few amounts against the PDF; confirm `Verizon −$89.99`, `Con Edison`/`CON ED` as `utilities`, payroll/Zelle as income.

## 3. Reconciliation safety check
Temporarily point at a corrupted/edited fixture (or assert via the unit test) where a section total is wrong.
Expected: `Reconciliation: FAILED …`, exit code `4`, nothing written. This proves the correctness gate (FR-009).

## 4. Import as personal transactions (single owner)
```bash
make ingest FILE="iOS/temp/View PDF Statement_2026-05-25.pdf"
# review prompts → accept → confirm "y"
```
Expected: `Summary: imported N · skipped(duplicate) 0 · excluded M · reconciliation OK`.
Verify in the web or iOS app that the new personal transactions appear under your account with correct merchant/amount/category/date.

## 5. Idempotency
```bash
make ingest FILE="iOS/temp/View PDF Statement_2026-05-25.pdf" YES=1
```
Expected: `Summary: imported 0 · skipped(duplicate) N · …` — no duplicates created (SC-003).

## 6. Owner reassignment + split (needs a household with ≥2 members)
During review on a chosen transaction: press `o`, add a second household member; press `s`, enter `70 30`.
Expected: that transaction persists as `scope=shared` with `transaction_shares` of 70/30; both apps show the split identically. With no custom split, an even split is stored. If no 2-member household exists: `multi-owner splitting unavailable` and the run proceeds single-owner (FR-020).

## 7. Unsupported bank
```bash
make ingest FILE="<some non-TD>.pdf" DRY_RUN=1
```
Expected: `Unsupported bank — no profile matched (looked for: TD Bank markers)`, exit code `2`, nothing written.

## Success = all of:
- Tests green (step 1); real-PDF reconciles (step 2); failed reconciliation blocks (step 3); import + idempotency correct (steps 4–5); split persists (step 6); unknown bank refused (step 7).
