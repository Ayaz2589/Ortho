# Contract: Import Pipeline & Two-Tier Deduplication

Governs how a validated envelope is turned into new records without duplication.

## Pipeline (`import.ts`)

```
planImport(envelope, store) : ImportResult            // pure: no writes, drives the preview + summary
applyImport(plans, store)   : Promise<void>           // creates plan.add records only
```

`planImport`:
1. For each `SectionPayload` in `envelope.sections`:
   - Look up `registry.get(payload.key)`. Absent → append `{ key, known: false, added: 0, skippedById: 0, skippedByContent: 0 }`, continue.
   - `records = section.read(payload)`.
   - `plan = section.dedupe(records, store)`.
   - Emit `{ key, known: true, added: plan.add.length, skippedById: plan.skipById.length, skippedByContent: plan.skipByContent.length }`.
2. Return `ImportResult` (drives the UI preview *before* any confirm).

`applyImport` runs only after the user confirms, calling `section.apply(plan, store)` for each known section — which invokes only the additive store mutations for `plan.add`.

## Two-tier dedup (`section.dedupe`)

**Tier 1 — exact canonical id** (all sections):
- If the record's canonical id already exists among the store's records for that section → `skipById`.

**Tier 2 — content fuzzy** (records not matched in tier 1):
- **transactions**: reuse `web/lib/csv/duplicateMatch.ts` → `findDuplicateId({ dateISO, amountCents, merchant }, existingCandidates)`. Non-null → `skipByContent`.
- **housing property**: normalized `address` equals an existing property's → `skipByContent`.
- **housing rentalPayment**: `(property_id, date, amount_cents)` matches an existing payment → `skipByContent`.
- Otherwise → `add`.

## Guarantees

- G7: **Additive only.** `applyImport` performs no update/delete; existing records are never mutated (FR-014). *(tested via store-mutation spies)*
- G8: **Idempotent.** Importing the same file twice: the second `planImport` yields `added === 0` for every section (all records now match tier 1) (FR-016, SC-005). *(vector + integration tested)*
- G9: **Full-overlap → zero adds.** Importing into a household already containing every record adds nothing (SC-005). *(vector-tested)*
- G10: **No silent double-insert.** The count of store-create calls equals `Σ plan.add.length`; nothing is created outside `add` (FR-017). *(spy-tested)*
- G11: **Tier order.** A record whose id exists is `skipById` and never reaches tier 2 (id match short-circuits). *(vector-tested)*
- G12: **Unknown-person owners** in an imported transaction resolve to `currentPersonId`; the resulting `shares` still sum to `amount_cents` (no invalid split reaches `upsert_transaction`). *(tested)*

## Summary presentation (UI)

- Per-section line: "`<Section>`: added N · already there M" (M = skippedById + skippedByContent), plainspoken, tokens only, no red.
- Unknown sections (`known: false`): "`<key>`: skipped (from a newer version)".
- Rejected file (`ok: false`): a single calm message keyed by `rejectedReason`; **no changes made**.
