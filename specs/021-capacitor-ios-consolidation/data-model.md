# Phase 1 Data Model: Capacitor iOS Consolidation

This feature is a delivery-mechanism migration, not a product-data change: no existing Supabase
table, RPC, or TS/Swift domain type (`Transaction`, `Property`, `Household`, etc.) changes shape.
The entities below are the ones this feature *introduces* — the scan-pipeline contract moving from
Swift-only to a JS↔Swift boundary, and the session-storage concept moving from cookies to Keychain.
They are drawn directly from the existing `iOS/Ortho-iOS/Services/Scan/ScanModels.swift` contract
(kept intentionally identical in shape — see research.md Decision 5) and ported into TypeScript.

## ScanDocumentText

The output of native OCR/PDF extraction; input to the ported TS parser. One instance per captured
photo or per PDF (containing all its pages).

```ts
interface ScanDocumentText {
  pages: ScanDocumentTextPage[]
}

interface ScanDocumentTextPage {
  lines: ScanDocumentTextLine[]
  tables: ScanDocumentTextTable[]
}

interface ScanDocumentTextLine {
  text: string
  frame: NormalizedFrame   // 0-1, top-left origin — flipped from Vision's bottom-left convention
                            // by the native plugin before crossing the bridge
}

interface ScanDocumentTextTable {
  rows: string[][]          // row-major cell text
}

interface NormalizedFrame {
  x: number; y: number; width: number; height: number   // each 0-1
}
```

**Validation rules**: `lines`/`tables` may both be empty (an unreadable document — see spec Edge
Cases). No field is ever `null`; absence is an empty array. Produced exclusively by the native Scan
plugin (`capture`/`extractPDF`); never constructed by hand outside of test fixtures.

**Source of truth for fixtures**: `shared/scan-fixtures/*.json`, one per ported test case (research.md
Decision 6), frozen from the existing `iOS/Ortho-iOS/Resources/ScanFixtures/*.png|.pdf` library.

## ParsedCandidate

The structured, reviewable transaction candidate the parser produces from a `ScanDocumentText`.
Ported field-for-field from `ScanModels.swift`'s `ParsedCandidate`.

```ts
interface ParsedCandidate {
  merchantRaw: string
  merchant: string
  date: PartialDate | null          // ported from Swift's DateComponents? — {year, month, day}
  amountCents: number                // integer USD cents, matches the app-wide money invariant
  direction: 'debit' | 'credit'
  currency: CurrencyCode
  originalAmount: string | null      // decimal string, present for non-USD amounts
  isPaymentRow: boolean
  guesses: Set<GuessedField>         // which fields were inferred vs. confidently read
  categoryGuess: TransactionCategory | null
  ownersGuess: string[] | null       // Person ids, when inferable from context
  duplicateOf: string | null         // existing transaction id, when a likely duplicate is found
}

type GuessedField = 'merchant' | 'date' | 'amount' | 'category' | 'direction'
```

**Validation rules**: `amountCents >= 0` (sign carried by `direction`, matching the existing
app-wide `Transaction.amount` convention — see `iOS/ARCHITECTURE.md`'s `Transaction` model as the
precedent this mirrors). `date`, when non-null, must be a real calendar date. This type has no
persistence of its own — a `ParsedCandidate` becomes a real `Transaction` only when the user accepts
it in the review flow, going through the exact same optimistic-add path as manual entry (no new
write path is introduced).

## ScanParseResult

The parser's top-level output — a discriminated union, ported from Swift's enum.

```ts
type ScanParseResult =
  | { kind: 'receipt'; candidate: ParsedCandidate }
  | { kind: 'statement'; candidates: ParsedCandidate[] }
  | { kind: 'none' }
```

**State transitions**: produced once per scan by `scanParser.ts`'s tiered decision (Decision 4 in
research.md); consumed immediately by the `ScanSession` reducer (below) to enter either the
single-candidate prefill flow or the multi-candidate interstitial/review flow.

## ScanContext

Read-only context injected into the parser so it stays pure (no I/O, no clock, no locale) — ported
from Swift's `ScanContext`.

```ts
interface ScanContext {
  referenceDay: PartialDate                 // injected "today", never Date.now()
  defaultCurrency: CurrencyCode
  merchantHistory: MerchantHistoryEntry[]    // for category inference
  existingTransactionDays: ExistingTransactionDay[]   // for duplicate detection
}
```

**Relationships**: Built from `web/lib/store.tsx`'s in-memory state (the equivalent of what
`ScanInference.swift` today builds from `AppState`) — this is why `ScanInference`'s port to
TypeScript is *more* correct than the native original (research.md Decision 4): the data it needs
already lives client-side on web, with no bridge round-trip required.

## ScanSession (UI state machine)

Ported 1:1 from `ScanSession.swift`'s `Phase` enum and disposition tracking — product-approved
behavior (spec FR requirements reference this shape), not something to redesign.

```ts
type ScanSessionPhase =
  | 'idle'
  | 'parsing'
  | 'receiptPrefilled'
  | 'interstitial'
  | 'reviewing'
  | 'summary'
  | 'failed'

type Disposition = 'pending' | 'added' | 'skipped' | 'leftOutDuplicate' | 'leftOutPayment'
```

**Rules preserved from the native original**:
- Payment rows (`isPaymentRow`) are always pre-skipped.
- Likely-duplicate rows are pre-skipped only when the user has the "skip duplicates" toggle on
  (`interstitial` phase).
- The `summary` phase omits any disposition segment whose count is zero ("zero-count segments
  omitted" rule).

## Device Session (conceptual — no new stored fields)

Not a new data entity so much as a new **storage location** for the existing Supabase session
object (access + refresh JWT pair). No new columns, no new Supabase table. See
`contracts/session-storage-adapter.md` for the interface contract.

## Explicitly unaffected

`User`/`Person`, `Household`, `Transaction`, `Card`, `Property`/`MortgageInfo`/`LeaseInfo`/`Unit`,
`RentalPayment`, `Budget` — none of these change shape, columns, or client-side type definitions as
part of this feature. A `ParsedCandidate` the user accepts is written as an ordinary `Transaction`
through the existing add path; this feature does not touch that path's contract.
