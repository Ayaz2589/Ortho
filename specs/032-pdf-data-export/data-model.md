# Phase 1 Data Model: PDF Data Export & Import

No database schema changes. These are **in-memory / serialized** shapes for the data file. All amounts are canonical **USD integer cents**, independent of the display currency chosen for the visible layer.

---

## ExportEnvelope (the embedded payload)

```ts
interface ExportEnvelope {
  formatVersion: number            // 1 for this feature. validate() rejects unknown/unsupported.
  generatedAt: string              // ISO timestamp (injected; not Date.now() in pure code paths)
  app: { name: 'ortho'; version: string }
  household: { id: string; name: string }
  display: {                       // provenance only — NEVER read on import
    language: Language             // 'English' | 'বাংলা' | 'Español' | '日本語' | '简体中文' | '한국어'
    currency: CurrencyKey          // 'usd' | 'cad' | 'gbp' | 'eur' | 'jpy' | 'cny' | 'bdt'
  }
  sections: SectionPayload[]       // ordered; one per registered+included section
}

interface SectionPayload {
  key: string                      // 'transactions' | 'housing' | future keys
  sectionVersion: number           // per-section schema version (independent of formatVersion)
  records: unknown[]               // section-specific record shape (see below)
}
```

**Validation rules** (`validate(envelope)` → `{ ok: true } | { ok: false; reason }`, zero side effects):
- `formatVersion` present and ≤ `SUPPORTED_FORMAT_VERSION` → else reject (FR-013, FR-020).
- `sections` is an array; unknown `key`s are tolerated (skipped with a note on import), not fatal.
- Non-envelope input (missing `app.name === 'ortho'` / no attachment) → "not an Ortho data file".

---

## Transactions section record

Mirrors `Transaction` (see `web/lib/types.ts`), carrying canonical fields needed to recreate it losslessly:

```ts
interface TxRecord {
  id: string                       // canonical primary key → tier-1 dedup
  date: string                     // YYYY-MM-DD
  merchant: string
  category: TransactionCategory
  kind: TransactionKind            // 'expense' | 'income' | 'transfer'
  amount_cents: number             // USD cents
  source: string
  notes?: string | null
  paid_by?: string | null          // person id (recipient/payer)
  owner_ids: string[]              // ordered person ids
  shares: Record<string, number>   // person id → USD cents; sums to amount_cents
  tags?: string[]                  // tag names (resolved to/created as ids on import)
}
```

- **Person resolution on import**: `paid_by`, `owner_ids`, and `shares` keys that don't exist in the current household resolve to `currentPersonId` (splits collapse to the importing user, still summing to `amount_cents`). Documented in Assumptions.
- **Tags**: serialized as names (stable across households); on import, resolved via existing `addTag` (reuse-or-create) to local ids.

## Housing section record

```ts
interface HousingRecord {
  property: Property               // includes nested mortgage?, lease?, units? (see types.ts)
  rentalPayments: RentalPayment[]  // for this property
}
```

- `Property.id` is the tier-1 dedup key; fallback natural identity = normalized `address`.
- `RentalPayment` dedup identity = `(property_id, date, amount_cents)` (no id-collision assumption across households).
- All `*_cents` fields are canonical USD cents.

---

## SectionDedupePlan (import, per section)

```ts
interface SectionDedupePlan<TRecord> {
  add: TRecord[]                   // genuinely new → will be created
  skipById: TRecord[]              // canonical id already present locally (tier 1)
  skipByContent: TRecord[]         // no id match, but fuzzy content match (tier 2)
}
```

## ImportResult (shown to the user)

```ts
interface ImportResult {
  ok: boolean
  fileLabel: string                // household + generatedAt from envelope, for the summary header
  sections: Array<{
    key: string
    known: boolean                 // false → section skipped (unknown to this build)
    added: number
    skippedById: number
    skippedByContent: number
  }>
  rejectedReason?: string          // set when ok === false (unknown format / not an Ortho file / corrupt)
}
```

- **Invariant**: `added` counts equal the number of records passed to the store mutations; nothing is created outside `add`. Re-running import on the same file yields `added === 0` for every section (idempotency).

---

## Section interface (registry contract)

```ts
interface DataSection<TRecord = unknown> {
  key: string
  sectionVersion: number
  serialize(store: AppStateValue): TRecord[]
  read(payload: SectionPayload): TRecord[]           // version-tolerant parse
  dedupe(records: TRecord[], store: AppStateValue): SectionDedupePlan<TRecord>
  apply(plan: SectionDedupePlan<TRecord>, store: AppStateValue): Promise<void>  // creates plan.add only
  renderModel(records: TRecord[], ctx: RenderCtx): SectionRenderModel  // headings + rows for the PDF
}

interface RenderCtx {                 // all display-only; supplied from the store at export
  t: Translate
  locale: string
  currency: CurrencyKey
  rate: (c: CurrencyKey) => number
  formatMoney: (cents: number, opts?) => string
  resolveUser: (id: string) => User
}

interface SectionRenderModel {
  title: string                       // localized section heading
  columns: string[]                   // localized column labels
  rows: string[][]                    // pre-formatted cells (money already currency-converted for display)
  emptyLabel?: string                 // shown when records.length === 0
}
```

**Registry**: an ordered `Map<string, DataSection>` with `register(section)`. Export iterates registered (and user-included) sections; import iterates envelope sections, looks each up by `key`, and marks unknown keys `known: false`.

## Store write paths used by `apply`

| Section | Mutation | Notes |
|---------|----------|-------|
| transactions | `addTransaction(tx)` | routes through atomic `upsert_transaction`; preserves splits |
| housing | `addProperty(p)` | `p` carries nested `mortgage`/`lease`/`units`; `writePropertySubtables` persists them |
| housing | `addRentalPayment(rp)` | per rental payment in `add` |
