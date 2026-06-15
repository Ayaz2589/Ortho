# Contract: BankProfile interface (extensibility — FR-027)

Adding a bank = implement this interface in `web/scripts/import/profiles/<bank>.ts`, register it in `profiles/index.ts`, and add a golden fixture. **No engine change.**

```ts
export interface BankProfile {
  /** Stable id used by --bank / BANK= (e.g. "td"). */
  id: string
  /** Human label shown in output (e.g. "TD Bank (Premier Checking)"). */
  label: string
  /** Written verbatim to transactions.source (e.g. "TD Bank"). */
  source: string

  /** Fingerprint check against full extracted text. Must be specific
   *  enough that only this bank's statements match. Pure. */
  detect(text: string): boolean

  /** Parse extracted page text into a fully-populated ParsedStatement:
   *  period, sections (with kind + printedSubtotalCents), rows
   *  (dateISO, merchant, amountCents, rawDescription), default category
   *  + exclusion left to the shared engine. Pure — no IO, no clock. */
  parse(pages: string[]): ParsedStatement
}
```

## Responsibilities split
| Concern | Owner |
|---|---|
| PDF→text | engine (`extractText`) |
| detect / period / section boundaries / row grouping / merchant cleanup / subtotal capture | **profile** |
| amount→cents, date→ISO helpers | engine (profile calls them) |
| categorize, exclusions, reconcile, dedupe, owners/split, persist | engine |

## Profile authoring rules
- `parse` MUST be deterministic and pure (inject any needed reference via args; never read the clock or network).
- `parse` MUST capture each section's printed subtotal so the engine can reconcile; if a bank has no subtotals, the profile must supply an equivalent control total (e.g. from the summary block) or declare `reconcilable: false` (future extension) — v1 requires subtotals.
- `detect` MUST avoid matching other banks (use bank legal name + product name, not generic words).
- Section→kind mapping lives in the profile as data.

## Conformance test (per profile)
A golden test feeds `fixtures/<bank>-<period>.txt` to `parse` and asserts deep-equality against `fixtures/<bank>-<period>.expected.json`, plus `reconcile(result).ok === true`.

## v1 profile: `td`
- `detect`: text includes `TD Bank, N.A.` AND (`TD Premier Checking` OR `tdbank.com`).
- Income sections: `Deposits`, `Electronic Deposits`, `Other Credits`. Expense sections: `Checks Paid`, `Electronic Payments`, `Other Withdrawals`, `Service Charges`.
- Period: from `Statement Period: <Mon d yyyy>-<Mon d yyyy>`.
- Row grouping: a `MM/DD` at line start opens a row; following non-date, non-`Subtotal:` lines append to its description until the amount token (`\d[\d,]*\.\d2`) is consumed; trailing continuation lines (e.g. `EFT ASTORIA * NY`, `Transfer to SV …`) attach to the current row. `Checks Paid` uses `MM/DD <serial> <amount>`.
- Merchant cleanup examples: `TD ZELLE RECEIVED, <ref> Zelle JOHN TEJADA` → `Zelle · John Tejada`; `ACH DEPOSIT, CROSSTERRA INC PAYROLL <ref>` → `Crossterra Payroll`; `ACH DEBIT, VERIZON PAYMENTREC <ref>` → `Verizon`; `TD ZELLE SENT, <ref> Zelle VUKSANI PLUMBING` → `Zelle · Vuksani Plumbing`.
