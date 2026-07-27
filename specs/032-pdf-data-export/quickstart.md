# Quickstart: PDF Data Export & Import

Validation guide for the feature. Prereqs: `cd web && npm install` (adds `pdf-lib`, `@pdf-lib/fontkit`; promotes `unpdf`).

## Automated (headless — the merge gate)

```bash
cd web
npm test            # includes test/dataFile/* and the two panel tests
npx tsc --noEmit    # type gate
npm run gen:vectors && git diff --exit-code shared/test-vectors   # vector-drift gate
```

Expected green suites and what they prove:

| Suite | Proves |
|-------|--------|
| `test/dataFile/envelope.test.ts` | version validate; not-Ortho/corrupt rejection with no writes (G4) |
| `test/dataFile/pdf-roundtrip.test.ts` | `attach → save → unpdf getAttachments → JSON.parse` deep-equals the source envelope; attachment name/mime correct |
| `test/dataFile/sections-transactions.test.ts` | tx serialize/read losslessness; unknown-person → `currentPersonId`, splits still sum (G12) |
| `test/dataFile/sections-housing.test.ts` | property (+ mortgage/lease/units) + rental payment serialize/read losslessness |
| `test/dataFile/import-dedup.test.ts` | tier-1 idempotency (G8/G9), tier-2 fuzzy hit/miss, tier order (G11), additive-only via spies (G7/G10) |
| `test/dataFile/registry-compat.test.ts` | unknown section skipped (G5), missing section omitted (G6), currency-independence of payloads (G1) |
| `test/data-export-panel.test.tsx` | language + currency selectors default to the app's current values (SC-002) |
| `test/data-import-panel.test.tsx` | preview counts → confirm → summary; non-Ortho file rejected with no changes |

Golden vectors: `shared/test-vectors/data-file-dedup.json` (round-trip, currency-independence, dedup outcomes, section compat, empty household).

## Manual (on-device / real browser — cannot run in the Linux sandbox)

These are the parts headless tests can't cover; run on staging web + iOS build:

1. **Round-trip smoke**: Settings → Data → Download (default language+currency). Open the PDF — transactions + housing render legibly; header shows household + date + currency. Re-upload the same PDF → summary reports **0 added** (idempotent).
2. **Language × currency**: Export as বাংলা + GBP. Confirm Bengali headings render (no tofu) and amounts are in GBP. Re-import → records restored identical to originals (currency choice irrelevant).
3. **Refill**: On a second/empty account, upload a PDF → transactions and housing reappear with correct amounts, splits, and property details.
4. **Dedup with overlap**: Upload a PDF into a household that already has some of its records → only the missing records are added; the summary shows the rest as "already there".
5. **Rejection**: Upload a random PDF / bank statement → calm "can't read this as an Ortho data file"; nothing changes.
6. **iOS**: the share sheet presents the PDF; font fetch works offline in the WKWebView.

## Success criteria mapping

- SC-001 (export < 15s) — manual timing on a seeded household.
- SC-002 (≤ 2 interactions default) — `data-export-panel.test.tsx` asserts prefilled defaults.
- SC-003 (42 language×currency combos legible) — manual matrix spot-check (non-Latin = manual).
- SC-004 (100% round-trip fidelity, currency-independent) — `import-dedup` + `registry-compat` + section tests.
- SC-005 (idempotent / full-overlap zero-add) — `import-dedup.test.ts` + manual step 1/4.
- SC-006 (non-Ortho/corrupt → no changes) — `envelope.test.ts` + `data-import-panel.test.tsx`.
- SC-007 (new section by registration only) — `registry-compat.test.ts` + structural review.
