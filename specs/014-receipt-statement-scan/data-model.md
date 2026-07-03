# Data Model: Receipt & Statement Scanning (spec 014)

All types are in-memory Swift value/observable types in the iOS app. **No database
entities** — the only persisted artifact of a scan is ordinary `Transaction` rows
created through the existing add path (FR-023). Names below are binding for
implementation; file placement per plan.md Project Structure.

## Pure parsing types (`Services/Scan/ScanModels.swift`)

### ScanDocumentText

The neutral, engine-agnostic representation every extractor produces and the parser
consumes (see research R2/R3 — Vision types never cross this boundary).

| Field | Type | Notes |
|---|---|---|
| `pages` | `[Page]` | ordered; multi-page PDFs concatenate |
| `Page.lines` | `[Line]` | reading order |
| `Page.tables` | `[Table]` | present only when structured OCR/table detection found any |
| `Line.text` | `String` | raw text |
| `Line.frame` | `CGRect` | normalized (0–1) bounding box; drives total-emphasis heuristics |
| `Table.rows` | `[[String]]` | cell texts, row-major |

### ParsedCandidate

One potential transaction (spec Key Entity "Parsed candidate").

| Field | Type | Notes |
|---|---|---|
| `id` | `UUID` | session-local identity |
| `merchantRaw` | `String` | as read |
| `merchant` | `String` | cleaned (processor prefixes stripped; FM-refined when available) |
| `date` | `DateComponents?` | calendar day only (y/m/d); `nil` = leave form default (edge case) |
| `amountCents` | `Int64` | always ≥ 0 (direction via `direction`) — existing money invariant |
| `direction` | `.debit \| .credit` | credit → income prefill, debit → expense (FR-011) |
| `currency` | `Currency` | `.usd` unless foreign detected (FR-014) |
| `originalAmount` | `Decimal?` | non-nil iff `currency != .usd`; feeds the existing FX field |
| `isPaymentRow` | `Bool` | FR-012 exclusion patterns matched |
| `guesses` | `Set<GuessedField>` | which prefill fields are inferences (FR-016) |
| `categoryGuess` | `TransactionCategory?` | R7 tiers; `nil` = form default |
| `ownersGuess` | `[Person.ID]?` / `splitGuess: [Person.ID: Int64]?` | from history match; `nil` = form defaults |
| `duplicateOf` | `Transaction.ID?` | at most one claimed existing transaction (FR-015) |

`GuessedField`: `merchant | date | amount | category | owners | currency` — drives the
text3 "guessed" affordance; cleared per-field on first user edit, never re-shown for
that entry.

### ScanParseResult

```
enum ScanParseResult {
  case receipt(ParsedCandidate)          // single-total path
  case statement([ParsedCandidate])      // ordered rows, 1+ (R5 rule 3)
  case none                              // unreadable → calm failure copy
}
```

**Validation rules** (enforced by the parser, asserted by fixture tests):
- `amountCents > 0` for every emitted candidate (zero/unparseable amounts are dropped).
- `statement` preserves document order; within-batch identical rows are all kept (R6).
- Duplicate matching is greedy against existing transactions only: each existing
  transaction can be claimed by at most one candidate.
- Deterministic: same `ScanDocumentText` + same existing-transaction set + same demo
  clock ⇒ identical result (Foundation-Models refinement is excluded from this
  guarantee and never runs in fixture tests).

## Flow state (`Features/Transactions/Scan/ScanSession.swift`)

### ScanSession (@Observable)

Spec Key Entity "Scan session". Owns one capture's lifecycle; discarded on dismiss.

| Field | Type | Notes |
|---|---|---|
| `phase` | `Phase` | state machine below |
| `candidates` | `[ParsedCandidate]` | statement path |
| `dispositions` | `[UUID: Disposition]` | `pending \| added \| skipped \| leftOutDuplicate` |
| `skipDuplicates` | `Bool` | interstitial toggle, default `true` (FR-007) |
| `cursor` | `Int` | current wizard row index |
| `counts` | computed | added/skipped/leftOut/remaining for header + summary (FR-010) |

### Phase state machine

```
idle → capturing(source) → parsing
parsing → receiptPrefilled(ParsedCandidate)      // receipt path: form fills in place
parsing → interstitial                            // statement path
parsing → failed                                  // .none → calm copy + Retake
interstitial → reviewing(cursor)                  // Start review
reviewing → reviewing(cursor+1)                   // Add and next / Skip
reviewing → summary                               // last row, or Stop at any time
failed → capturing(source)                        // Retake
any → idle                                        // cancel/dismiss — capture data released
```

**Transition invariants**:
- No transaction save occurs in any phase except `reviewing` → (row accepted), and each
  save is exactly one `appState.addTransaction` call (FR-009); `receiptPrefilled` saves
  only via the form's normal Add.
- Entering `interstitial` with `skipDuplicates == true` pre-marks
  `duplicateOf != nil` and `isPaymentRow` candidates as `leftOutDuplicate`/`skipped`
  respectively (FR-012, FR-015); toggling off restores `pending`.
- `summary` is terminal for the flow; already-added rows are never revisited or rolled
  back by the wizard (rollback is the existing per-write optimistic mechanism only).
- Leaving the session in any phase releases all capture/document data (FR-003).

## Prefill payload (`AddTransactionSheet` input)

### ScanPrefill

Fourth prefill source, sibling of `SettleUpPrefill` / copy (R8): wraps one
`ParsedCandidate` + `guesses`, applied on appear exactly like manual typing would be
(same validation, FR-006). Wizard mode additionally carries `progress: (index, total)`
and the three wizard actions; nil `scan` = today's unchanged form.

## Existing types touched (no shape changes)

- `Transaction` — created via existing initializer + `addTransaction`; nothing new.
- `Currency`, `Money` — FX derivation for FR-014 uses existing helpers only.
- `AppLanguage`/catalog — new string keys only.
