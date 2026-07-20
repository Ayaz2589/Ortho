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
├── CsvImportList.tsx       — scrollable list view: all rows with check/dim/tilde states, per-row tap → TxForm, live "Add N" CTA
└── CsvImportSummary.tsx    — summary: N added, spend total, skipped, payment rows, duplicates

web/components/web/
└── CsvImportFlow.tsx       — phase dispatcher (mirrors ScanFlow.tsx); renders WebModal per phase
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

### 5.1 Why list-first, not wizard-first

The scan wizard works for PDF/photo imports because a statement photo typically yields 5–20 rows and the user is already in a deliberate "review this" mindset. CSV imports are a different contract: a full month's Chase statement has 40–80 rows. Walking through them one at a time is unusable. The primary path must be a **list view** where the user can see everything at once, toggle individual rows, and confirm in one tap. The wizard is available as an opt-in for users who want to inspect each row before it lands.

### 5.2 Desktop entry

A second chip button in the Transactions header, to the left of the scan button:

```
[Filter ▼]  [↑ Import CSV]  [⌃ Scan]  [+ Add]
```

Clicking opens the system file picker filtered to `.csv,text/csv`. No intermediate modal — CSV import on web is file-only (unlike scan, which offers camera + file on native).

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

### 5.6 Phase: list view (primary review path)

This is the main screen after a successful parse. It replaces the simple stats interstitial
from the scan flow with a full scrollable list so the user can see exactly what will be added
before committing anything.

```
┌─────────────────────────────────────────────────┐
│  Chase  ·  Jun 1 – Jun 30, 2026         [Close] │
├─────────────────────────────────────────────────┤
│  ● 37 selected  ○ 3 payments  ○ 2 duplicates    │
│  [Skip duplicates  ●────]                        │
├─────────────────────────────────────────────────┤
│  ✓  Jun 28   Starbucks             Dining  $5.75 │
│  ✓  Jun 27   Amazon.com      Shopping  $34.99    │
│  ✓  Jun 26   Con Edison          Utilities $87.00│
│  –  Jun 25   Payment Thank You  ░░░░░░░░  $200   │  ← payment row, dimmed
│  ✓  Jun 24   Uber               Transit   $12.40 │
│  ~  Jun 23   Netflix             Subs      $15.99 │  ← duplicate, togglable
│     ...                                          │
├─────────────────────────────────────────────────┤
│              [Add 37 transactions]               │
└─────────────────────────────────────────────────┘
```

**Row states:**
- `✓` (checked) — pending, will be added on confirm
- `–` (dash, dimmed) — excluded: payment/transfer row, never added
- `~` (tilde, muted) — duplicate, excluded by default; tap to toggle pending
- Tapping a `✓` row unchecks it (user skips that row)
- Tapping a `~` row promotes it to `✓` (user wants to add it anyway)

**Each row shows:** date · merchant · auto-assigned category chip · amount. That is enough
information for the user to decide; they don't need to open the full form for every row.

**Category chips are the key signal.** If the auto-categorisation is wrong (e.g., "Con Edison"
lands as "Entertainment" instead of "Utilities"), the user sees it here and can tap the row to
open the full `TxForm` and fix it before adding.

**Tapping a `✓` row** opens the full `TxForm` prefilled with that transaction's data (the same
form as manual entry and the scan wizard), so the user can edit merchant, category, amount, date,
or owners before adding it individually. This is the escape hatch for per-row control without
forcing the whole wizard on everyone.

**"Add N transactions" CTA** is fixed at the bottom. N updates live as the user toggles rows.
Tapping it adds all checked rows via `addTransaction()` and moves to the summary phase.

### 5.7 Phase: importing

Brief progress state while `addTransaction()` is called for each checked row. For 40+ rows this
is fast (optimistic local writes) but showing a momentary "Adding 37 transactions…" prevents the
user from tapping the button again.

### 5.8 Phase: summary

```
✓ 35 transactions added  ·  $2,614.23 total

  2 rows skipped
  3 payment rows excluded
  2 duplicates left out

                    [Done]
```

Total spend across all added expense rows is shown so the user can sanity-check it matches their
statement's "New Charges" total without doing mental math.

### 5.9 Source field

Every imported transaction has its `source` field set to the bank name from the profile
(e.g. `"Chase"`, `"Citi"`). This makes imported transactions identifiable in the ledger and
consistent with transactions imported via the CLI's `make ingest` path, which sets `source` the
same way. The user does not need to touch the source field during review.

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
5. `csvImportModels.ts` — types, row disposition enum (pending/excluded-payment/excluded-duplicate/skipped/added), `parsedTransactionToCandidate()` adapter
6. `csvImportSession.ts` — reducer (idle → reading → list-view → importing → summary / undetected) and selectors
7. `useCsvImport.ts` — hook: file read, detect, parse, build import context (duplicate detection), apply preskips, manage session state

Phase 3 — UI:
8. `CsvImportList.tsx` — scrollable list with row state indicators, per-row tap to edit, live CTA count, duplicate toggle
9. `CsvImportSummary.tsx` — summary with spend total
10. `CsvImportFlow.tsx` — phase dispatcher, WebModal chrome
11. Wire into `TransactionsDesktop.tsx` (desktop entry)
12. Wire into `transactions/page.tsx` (mobile picker entry)

Phase 4 — polish:
13. i18n strings audit
14. `PARITY.md` update
15. End-to-end test with a real Chase CSV fixture (upload → list view → add all → verify ledger)

---

## 13. Out of scope (follow-up)

- **OFX/QFX import** — structured but obscure; valid follow-up once CSV is shipped
- **Column mapper UI** — for banks not in the profile registry; deferred until user demand proves it
- **Multi-file import** — importing statements from multiple months in one session
- **PDF import improvements** — separate track; LLM-based parsing is the long-term solution
- **Santander profile** — blocked on format research; placeholder slot in `csv-index.ts`
- **Chime, Green Dot, NetSpend** — prepaid cards often lack CSV export entirely; profile would only help the minority who can export; deferred
- **Per-row editing during wizard** — the form already lets users edit before adding; no extra state needed
