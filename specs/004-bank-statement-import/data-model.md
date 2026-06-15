# Phase 1 Data Model: Bank-Statement PDF Import CLI

Two layers: **in-memory parse types** (new, owned by the CLI) and the **persisted schema** (existing, unchanged). The CLI never alters the DB schema.

## In-memory types (engine/types.ts)

### StatementPeriod
| Field | Type | Notes |
|------|------|------|
| `start` | `Date` | Inclusive period start (e.g. Apr 26 2026). |
| `end` | `Date` | Inclusive period end (e.g. May 25 2026). |

Used by date resolution (D3). Parsed from the statement header.

### ParsedSection
| Field | Type | Notes |
|------|------|------|
| `name` | `string` | e.g. `Electronic Payments`. `(continued)` merged into base name. |
| `kind` | `'income' \| 'expense'` | From the profile's section map (D6). |
| `printedSubtotalCents` | `number` | The statement's `Subtotal:` for the section, in cents. |
| `rows` | `ParsedTransaction[]` | Rows extracted for this section. |

**Validation**: `sum(rows.amountCents) === printedSubtotalCents` (reconciliation, FR-009).

### ParsedTransaction
| Field | Type | Notes |
|------|------|------|
| `dateISO` | `string` | Resolved ISO timestamp at noon local (D3). |
| `rawDescription` | `string` | Verbatim joined description (audit/dedupe). |
| `merchant` | `string` | Cleaned display name (FR-013). |
| `amountCents` | `number` | Integer cents, ≥ 0 (FR-008). |
| `kind` | `'income' \| 'expense'` | Inherited from section. |
| `section` | `string` | Source section name. |
| `category` | `TransactionCategory` | Suggested; operator-overridable (FR-011/012). |
| `excluded` | `boolean` | Default from exclusion rules (FR-014); operator-toggleable. |
| `excludeReason` | `string \| null` | e.g. `cc-payment`, `internal-transfer`, `investment`. |
| `ownerIds` | `string[]` | Resolved Ortho user ids; default = account holder (D9). |
| `splits` | `Record<string, number> \| null` | `null` = even; else per-owner percent summing to 100. |
| `duplicate` | `boolean` | Probable duplicate of an already-imported row (same day+amount+bank); flagged + excluded by default, re-includable (D11). |
| dedupe key | `string` | `created_by \| YYYY-MM-DD \| amountCents \| source` — description ignored (D11). |

**Validation**: `amountCents ≥ 0`; `category ∈ TransactionCategory`; if `ownerIds.length > 1` then a household with all owners as members must exist; if `splits` set, `Object.values(splits).reduce(+) === 100` and keys === `ownerIds`.

### ParsedStatement
| Field | Type | Notes |
|------|------|------|
| `bankId` | `string` | e.g. `td`. |
| `bankLabel` | `string` | e.g. `TD Bank (Premier Checking)`. |
| `accountHolder` | `string` | From statement header (e.g. `AYAZ UDDIN`). |
| `source` | `string` | Tag written to `transactions.source` (e.g. `TD Bank`). |
| `period` | `StatementPeriod` | — |
| `sections` | `ParsedSection[]` | All activity sections. |
| `reconciliation` | `ReconResult` | Per-section pass/fail (below). |

### ReconResult
| Field | Type | Notes |
|------|------|------|
| `ok` | `boolean` | True iff every section reconciles. |
| `sections` | `Array<{ name: string; expectedCents: number; computedCents: number; ok: boolean }>` | Per-section detail for the preview/diff. |

### BankProfile (contract — see contracts/bank-profile.md)
| Member | Type | Notes |
|------|------|------|
| `id` | `string` | `td`. |
| `label` | `string` | Display name. |
| `source` | `string` | Value for `transactions.source`. |
| `detect` | `(text: string) => boolean` | Fingerprint check (D2). |
| `parse` | `(pages: string[]) => ParsedStatement` | Full layout parse (period, sections, rows, subtotals, cleaned merchants). Pure. |

### RunOptions
| Field | Type | Notes |
|------|------|------|
| `file` | `string` | PDF path. |
| `bankOverride` | `string \| null` | `BANK=`. |
| `dryRun` | `boolean` | `DRY_RUN=1`. |
| `assumeYes` | `boolean` | `YES=1` — accept defaults (still needs reconciliation + final confirm unless also forced). |
| `admin` | `boolean` | `ADMIN=1` — service-role mode (D10). |

## Persisted schema (existing — unchanged)

### transactions  (insert shape mirrors `web/lib/store.tsx` `txRecord`)
`{ id, household_id, merchant, category, kind, scope, amount_cents, source, date, created_by }`
- `id`: uuid (generated). `household_id`: `null` for personal, household uuid for shared.
- `scope`: `personal` (single owner) or `shared` (multi-owner). Invariant: `shared ⇔ household_id != null`.
- `amount_cents`: bigint ≥ 0. `kind`: `expense|income`. `category`: enum (11 values).
- `source`: bank tag (e.g. `TD Bank`). `date`: timestamptz ISO. `created_by`: the authed user.

### transaction_shares  (only for `scope='shared'`; mirrors `writeShares`)
One row per owner: `{ transaction_id, user_id, percent }`, `percent = effectiveSplits(tx)[user_id]`, `numeric(5,2)`, percents sum to ~100 (even-split rounding mirrors web).

### Read-only lookups
- `users (id, name, …)` — map account-holder / owner names → ids; present a picker.
- `households (id, owner_id, name)`, `household_members (household_id, user_id, role)` — resolve the operator's household and eligible co-owners for shared splits.

## Mapping: ParsedTransaction → Transaction (engine/toTransaction.ts)
- `merchant ← merchant`, `category ← category`, `kind ← kind`, `amount_cents ← amountCents`, `date ← dateISO`, `source ← statement.source`, `created_by ← authedUserId`.
- `ownerIds.length === 1` → `scope='personal'`, `household_id=null`, `owner_ids=[holder]`, `splits=null`.
- `ownerIds.length > 1` → `scope='shared'`, `household_id=<operator household>`, `owner_ids=ownerIds`, `splits=splits` (or null for even). Shares written from `effectiveSplits`.
- Excluded rows are dropped before mapping.
