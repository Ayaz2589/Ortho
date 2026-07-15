# Contract — Type-Safety & Maintainability (US7)

Pure refactors and compile-time guarantees. **No runtime behavior change** — existing tests + `tsc`
are the acceptance instruments.

## C-T1 — Supabase → domain typed boundary (FR-018)
- **Contract**: a renamed/removed Supabase column or enum value causes a **compile-time** failure
  (`tsc --noEmit`), not a runtime `undefined`. The browser client is typed; `loadAll`'s `data as T[]`
  / `(m: any)` casts become checked conversions.
- **Preferred**: generated `Database` types committed at `lib/supabase/database.types.ts`; client is
  `SupabaseClient<Database>`.
- **Fallback**: hand-written `Row` interfaces (mirroring `supabase/migrations`) + a typed mapper at the
  load boundary. Either satisfies the contract.
- **Verify**: `tsc --noEmit` green after typing; a scratch column-rename makes it fail (documented in
  quickstart, not committed). Column lists from C-P5 stay in lockstep with the row types.

## C-T2 — `Transaction` transfer accessor (FR-019)
- **Contract**: transfer-vs-spend is accessed through `isTransfer(tx)` + `transferParties(tx)`; no
  call site branches `kind === 'transfer'` or indexes `owner_ids[0]` directly (grep-verifiable).
- **Verify**: `tsc` green; existing transaction tests unchanged (behavior identical); a grep in the
  quickstart shows the idiom is centralized. Optional: a unit test on the accessor for the transfer /
  spend / empty-owners shapes.

## C-T3 — Dedup: `useMonthAccordion` + `<TxFormBody>` (FR-020)
- **Contract**: the month-accordion state logic and the transaction-form-body assembly each have ONE
  definition, imported by both mobile and desktop.
- **Verify**: grep shows a single source; existing transactions + form component tests stay green
  (behavior identical on both surfaces).

## C-T4 — Dead-code purge + reachability guard (FR-021, FR-022)
- **Contract**:
  - Every i18n catalog key is reachable from a `t()` call or an allowlisted dynamic source; a new
    unreachable key makes the **guard test fail**.
  - The orphaned `relativeTime` helper is removed; `aggregates.ts` is resolved (kept documented-
    unwired — see research D15 — and NOT wired).
- **Verify**: the new `test/i18n/catalog-reachability.test.ts` (or similar) passes on the purged
  catalogs and fails when a stray key is added; `grep` confirms `relativeTime` has no remaining
  references before deletion; `aggregates.ts` remains imported only by its own test.
