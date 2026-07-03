# Contract: Scan parser pipeline (pure logic)

**Consumers**: `ScanSession` (runtime), `ScanParserTests` (XCTest), `-uiDemoScan` (demo).
**Binding types**: see [data-model.md](../data-model.md).

## Pipeline stages & responsibilities

```
Capture (image|PDF)
  → ScanTextExtractor.extract(_:) async throws -> ScanDocumentText
      • image: RecognizeDocumentsRequest; fallback RecognizeTextRequest line clustering
      • PDF: text layer per page; render+OCR only for pages without one
      • NO parsing decisions here — geometry + text only
  → ScanParser.parse(_ doc: ScanDocumentText,
                     context: ScanContext) -> ScanParseResult
      • ScanContext = { existingTransactions (for dedup + history),
                        people, defaultCurrency, referenceDate }
      • referenceDate is INJECTED (constitution VI — never the real clock)
  → ScanRefiner.refine(_ result:) async -> ScanParseResult   // OPTIONAL stage
      • availability-gated; ≤2 s; merchant cleanup + category-when-silent only
      • MUST return input unchanged on any failure/timeout/unavailability
```

## Hard guarantees

1. **Purity/determinism** (fixture-enforced): `ScanParser.parse` is a pure function —
   same inputs ⇒ byte-identical `ScanParseResult`. No I/O, no clock, no locale reads
   (parsing is `en_US_POSIX`-style invariant; display formatting happens in the form).
2. **No network anywhere in the pipeline** (SC-004). `ScanRefiner` is on-device only.
3. **Money**: amounts parse to integer cents via string→cents logic consistent with the
   existing `Money` conventions; no floating-point dollar math (FR-023).
4. **Dates**: candidate dates are calendar-day `DateComponents`; statement year
   inference follows the CLI algorithm (`web/scripts/import/engine/dates.ts`): resolve
   MM/DD within the statement period, noon-UTC on save via the form's existing
   convention (FR-019). Unparseable date ⇒ `nil`, never fabricated.
5. **Detection order** (research R5): ≥3 rows ⇒ statement; else confident grand total ⇒
   receipt; else 1–2 rows ⇒ statement; else `.none`.
6. **Payment rows** (FR-012): patterns ported from `engine/exclusions.ts` plus
   `PAYMENT THANK YOU` / `AUTOPAY` variants; matched rows get `isPaymentRow = true`.
7. **Duplicates** (FR-015): key = (calendar day, amountCents) vs existing transactions
   only; greedy one-to-one claiming; never matched within the batch.
8. **Inference tiers** (FR-013, research R7): history → CLI rule table → (refiner) →
   nothing. Every inferred field appears in `guesses`.

## Fixture format (`iOS/Ortho-iOS/Resources/ScanFixtures/`)

Each fixture is a pair (synthetic content only — never real financial data):

- `<name>.png` | `<name>.pdf` — the capture the extractor sees.
- `<name>.expected.json` — the asserted parse, schema:

```json
{
  "kind": "receipt | statement | none",
  "context": {
    "referenceDate": "2026-07-03",
    "existing": [ { "date": "2026-07-01", "amountCents": 4250 } ],
    "history": [ { "merchant": "TRADER JOE S #552", "category": "groceries",
                    "count": 12, "split": { "even": true } } ]
  },
  "candidates": [
    {
      "merchant": "Trader Joe's",
      "date": "2026-07-02",
      "amountCents": 8734,
      "direction": "debit",
      "currency": "usd",
      "isPaymentRow": false,
      "duplicate": false,
      "categoryGuess": "groceries",
      "guesses": ["category", "owners"]
    }
  ]
}
```

`ScanParserTests` builds `ScanContext` from `context`, runs extractor+parser (NEVER the
refiner), and asserts the candidate list field-by-field. Minimum fixture set:

| Fixture | Locks |
|---|---|
| `receipt-grocery.png` | baseline receipt: merchant/date/total (SC-001) |
| `receipt-restaurant.png` | labeled TOTAL among line items → receipt not statement (R5 tie-break) |
| `receipt-eur.pdf` | foreign currency → originalAmount + currency (FR-014) — text-layer PDF so the FX logic is locked deterministically |
| `receipt-duplicate.png` + context.existing | receipt duplicate line (FR-015) |
| `statement-card.pdf` (text layer, multi-page) | table rows, credits/debits, payment row default-skip, duplicate pre-skip counts (SC-002, SC-005) |
| `statement-scanned.png` | image statement through the OCR table path |
| `unreadable.png` | `.none` → failure copy path (FR-017) |

Adding a fixture = drop files in the folder (filesystem-synchronized target — no
pbxproj edit) + a test case entry.
