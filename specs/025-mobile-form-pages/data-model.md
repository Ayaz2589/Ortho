# Phase 1 Data Model: Mobile new/edit flows as dedicated pages

**No new persistent entities. No schema/migration/store change.** The existing `Transaction` and
`Property` entities and their store mutations are used verbatim. The only "model" this feature adds is the
*transient navigation intent* encoded in a page URL and reconstructed client-side from the store.

## Existing entities (unchanged — reference only)

- **Transaction** (`web/lib/types.ts`): id (UUID), household_id, created_by, created_at, kind, direction,
  amount_cents (≥0), merchant, category, owner_ids, date, split, source, … Created via `addTransaction`,
  edited via `updateTransaction` (preserves id/created_by/created_at), removed via `deleteTransaction`.
- **Property** (`web/lib/types.ts`): id (UUID), household_id, kind (`PropertyKind`), address, nested
  `MortgageInfo` / `LeaseInfo` / `Unit[]` per kind. Created via `addProperty`, edited via `updateProperty`
  (delete-then-reinsert of nested subtables), removed via `deleteProperty`.

The new pages neither add fields nor change these mutations (spec Non-goals / FR-006).

## Transient navigation intent (URL → reconstructed form state)

| Route | Query params | Reconstructs | Resolution |
|-------|--------------|--------------|------------|
| `/transactions/new` | *(none)* | blank add form | `useTxForm({})` |
| `/transactions/new` | `copyFrom=<txId>` | copy-from-recent prefill | `transactions.find(id)` → `useTxForm({ copying })`; if not found, treat as blank |
| `/transactions/new` | `from=<personId>&to=<personId>&amount=<cents>` | settle-up transfer prefill | build `TransferPrefill{from,to,amountCents}` → `useTxForm({ initialTransfer })`; if params incomplete/invalid, treat as blank |
| `/transactions/edit` | `id=<txId>` | edit an existing transaction | `transactions.find(id)` → `useTxForm({ editing })`; if not found → redirect to `/transactions` |
| `/housing/new` | *(none)* → in-page kind step | choose kind, then add form | in-page kind state → `<PropertyForm kind />` |
| `/housing/new` | `kind=<PropertyKind>` (optional) | skip picker, open add form for that kind | validate against `PropertyKind`; if invalid/absent → show kind step |
| `/housing/edit` | `id=<propertyId>` | edit an existing property | `properties.find(id)` → `<PropertyForm kind={p.kind} editing={p} />`; if not found → redirect to `/housing` |

### Validation / parsing rules

- `id`, `copyFrom`: non-empty strings; matched against the store. No match ⇒ edit redirects; copy falls
  back to a blank add form (never errors).
- `amount`: parsed as integer USD cents (`Number.parseInt`, must be finite and ≥ 0); `from`/`to`: person
  ids validated against current household members. Any missing/invalid ⇒ fall back to a blank add form.
- `kind`: must be a member of the existing `PropertyKind` union; otherwise the in-page kind picker shows.
- All parsing happens client-side after mount (`window.location.search`); until then the page holds
  `intent === undefined` and renders the loading/placeholder state (no premature redirect).

### State transitions (page lifecycle)

```text
mount
  → read useIsExpanded()
      ├─ expanded (≥1024) ─────────────→ router.replace(list)     [desktop guard, D3]
      └─ not expanded (<1024)
            → read intent from window.location (effect)           [D2]
            → resolve entity/prefill from store                   [D4]
                  ├─ edit id present but no match ──→ router.replace(list)
                  └─ ok → render form (useTxForm / PropertyForm)
                        ├─ Save     → mutate store → router.push(list)   [D6]
                        ├─ Save+add → resetForAnother (stay)             [tx only]
                        └─ Cancel/back → router.push(list)
```

No data model beyond this table is introduced; the "entities" are the existing store objects.
