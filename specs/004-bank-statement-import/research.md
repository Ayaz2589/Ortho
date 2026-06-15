# Phase 0 Research: Bank-Statement PDF Import CLI

All Technical Context items are resolved; no open NEEDS CLARIFICATION remains. Decisions below.

## D1 — PDF text extraction library

- **Decision**: `pdfjs-dist` (Mozilla pdf.js) used in Node to pull the text layer page-by-page (`getDocument` → `page.getTextContent()` → join `item.str`).
- **Rationale**: Pure JS, no native build, no system binary (poppler/`pdftotext` not installable in our sandbox). The TD sample has a clean text layer — verified via macOS PDFKit during planning (6 pages, ~9.7K chars). Page-level access lets the profile drop repeated page headers/footers.
- **Alternatives**: `pdf-parse` (thin pdfjs wrapper, less control over layout/positioning); poppler `pdftotext` (system dep, unavailable); LLM extraction (explicitly rejected by the user).
- **Risk/Mitigation**: text-only extraction can interleave columns/amounts (observed: a Con Ed `129.89` and ATM `38.50` landed on consecutive lines). Mitigated by per-section **subtotal reconciliation** (D5) which blocks import on any grouping error.

## D2 — Bank detection

- **Decision**: Each `BankProfile` exposes `detect(text): boolean` matching unambiguous markers (TD: `TD Bank, N.A.`, `TD Premier Checking`, `tdbank.com`). `detectBank()` runs all profiles: exactly one match → use it; `--bank <id>` (Makefile `BANK=`) forces a profile; zero matches → error "unsupported bank"; >1 match → error "ambiguous, pass BANK=".
- **Rationale**: Deterministic, no guessing (FR-002/003/004). Markers come from the statement's own chrome which is stable across periods.

## D3 — Date resolution

- **Decision**: Parse the statement period (`Statement Period: Apr 26 2026-May 25 2026`) into start/end dates. For each `MM/DD` posting date, pick the year such that the date falls within `[start, end]`; when a period crosses Dec→Jan, months ≥ start-month use start year, months ≤ end-month use end year. Emit ISO at **noon local** (`YYYY-MM-DDT12:00:00` → `.toISOString()`), matching the web `TxForm` convention and avoiding day-shift under day-grouping.
- **Rationale**: TD rows print only `MM/DD`; the period is the authoritative year source. Noon avoids off-by-one-day under `startOfDay` grouping (`web/lib/format.ts`).
- **Alternatives**: UTC midnight (rejected — shifts day in negative-offset zones); America/New_York noon like the old iOS importer (equivalent for grouping; local-noon is simpler and matches web).

## D4 — Amount → cents

- **Decision**: `parseAmountToCents`: strip `$`, `,`, spaces; require `\d+\.\d{2}`; compute `Math.round(parseFloat(...) * 100)`; reject anything else. Sign/kind comes from the **section** (D6), not from the number.
- **Rationale**: Exact cents, no float drift (FR-008). Mirrors the cents convention in `web/lib/finance/money.ts`.

## D5 — Section subtotal reconciliation

- **Decision**: The profile tags each parsed row with its section and captures each section's printed `Subtotal:` (and the `ACCOUNT SUMMARY` totals where present). `reconcile()` asserts `sum(parsed rows in section).cents === printed subtotal.cents` for every section. Any mismatch → reconciliation fails → **hard block** on import (FR-009); dry-run still prints the diff (section, expected, computed, delta).
- **Rationale**: The single strongest correctness guarantee against extraction/grouping errors. Turns "did we parse right?" into a checkable invariant.

## D6 — TD section → kind/scope mapping

- **Decision** (profile data):
  - Income (`kind: income`): `Deposits`, `Electronic Deposits`, `Other Credits`.
  - Expense (`kind: expense`): `Checks Paid`, `Electronic Payments`, `Other Withdrawals`, `Service Charges`.
  - Ignore non-activity blocks (`ACCOUNT SUMMARY`, `DAILY BALANCE SUMMARY`, "How to Balance", legal boilerplate, page headers).
- **Rationale**: Matches the observed TD Premier Checking layout. `(continued)` sections across page breaks are merged by section name.

## D7 — Categorization (codified, no LLM)

- **Decision**: An ordered rules table of `{ pattern (case-insensitive substring/regex), category }` over the cleaned merchant. First match wins; no match → fallback `entertainment` for expenses (matches the old importer's catch-all for misc) and `income` for income rows. The interactive review shows the chosen category and lets the operator override per row (FR-011/012). Seed rules from the sample: UBER EATS/INSTACART/DELI/CAFE/restaurant→`dining`; UBER/CURB/NYCT/PATH/MTA/PAYGO→`transit`; EXXON/SHELL/MOBIL/FUEL→`fuel`; CON ED/CONED/VERIZON/NATIONAL GRID/WATER→`utilities`; CVS/PHARMACY/HIMS/HEALTH→`health`; H MART/GROCER/SUPERMARKET→`groceries`; PLAYSTATION/COURSERA/UBER ONE/SUBSCRIPTION/TMNA→`subs`; STARBUCKS/COFFEE→`coffee`; RENT/MORTGAGE→`rent`.
- **Rationale**: Deterministic and testable; the human review is the accuracy backstop. Rules live in one file, easy to extend.

## D8 — Exclusions (default-flag, reviewable)

- **Decision**: A codified classifier flags rows as `excluded` by default (still shown in review, re-includable — FR-014):
  - Internal transfers: `Transfer to/from SV`, `Transfer to ML`, `DDA TRNSFR`, `TRANSFER TO SAVINGS`.
  - Credit-card bill payments: `AMEX EPAYMENT`, `APPLECARD`, `CHASE CREDIT CRD AUTOPAY`, generic `CREDIT CRD AUTOPAY`.
  - Investment transfers: `WEALTHFRONT`.
  - (Operator may also exclude any row, e.g. tiny `INTEREST PAID`.)
- **Rationale**: Mirrors the exclusions hand-coded in `TDBankMay2026Importer.swift`; underlying spend is tracked on those cards, and transfers are not spending.

## D9 — Owner assignment & splitting

- **Decision**: Default owner = the statement account holder mapped to an Ortho user (TD is single-holder). Review lets the operator (a) keep, (b) reassign to another user, or (c) pick multiple users. Single owner → `scope: personal`, `household_id: null`. Multiple owners → `scope: shared` with the operator's `household_id`, and `transaction_shares` rows. Even split reuses `effectiveSplits` (web parity, incl. its rounding); custom split via `validateCustomSplit` (each owner a number, sum === 100, else re-prompt). If no household with ≥2 members exists, multi-owner is disabled with a clear message and import proceeds single-owner (FR-020).
- **Rationale**: Exactly mirrors the web store's `txRecord`/`writeShares` so imported rows are indistinguishable (FR-021). Account-name→user-id mapping resolved at runtime from `public.users` (and confirmed interactively), not hardcoded.

## D10 — Auth / DB access

- **Decision**: Two modes via env. Default **sign-in**: `createClient(URL, ANON_KEY)` + **email OTP** — `auth.signInWithOtp({ email })` then `auth.verifyOtp({ email, token, type: 'email' })`, exactly like the web `app/sign-in/page.tsx` and iOS `AppState.swift` (Ortho uses OTP, not passwords). Email from `IMPORT_EMAIL` (or prompt); the 6-digit code is entered interactively — nothing stored. Yields correct `created_by`, RLS-scoped. Optional **admin**: `make … ADMIN=1` uses `SUPABASE_SERVICE_ROLE_KEY` (mirrors `web/lib/supabase/admin.ts`) to bypass RLS for cross-account attribution. Reads env from `web/.env.local`. Uses plain `@supabase/supabase-js` (not the `@supabase/ssr` browser/server clients, which assume Next.js).
- **Rationale**: Sign-in needs no extra secret and yields correct ownership for one's own statement; service-role is opt-in for attributing other people's rows. The service-role key in `web/.env.local` is currently a placeholder, so it cannot be the default.

## D11 — Duplicate detection

- **Decision**: A row is a probable duplicate of an already-imported one when `created_by | YYYY-MM-DD | amount_cents | source` match — **description is intentionally ignored** (per operator request: same amount, same day, same bank ⇒ probably a dup). Matches are **flagged** (`duplicate: true`) and excluded by default — shown as `[DUPLICATE]` in review so the operator can re-include a genuine separate charge with `x` (which clears the flag). We compare **only against existing DB rows** (`fetchExistingForDedupe`), never within the batch, so two legitimately-identical charges in one statement both import. Pure key + `markDuplicates` logic is unit-tested; the fetch is mocked.
- **Rationale**: Statements lack stable bank IDs. Day+amount+bank is a strong, description-independent signal; excluding-by-default keeps re-runs idempotent (SC-003) while flagging (not silently skipping) gives the operator the final say. Scoping by `source` avoids cross-bank false positives (a $25 TD charge ≠ a $25 Amex charge).

## D12 — Interactivity & safety

- **Decision**: `readline/promises` for prompts. Flags: `DRY_RUN=1` (parse+preview+reconcile, no writes — FR-023), `--yes`/`YES=1` (accept all defaults, still requires reconciliation pass), explicit final confirm before any write (FR-025). Abort at any prompt writes nothing.
- **Rationale**: No new dependency; satisfies dry-run + explicit-confirm requirements.

## D13 — Test fixtures & PII

- **Decision**: The golden fixture (`td-bank-2026-05.txt`) is the faithfully-extracted text of the sample statement, with its expected `ParsedStatement` JSON, committed under `web/test/import/fixtures/`. This is a single-operator personal repo; faithful text best locks the parser. **PII note**: if the repo is ever shared/open-sourced, replace the fixture with a synthetic statement that preserves the layout quirks (wrapped descriptions, amount-on-own-line, interleaved amounts, `(continued)` sections, subtotals) but uses fabricated names/amounts. Real-PDF end-to-end validation is covered by quickstart, not committed tests.
- **Rationale**: Deterministic golden vectors satisfy Principle VI; the synthetic fallback is the privacy-safe path if distribution changes.

## D14 — Dependency footprint

- **Decision**: Add only `pdfjs-dist` (to `web/` devDependencies — it's tooling, never bundled into the Next.js app). Prompts use Node built-ins. No `inquirer`/`commander`/`dotenv` (hand-rolled arg parse; load `.env.local` via a tiny reader or `process.env`).
- **Rationale**: Keep the surface minimal; the web app bundle is unaffected.
