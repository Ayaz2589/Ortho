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

Mirrors `scanSession.ts` in structure; simpler because CSV has no "failed to parse" ambiguity — either the bank is detected or it isn't.

```
idle → reading → detected → previewing → reviewing → summary
                          → undetected               (no match)
                          → previewing → importing → summary  (bulk path)
```

### 3.4 Duplicate detection

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
├── csvImportModels.ts   — CsvImportState, CsvImportAction, CsvImportRow (wraps ParsedTransaction + disposition)
├── csvImportSession.ts  — pure reducer (idle/reading/detected/undetected/previewing/reviewing/importing/summary)
└── useCsvImport.ts      — hook: reads file, runs detection + parse, manages session state
```

### UI components
```
web/components/csv/
├── CsvImportPreview.tsx    — interstitial: bank badge, date range, row counts, duplicate toggle, "Review" / "Add all" CTA
└── CsvImportSummary.tsx    — summary: N added, M skipped, K duplicates left out

web/components/web/
└── CsvImportFlow.tsx       — phase dispatcher (mirrors ScanFlow.tsx); renders WebModal per phase
```

### New bank profiles (CSV)
```
web/scripts/import/profiles/
├── citi-csv.ts          — Citi CSV (Date,Description,Debit,Credit — two amount columns)
├── capital-one-csv.ts   — Capital One CSV (Transaction Date,Posted Date,Card No.,Description,Category,Debit,Credit)
├── bofa-csv.ts          — Bank of America CSV (Posted Date,Reference Number,Payee,Address,Amount)
├── wellsfargo-csv.ts    — Wells Fargo CSV ("Date","Amount","*","*","Description")
├── santander-csv.ts     — Santander CSV (needs format research before writing)
└── csv-index.ts         — CSV_PROFILES registry (Chase + new profiles)
```

### Entry point wiring
```
web/components/web/TransactionsDesktop.tsx   — add "Import CSV" ChipIconButton alongside scan
web/app/(app)/transactions/page.tsx           — add "Import CSV" option in scan picker modal
```

---

## 5. User flow in detail

### 5.1 Desktop entry
A second chip button in the Transactions header, to the left of the scan button:

```
[Filter ▼]  [↑ Import CSV]  [⌃ Scan]  [+ Add]
```

Clicking it opens the system file picker filtered to `.csv,text/csv`. No intermediate modal needed — CSV files only come from file import on web, unlike scan (which has camera + file options on native).

### 5.2 Mobile entry
Added as a third option in the existing scan picker modal:

```
📷  Take a photo
📄  Import a PDF statement
📊  Import a CSV file
```

### 5.3 Phase: reading
Spinner shown while file is being read and parsed. Fast (pure in-memory), so this phase is usually imperceptible.

### 5.4 Phase: undetected
If `detectBank()` returns `ok: false`:

```
We don't recognise this bank's CSV format yet.

Supported banks:
• Chase (credit card)
• Citi
• Capital One
• Bank of America
• Wells Fargo
• TD Bank (checking)

[Close]   [Enter manually →]
```

### 5.5 Phase: previewing (the interstitial)

```
┌──────────────────────────────────────────┐
│  Chase  ·  Jun 1 – Jun 30, 2026          │
│                                          │
│  42 transactions found                   │
│  ── 3 payment rows excluded              │
│  ── 2 likely duplicates excluded  [show] │
│                                          │
│  [Skip duplicates  ●────]                │
│                                          │
│  [Review rows one by one]  [Add 37]      │
└──────────────────────────────────────────┘
```

"Add N" triggers bulk import (no per-row wizard). "Review rows one by one" enters the wizard.

### 5.6 Phase: reviewing (per-row wizard)

Reuses `ScanCandidateForm` / `TxFormFields` exactly as the scan wizard does — the same form the user already knows, prefilled from the CSV row. User can edit any field before adding. "Skip" moves to the next row.

The key adapter: `ParsedTransaction` → `ParsedCandidate` conversion (a thin mapping function, since the types are close but not identical — `ParsedTransaction` has `kind` where `ParsedCandidate` has `direction`; both carry amount in cents, merchant, date ISO string).

### 5.7 Phase: summary

```
✓ 35 transactions added
  2 skipped
  3 payment rows excluded
  2 duplicates left out
```

---

## 6. Bank profiles — format reference

Each profile needs a `detect()` (header fingerprint) and `parse()`. Known formats:

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
1. Add `csv-index.ts` (CSV_PROFILES registry)
2. Write Citi, Capital One, BoA, Wells Fargo, TD Bank CSV profiles with golden fixtures and tests
3. Research Santander CSV format; write profile if format is confirmed

Phase 2 — session layer:
4. `csvImportModels.ts` — types + `parsedTransactionToCandidate()` adapter
5. `csvImportSession.ts` — reducer and selectors
6. `useCsvImport.ts` — hook (file read, detect, parse, session wiring)

Phase 3 — UI:
7. `CsvImportPreview.tsx` — interstitial component
8. `CsvImportSummary.tsx` — summary component
9. `CsvImportFlow.tsx` — phase dispatcher, WebModal chrome
10. Wire into `TransactionsDesktop.tsx` (desktop entry)
11. Wire into `transactions/page.tsx` (mobile picker entry)

Phase 4 — polish:
12. i18n strings audit
13. `PARITY.md` update
14. Bulk-add path (`importing` phase — add all pending rows without wizard)
15. End-to-end test with a real Chase CSV fixture

---

## 13. Out of scope (follow-up)

- **OFX/QFX import** — structured but obscure; valid follow-up once CSV is shipped
- **Column mapper UI** — for banks not in the profile registry; deferred until user demand proves it
- **Multi-file import** — importing statements from multiple months in one session
- **PDF import improvements** — separate track; LLM-based parsing is the long-term solution
- **Santander profile** — blocked on format research; placeholder slot in `csv-index.ts`
- **Chime, Green Dot, NetSpend** — prepaid cards often lack CSV export entirely; profile would only help the minority who can export; deferred
- **Per-row editing during wizard** — the form already lets users edit before adding; no extra state needed
