# Web CSV Import — Feature Plan

**Written:** 2026-07-20  
**Status:** Planning — not yet specced or tasked  
**Motivation:** Free-tier path for users who won't connect their bank. Especially important for the NYC low-income and immigrant demographic (SimpleFIN/Plaid require bank credential trust most won't extend to an unknown app). Users download a CSV from their bank's website and import it — no connection, no subscription required.

---

## 1. Why CSV (not PDF, not OFX)

| Format | Pros | Cons |
|---|---|---|
| **CSV** | Every major US bank exports it; universally understood; structured | Per-bank column differences; no standard schema |
| OFX/QFX | Fully structured; bank-agnostic schema | Hidden in bank settings; unfamiliar to most users; requires "Quicken format" knowledge |
| PDF | User already has it (email/bank app) | Hard to parse reliably across banks; image-only PDFs fail entirely |

CSV is the right call: it's what the bank's "Download transactions" button produces, and it's what users recognize. The existing CLI import engine already speaks CSV natively — this feature is a browser-side UI wrapper around code that already works.

---

## 2. What already exists (reuse, don't rebuild)

The CLI at `web/scripts/import/` has a complete, battle-tested import pipeline:

```
web/scripts/import/
├── engine/
│   ├── csv.ts           — RFC-4180 CSV parser (pure, no deps)
│   ├── detectBank.ts    — fingerprint → profile matching
│   ├── money.ts         — amount parsing, cents conversion
│   ├── dates.ts         — MM/DD → full ISO date (year from statement period)
│   ├── categorize.ts    — merchant → TransactionCategory rule table
│   ├── exclusions.ts    — payment/transfer/investment row classifier
│   └── types.ts         — BankProfile, ParsedTransaction, ParsedStatement
└── profiles/
    ├── chase-csv.ts     — Chase credit card CSV ✅ (CSV-native)
    ├── amex-gold.ts     — Amex Gold PDF ⚠️ (PDF only — detect() matches PDF text)
    ├── apple-card.ts    — Apple Card PDF ⚠️ (PDF only)
    ├── td-bank.ts       — TD Bank PDF ⚠️ (PDF only)
    └── index.ts         — PROFILES registry (mixes CSV + PDF profiles)
```

**Key insight:** all engine files are pure TypeScript with zero Node.js dependencies. They run in the browser unchanged. The only adaptation needed is the persistence layer — the CLI writes via `db/persist.ts` (service-role Supabase), the web writes via `addTransaction()` from the store (same RPC path as manual entry).

---

## 3. Architecture

### 3.1 Profile registry split

The current `PROFILES` array mixes CSV and PDF profiles. PDF profiles' `detect()` functions look for PDF-specific strings ("American Express", "Apple Card is issued by Goldman Sachs Bank") that will never appear in a CSV file — so they're harmless to include but create confusion. For clarity, introduce a dedicated CSV registry:

```ts
// web/scripts/import/profiles/csv-index.ts
export const CSV_PROFILES: BankProfile[] = [
  chaseCsv,     // already exists
  citiCsv,      // new
  capitalOneCsv, // new
  bofaCsv,      // new
  wellsFargoCsv, // new
  santanderCsv,  // new
]
```

`detectBank()` is called with `CSV_PROFILES` instead of `PROFILES`. The existing `PROFILES` export is unchanged (the CLI uses it; PDF and CSV profiles coexist there for CLI's `make ingest` path).

### 3.2 Data flow

```
User picks .csv file
        │
        ▼
  File.text() — read as string in browser
        │
        ▼
  detectBank(text, null, CSV_PROFILES)
        │
   ┌────┴────┐
 ok=true   ok=false
   │           │
   ▼           ▼
profile.parse()  → CsvImportFlow: 'undetected' phase
   │             (show supported banks list)
   ▼
ParsedStatement
{ bankId, period, sections: [{ name, kind, rows: ParsedTransaction[] }] }
        │
        ▼
  buildCsvImportContext(transactions)  ← duplicate detection against existing ledger
        │
        ▼
  applyPreskips()  ← payment rows always excluded; duplicates excluded if toggle ON
        │
        ▼
  CsvImportFlow: 'previewing' phase  (bank name, date range, counts)
        │
   ┌────┴────────────────┐
"Review rows"       "Add all N"
   │                    │
   ▼                    ▼
'reviewing' phase   'importing' phase
(one form at a time)  (bulk add, no wizard)
        │                    │
        └────────────────────┘
                    │
                    ▼
           addTransaction() × N  (store write path, same as manual entry)
                    │
                    ▼
           'summary' phase  (N added / M skipped / K duplicates)
```

### 3.3 State machine phases

```
idle → reading → list-view → editing (per-row, modal overlay) → list-view
                           → importing → summary
              → undetected
```

`list-view` is the persistent phase for the entire import session. The user
stays in it while opening/closing row edits. `editing` is a modal overlay —
it does not change the machine's primary phase; the list stays mounted underneath.
`importing` is a brief transition while `addTransaction()` is called for each
checked draft. `undetected` is terminal (close or retry with a different file).

### 3.4 Draft layer — edits live in session state, not the store

Parsed rows become **drafts** — a mutable, in-session representation that holds
all the fields the user can change (merchant, category, amount, date, owners,
splits, tags, notes) before anything is written to the ledger. The store is
not touched until the user taps "Add transactions".

```ts
interface CsvDraftRow {
  id: string                    // generated UUID, used as React key and draft key
  source: ParsedTransaction     // immutable original from the profile parser
  // mutable fields — start from parsed values, updated by per-row edit:
  merchant: string
  category: TransactionCategory
  amountCents: number
  dateISO: string
  ownerIds: string[]
  splits: Record<string, number> | null  // null = even
  tags: string[]
  notes: string | null
  // disposition:
  checked: boolean              // true = will be added on confirm
  isPaymentRow: boolean         // true = always excluded (dimmed), never togglable
  duplicateOf: string | null    // id of existing tx if likely duplicate
}
```

When the user opens a row and edits it, the draft is updated in session state.
When they confirm the import, `addTransaction()` is called once per checked
draft using the draft's current field values (not the original parsed values).
If the user closes without confirming, nothing was ever written.

### 3.5 Duplicate detection

Reuse the same duplicate-detection logic as the scan pipeline:
- `buildScanContext()` from `scanInference.ts` already produces `existingTransactionDays[]`
- Match on same calendar day + same amount in cents
- Surface count in the preview ("3 likely duplicates — excluded by default")
- Toggle to include duplicates (default: excluded)

---

## 4. New files to create

### Session / hook layer
```
web/lib/csv/
├── csvImportModels.ts   — CsvDraftRow type, disposition helpers, parsedTransactionToDraft()
├── csvImportSession.ts  — pure reducer: idle→reading→list-view→importing→summary / undetected;
│                          draft map mutations (edit, toggle checked, skip)
└── useCsvImport.ts      — hook: file read, detect, parse, build draft map, duplicate detection,
                           expose (drafts, toggleChecked, updateDraft, startImport)
```

### UI components
```
web/components/csv/
├── CsvImportList.tsx       — date-grouped list matching ledger visual structure; payment rows
│                             dimmed; duplicate rows muted; tapping opens CsvRowEditModal
├── CsvRowEditModal.tsx     — full edit modal: merchant, category, amount, date, owners, splits,
│                             tags, notes, skip button; Save → updateDraft(); uses TxFormFields
│                             and useTxForm in a draft-write mode (submit writes to session, not
│                             the store)
└── CsvImportSummary.tsx    — summary: added count, spend total, skipped/excluded breakdown

web/components/web/
└── CsvImportFlow.tsx       — phase dispatcher; renders WebModal per phase
```

### New bank profiles (CSV)
```
web/scripts/import/profiles/
├── amex-csv.ts          — Amex CSV (Date,Description,Card Member,Account #,Amount) — separate from amex-gold.ts (PDF)
├── citi-csv.ts          — Citi CSV (Date,Description,Debit,Credit — two amount columns)
├── capital-one-csv.ts   — Capital One CSV (Transaction Date,Posted Date,Card No.,Description,Category,Debit,Credit)
├── bofa-csv.ts          — Bank of America CSV (Posted Date,Reference Number,Payee,Address,Amount)
├── wellsfargo-csv.ts    — Wells Fargo CSV ("Date","Amount","*","*","Description")
├── td-bank-csv.ts       — TD Bank CSV (Date,Description,Credit,Debit,Balance) — separate from td-bank.ts (PDF)
├── santander-csv.ts     — Santander CSV (needs format research before writing)
└── csv-index.ts         — CSV_PROFILES registry (Chase + all new CSV profiles)
```

> **Note on the existing PDF profiles:** `amex-gold.ts`, `apple-card.ts`, and `td-bank.ts` parse
> PDF text layout (section headers, line-by-line prose) and will never match a CSV file — their
> `detect()` functions look for PDF-specific strings. The CSV profiles above are entirely separate
> implementations for each bank's CSV export format. Both coexist in `PROFILES` (the CLI uses
> them for `make ingest` on PDFs); only the CSV profiles go into `CSV_PROFILES`.
>
> **Apple Card CSV:** omitted for now — CSV export is iOS Wallet-only (no web path) and the
> format is unverified. Add once a real export is available to test against.

### Entry point wiring
```
web/components/web/TransactionsDesktop.tsx   — add "Import CSV" ChipIconButton alongside scan
web/app/(app)/transactions/page.tsx           — add "Import CSV" option in scan picker modal
```

---

## 5. User flow in detail

### 5.1 Core idea: a ledger preview you can edit before committing

The import session shows the user a **preview of what their transaction list will look like**
after the import — grouped by date, same visual structure as the existing Transactions ledger.
Every row is editable before anything is written. "Add transactions" is the single commit point;
until then, all changes live only in session state.

This is intentionally different from the scan wizard (one row at a time). A CSV statement
can have 40–80 rows — a per-row wizard is unusable at that scale. The date-grouped list lets
the user scan the full import at a glance, spot anything that looks wrong, fix it, and confirm.

### 5.2 Desktop entry

A second chip button in the Transactions header, to the left of the scan button:

```
[Filter ▼]  [↑ Import CSV]  [⌃ Scan]  [+ Add]
```

Clicking opens the system file picker filtered to `.csv,text/csv`.

### 5.3 Mobile entry

Added as a third option in the existing scan picker modal:

```
📷  Take a photo
📄  Import a PDF statement
📊  Import a CSV file
```

### 5.4 Phase: reading

Spinner while the file is read and parsed — pure in-memory, usually imperceptible.

### 5.5 Phase: undetected

If `detectBank()` returns `ok: false`:

```
We don't recognise this bank's CSV format yet.

Supported banks:
• Chase (credit card)
• Amex
• Citi
• Capital One
• Bank of America
• Wells Fargo
• TD Bank (checking)

[Close]   [Enter manually →]
```

### 5.6 Phase: list view (the import session)

The main screen. Stays active while the user reviews and edits — it does not advance to
the next phase until the user taps "Add transactions" or closes.

```
┌─────────────────────────────────────────────────────┐
│  Chase  ·  Jun 1 – Jun 30, 2026             [Close] │
│  37 to add  ·  3 payments excluded  ·  2 duplicates │
├─────────────────────────────────────────────────────┤
│  SATURDAY, JUN 28                                    │
│  ┌─────────────────────────────────────────────┐    │
│  │  Starbucks                  Dining    $5.75  │ →  │
│  │  Amazon.com              Shopping   $34.99   │ →  │
│  └─────────────────────────────────────────────┘    │
│                                                      │
│  FRIDAY, JUN 27                                      │
│  ┌─────────────────────────────────────────────┐    │
│  │  Con Edison              Utilities   $87.00  │ →  │
│  │  ░ Payment Thank You      ————       $200.00 │    │  ← payment, dimmed, no chevron
│  └─────────────────────────────────────────────┘    │
│                                                      │
│  THURSDAY, JUN 26                                    │
│  ┌─────────────────────────────────────────────┐    │
│  │  Uber                     Transit   $12.40   │ →  │
│  │  ~ Netflix                  Subs    $15.99   │ →  │  ← duplicate, muted
│  └─────────────────────────────────────────────┘    │
│  ...                                                 │
├─────────────────────────────────────────────────────┤
│                [Add 37 transactions]                 │
└─────────────────────────────────────────────────────┘
```

**Row types:**
- Normal row with `→` — will be added; tapping opens the edit modal
- `░` dimmed row, no chevron — payment/transfer row, always excluded, not tappable
- `~` muted row with `→` — probable duplicate, excluded by default; tapping opens the edit
  modal where the user can choose to include it

**The group date format** matches the existing ledger's `dayLabel()` + `shortDate()` so the
import preview looks identical to what the user's Transactions page will look like after import.

### 5.7 Per-row edit modal

Tapping any non-payment row opens a full-screen modal with all editable fields. This is where
the user can make any changes before the row is committed:

```
┌─────────────────────────────────────────────────────┐
│  ←  Review import                          [Save]   │
├─────────────────────────────────────────────────────┤
│  Merchant      Con Edison                           │
│  Category      Utilities ▾                          │
│  Amount        $87.00                               │
│  Date          Jun 26, 2026                         │
│  ─────────────────────────────────────────────────  │
│  Owners        [Ayaz]  [Partner]                    │
│  Split         Even ▾                               │
│                Ayaz          $43.50                 │
│                Partner       $43.50                 │
│  ─────────────────────────────────────────────────  │
│  Tags          + Add tag                            │
│  Notes         ─                                    │
│  ─────────────────────────────────────────────────  │
│  [ Skip this transaction ]                          │  ← removes it from the import
└─────────────────────────────────────────────────────┘
```

**What the user can change:**
- **Merchant** — free text edit
- **Category** — full category picker, same as manual entry
- **Amount** — editable (e.g. to fix a parsing error)
- **Date** — editable
- **Owners** — who the transaction belongs to (defaults to all household members)
- **Split** — even, by percentage, or by amount; the full split editor from TxForm
- **Tags** — tag picker, same as manual entry
- **Notes** — free text

**"Save"** writes all changes back to the session draft for that row and closes the modal.
Nothing is written to the ledger yet.

**"Skip this transaction"** marks the draft `checked: false` and closes the modal — the row
becomes muted in the list and won't be included in the import.

**Duplicate rows** show an additional line: `"Possible duplicate of Jun 26 · $87.00"` with
a checkbox "Include anyway". Checking it marks the draft `checked: true`.

### 5.8 Phase: importing

Brief state while `addTransaction()` is called for each checked draft using its current
(possibly edited) field values. Optimistic local writes make this fast even for 40+ rows.

### 5.9 Phase: summary

```
✓ 35 transactions added  ·  $2,614.23

  2 skipped
  3 payment rows excluded
  2 duplicates left out

                    [Done]
```

The total spend gives the user a quick sanity-check against the statement's printed total
without mental math.

### 5.10 Source field

Every imported transaction has `source` set to the bank name from the profile (e.g. `"Chase"`,
`"Citi"`), matching the CLI's `make ingest` convention. The user does not see or edit this field
during review — it is set automatically on commit.

---

## 6. Bank profiles — format reference

Each profile needs a `detect()` (header fingerprint) and `parse()`. Known formats:

### Amex (new — `amex-csv.ts`, distinct from `amex-gold.ts` PDF profile)
```
Date,Description,Card Member,Account #,Amount
01/15/2026,STARBUCKS,AYAZ UDDIN,-99001,5.75
01/20/2026,PAYMENT - THANK YOU,AYAZ UDDIN,-99001,-150.00
```
- Single Amount column; positive = expense, negative = payment/credit
- `Card Member` column enables multi-cardholder owner matching (same as PDF profile)
- detect(): header starts with `Date,Description,Card Member,Account #,Amount`

### Chase (already exists — `chase-csv.ts`)
```
Transaction Date,Post Date,Description,Category,Type,Amount,Memo
01/15/2026,01/16/2026,STARBUCKS #1234,Food & Drink,Sale,-5.75,
```
- Negative Amount = expense; positive = payment/credit
- `Type=Payment` → excluded

### Citi (new)
```
Date,Description,Debit,Credit
01/15/2026,STARBUCKS,5.75,
01/20/2026,PAYMENT - THANK YOU,,150.00
```
- Two amount columns (Debit = expense, Credit = income/payment)
- Payment rows: description matches "PAYMENT"

### Capital One (new)
```
Transaction Date,Posted Date,Card No.,Description,Category,Debit,Credit
2026-01-15,2026-01-16,1234,STARBUCKS,Dining,5.75,
2026-01-20,2026-01-21,1234,CAPITAL ONE PAYMENT,,150.00
```
- ISO dates (YYYY-MM-DD), not MM/DD/YYYY
- Two amount columns like Citi
- Payment rows: description contains "PAYMENT"

### Bank of America (new)
```
Posted Date,Reference Number,Payee,Address,Amount
01/15/2026,1234567890,STARBUCKS,"123 MAIN ST, NEW YORK NY",-5.75
```
- Single Amount column (negative = expense)
- Address column present (strip from merchant)
- No explicit payment-row column; detect by Payee text

### Wells Fargo (new)
```
"01/15/2026","-5.75","*","*","STARBUCKS STORE 1234"
```
- No header row — positional columns only
- detect() fingerprint must not rely on headers; instead check positional shape
- Amount column 2 (negative = expense)

### TD Bank CSV (new — distinct from existing `td-bank.ts` PDF profile)
```
Date,Description,Credit,Debit,Balance
01/15/2026,STARBUCKS,,5.75,1234.56
01/20/2026,ACH CREDIT DIRECT DEP,2500.00,,3734.56
```
- Checking account CSV; Balance column present (ignore)
- Credit = income, Debit = expense

### Santander (new — format needs research)
Research task before writing the profile: download a Santander CSV from online banking and verify the actual column headers. Santander is significant in the NYC market (particularly the immigrant banking segment this feature targets).

---

## 7. `ParsedTransaction` → form prefill adapter

The scan pipeline uses `ParsedCandidate`; the CSV pipeline uses `ParsedTransaction`. They're close but not identical. A thin adapter converts one to the other so the review wizard can reuse `ScanCandidateForm` and `TxFormFields` unchanged:

```ts
// web/lib/csv/csvImportModels.ts
function parsedTransactionToCandidate(tx: ParsedTransaction, id: string): ParsedCandidate {
  return {
    id,
    merchantRaw: tx.rawDescription,
    merchant: tx.merchant,
    date: isoToPartialDate(tx.dateISO),       // "2026-01-15T12:00:00Z" → { year: 2026, month: 1, day: 15 }
    amountCents: tx.amountCents,
    direction: tx.kind === 'income' ? 'credit' : 'debit',
    currency: 'usd',                            // CLI is USD-only; web is too (spec 027)
    originalAmount: null,
    isPaymentRow: tx.excluded && tx.excludeReason === 'card-payment',
    guesses: new Set<GuessedField>(['category']),  // category is inferred, not extracted
    categoryGuess: tx.category,
    ownersGuess: null,
    duplicateOf: null,                          // set by buildCsvImportContext()
  }
}
```

---

## 8. Deferred loading

Like `ScanFlow`, wrap `CsvImportFlow` in `next/dynamic` with `ssr: false`. The CSV engine (including all bank profiles) loads only when a CSV import is initiated — not on Transactions-route load.

```ts
const CsvImportFlow = dynamic(
  () => import('./CsvImportFlow').then((m) => m.CsvImportFlow),
  { ssr: false }
)
```

---

## 9. PARITY.md impact

The CLI already has CSV import (`make ingest`). This feature closes the gap: web will gain CSV import too. Update `PARITY.md` row for "CSV import" from "CLI only" → "web + CLI". No new engine logic — the parser is shared.

---

## 10. i18n

No new untranslated strings beyond what the UI phase copy needs. Strings to add:
- `'Import a CSV file'`
- `'We don't recognise this bank's CSV format yet.'`
- `'Supported banks'`
- `'Import CSV'` (button label)
- `'{0} transactions found'`
- `'{0} payment rows excluded'`
- `'{0} likely duplicates excluded'`
- `'Skip duplicates'`
- `'Review rows one by one'`
- `'Add {0}'` (bulk add CTA)

All follow the existing `t()` pattern. No new locale JSON keys needed if keys reuse the existing `t('{0} transactions found')` positional form.

---

## 11. Testing

### Unit tests (Vitest)
- `useCsvImport.test.tsx` — hook: file read → detect → parse → session state transitions
- `csvImportSession.test.ts` — pure reducer: all phase transitions, preskip logic
- Each new bank profile: golden fixture CSV → snapshot of `ParsedStatement` output (same pattern as existing CLI profile tests)
- Adapter: `parsedTransactionToCandidate()` round-trip

### Component tests
- `CsvImportPreview.test.tsx` — renders counts correctly; toggle fires dispatch
- `CsvImportSummary.test.tsx` — displays added/skipped/left-out counts

### Desktop-parity test additions
- CSV import button renders in `TransactionsDesktop`
- Clicking it opens the file dialog (same pattern as existing scan button test)

---

## 12. Implementation order

Phase 1 — engine and profiles:
1. Add `csv-index.ts` (CSV_PROFILES registry, Chase already in it)
2. Write Amex CSV, TD Bank CSV profiles (distinct from the existing PDF profiles) with golden fixtures and tests
3. Write Citi, Capital One, BoA, Wells Fargo CSV profiles with golden fixtures and tests
4. Research Santander CSV format; write profile if format is confirmed

Phase 2 — session layer:
5. `csvImportModels.ts` — `CsvDraftRow` type, `parsedTransactionToDraft()` converter
6. `csvImportSession.ts` — reducer (idle → reading → list-view → importing → summary / undetected); actions: `file/parsed`, `draft/update`, `draft/toggleChecked`, `draft/skip`, `import/start`, `import/done`
7. `useCsvImport.ts` — hook: file read, detect, parse, build draft map with duplicate detection, expose session state + mutation helpers

Phase 3 — UI:
8. `CsvImportList.tsx` — date-grouped list (using existing `groupByDay()` from `lib/format`), payment rows dimmed, duplicate rows muted, tapping opens edit modal
9. `CsvRowEditModal.tsx` — full edit modal with merchant/category/amount/date/owners/splits/tags/notes; Save → `updateDraft()` in session; Skip → `draft/skip` action
10. `CsvImportSummary.tsx` — added count, expense total, breakdown
11. `CsvImportFlow.tsx` — phase dispatcher, WebModal chrome
12. Wire into `TransactionsDesktop.tsx` (desktop entry)
13. Wire into `transactions/page.tsx` (mobile picker entry)

Phase 4 — polish:
14. i18n strings audit
15. `PARITY.md` update
16. End-to-end test: upload Chase CSV → edit one row's split → add all → verify ledger

---

## 13. Out of scope (follow-up)

- **OFX/QFX import** — structured but obscure; valid follow-up once CSV is shipped
- **Column mapper UI** — for banks not in the profile registry; deferred until user demand proves it
- **Multi-file import** — importing statements from multiple months in one session
- **PDF import improvements** — separate track; LLM-based parsing is the long-term solution
- **Santander profile** — blocked on format research; placeholder slot in `csv-index.ts`
- **Chime, Green Dot, NetSpend** — prepaid cards often lack CSV export entirely; profile would only help the minority who can export; deferred
- **Per-row editing during wizard** — the form already lets users edit before adding; no extra state needed
