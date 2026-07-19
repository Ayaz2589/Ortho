# Tasks: SimpleFIN Bank-Sync (Connect + Transaction Sync)

**Feature**: `specs/028-simplefin-sync` | **Branch**: `028-simplefin-sync`

**Inputs**: [plan.md](./plan.md) · [spec.md](./spec.md) · [research.md](./research.md) ·
[data-model.md](./data-model.md) · [contracts/](./contracts/) · [quickstart.md](./quickstart.md)

**TDD** (Constitution VI): every money/parse task writes the failing test first. No live
provider account — all provider interaction is mocked `FetchLike`.

**Story priorities**: US1 Connect (P1) · US2 Transaction sync (P2) · US3 Disconnect (P3) ·
US4 Plaid contained (P3, done in Foundational so nothing breaks downstream).

---

## Phase 1: Setup

- [ ] T001 Confirm baseline is green before changes: `cd services/aggregation && npm install && npm test`, then `cd web && npm install && npx tsc --noEmit && npm test`. Record any pre-existing failures.
- [ ] T002 Read `services/aggregation/README.md` extraction contract and `test/helpers.ts` (`fakeFetch`, `throwingFetch`, `CONFIG`) so new tests reuse the established mocking pattern.

## Phase 2: Foundational (blocking — includes US4 Plaid containment)

**Goal**: relocate Plaid into `deprecated/` while keeping it fully wired + drift-locked, and make the sync-copy recursive. Nothing SimpleFIN depends on this staying green.

- [ ] T003 [US4] Make `services/aggregation/scripts/sync-to-functions.mjs` recurse subdirectories (walk `src/` recursively, preserve relative structure under `supabase/functions/_shared/aggregation/`, keep the generated README).
- [ ] T004 [US4] Update `services/aggregation/test/shared-sync.test.ts` to compare the `src/` tree vs `_shared/aggregation/` **recursively** (byte-identical, same file set).
- [ ] T005 [US4] Move `services/aggregation/src/plaid.ts` → `src/deprecated/plaid.ts` and `src/plaidClient.ts` → `src/deprecated/plaidClient.ts`; add an `@deprecated` JSDoc banner to each (point to spec 028 / SimpleFIN as the successor).
- [ ] T006 [US4] Update `services/aggregation/src/index.ts` to re-export the Plaid surface from `./deprecated/plaid.ts` and `./deprecated/plaidClient.ts` (barrel unchanged for importers) and repoint the existing Plaid test imports (`test/link-token.test.ts`, `exchange.test.ts`, `client.test.ts`, `disconnect.test.ts`, `errors.test.ts`, `hosted-session.test.ts`) to `../src/deprecated/...` as needed.
- [ ] T007 [US4] Add deprecation banner comments to `supabase/functions/plaid-link-token/index.ts`, `plaid-exchange/index.ts`, `plaid-disconnect/index.ts` (files/URLs stay put — do NOT move dirs).
- [ ] T008 [US4] Move `web/components/settings/EmbeddedPlaidLink.tsx` → `web/components/settings/deprecated/EmbeddedPlaidLink.tsx`; add `@deprecated`; repoint its importer(s) in `LinkedBanks.tsx`. Add `@deprecated` banners (in place, no move) to `web/components/PlaidHandBack.tsx` and `web/app/(app)/plaid-oauth/page.tsx`.
- [ ] T009 [US4] Regenerate the shared copy (`cd services/aggregation && npm run sync:functions`) and run `npm test` — the recursive drift-lock and all existing Plaid tests MUST be green (SC-005). Run `cd web && npx tsc --noEmit` to confirm no broken imports.

**Checkpoint**: Plaid contained, fully wired, all pre-existing tests green.

## Phase 3: User Story 1 — Connect with SimpleFIN (P1) 🎯 MVP

**Goal**: paste setup token → claim server-side → Vault → institution + accounts listed.
**Independent test**: with a mocked token/claim/accounts, connect flow records the institution + accounts; invalid token fails cleanly; re-claim is idempotent.

### Core (TDD)

- [ ] T010 [P] [US1] Write failing tests `services/aggregation/test/normalize.test.ts` for the setup-token decode + `provider_item_id` derivation helpers (base64 decode → claim URL; `sfin_<sha256[:32]>`), plus malformed-token rejection.
- [ ] T011 [P] [US1] Write failing tests `services/aggregation/test/simplefin-claim.test.ts` for `buildClaimRequest`/`parseAccessUrl`/`parseAccountsMeta` (accounts display metadata: name, org, type, currency, mask), defensive to both schema variants (research D3).
- [ ] T012 [US1] Add `'simplefin'` to `LinkedProvider` in `services/aggregation/src/types.ts`; add shared SimpleFIN types (claim result, account meta, sync-window).
- [ ] T013 [US1] Implement `services/aggregation/src/simplefinClient.ts` — a `FetchLike`-injected client doing HTTP Basic Auth from an Access URL (`user:pass@host`), `provider_unreachable` on network/5xx, structured error passthrough. Mirror `plaidClient.ts` shape.
- [ ] T014 [US1] Implement `services/aggregation/src/simplefin.ts` — `decodeSetupToken`, `deriveProviderItemId`, `buildAccountsRequest`, `parseAccountsResponse` (accounts + in-band errors, defensive), `parseAccountMeta`. Make T010/T011 pass.
- [ ] T015 [US1] Export the SimpleFIN surface from `services/aggregation/src/index.ts`; `npm run sync:functions`; `npm test` green.

### Data + server

- [ ] T016 [US1] Write migration `supabase/migrations/<ts>_simplefin_sync.sql`: `alter type linked_provider add value 'simplefin'`; add `last_synced_at`, `last_manual_refresh_at`, `sync_cursor` to `linked_institutions`; add `linked_accounts.currency` **only if missing**; add `complete_simplefin_link(...)` + `mark_simplefin_synced(...)` RPCs (service-role only, mirroring `complete_plaid_link`); reuse `store_/get_/delete_institution_secret` (add a provider-agnostic `store_institution_secret` if the Plaid one is Plaid-specific). Idempotency-check the enum add.
- [ ] T017 [US1] Implement edge function `supabase/functions/simplefin-claim/index.ts` per [contracts/simplefin-functions.md](./contracts/simplefin-functions.md): auth → decode → POST claim → derive id → best-effort accounts meta → `complete_simplefin_link`. Errors: `invalid_request`, `claim_failed`, `provider_unreachable`, `not_household_member`.
- [ ] T018 [P] [US1] Deno pure-logic test for any claim decision logic extracted (e.g. token-decode guard) in `supabase/functions/simplefin-claim/` mirroring `plaid-exchange/completion.test.ts` (only if non-trivial logic lives in the function; otherwise rely on core tests).

### Client + UI

- [ ] T019 [US1] Add `'simplefin'` to `LinkedProvider` and the new sync-state fields to `LinkedInstitution` in `web/lib/types.ts` and `web/lib/supabase/rows.ts` (hand-mirror; keep in lockstep with the migration).
- [ ] T020 [US1] Add `claimSimpleFinToken(setupToken)` to `web/lib/aggregation.ts` (calls `simplefin-claim`, returns `AggregationResult`), reusing the existing error-envelope handling.
- [ ] T021 [US1] Create `web/components/settings/SimpleFinConnect.tsx` — labelled token-paste input + connect button + disclosure (read-only, privacy-forward), calm error states; on success refresh linked banks. Tokens-only styling, no red.
- [ ] T022 [US1] Update `web/components/settings/LinkedBanks.tsx` to present SimpleFIN as the **primary/recommended** connect method (renders `SimpleFinConnect`), with Plaid de-emphasized as a secondary option. Ensure the linked-banks list renders SimpleFIN institutions + accounts (currency shown).
- [ ] T023 [US1] Component test for `SimpleFinConnect` (behavior/semantics): paste → connect calls the client, success shows the new institution, invalid token shows a calm message (mock the client layer, no network).

**Checkpoint**: US1 independently testable — connect works end-to-end against mocks.

## Phase 4: User Story 2 — Transaction sync into the ledger (P2)

**Goal**: pull `/accounts`, normalize → USD cents + kind, dedupe, reconcile, write via `upsert_transaction` with a default split.
**Independent test**: mocked `/accounts` inserts correctly-signed rows; re-sync = 0 dupes; pending→posted = single posted row; every row's shares sum to total.

### Core (TDD — the heart)

- [ ] T024 [P] [US2] Extend `services/aggregation/test/normalize.test.ts` with the **money** fixtures (research D4): `"-33.45"`→(3345,expense), `"100"`→(10000,income), `"-33.4"`→(3340,expense), `"0"`/`"0.00"`→(0,income,flagged), truncation, thousands-separator rejection, no float drift. Write these FIRST (failing).
- [ ] T025 [P] [US2] Write failing tests `services/aggregation/test/simplefin-accounts.test.ts` for: windowed request builder (epoch start/end, ≤90d clamp, `pending=1`), dedupe key `(account_id, txn_id)`, deterministic `ledgerId = uuidv5(dedupeKey)`, pending→posted supersede (same id, and id-rekey fallback on account+amount+date±3d), in-band error surfacing.
- [ ] T026 [US2] Implement `services/aggregation/src/normalize.ts`: `amountToCents(decimalString) → { amountCents, kind }` (sign→kind, abs, no float), `dedupeKey`, `ledgerId` (UUIDv5), `reconcileTransactions(existing, incoming)`. Make T024/T025 pass.
- [ ] T027 [US2] Implement `buildSyncWindow(lastSyncedAt, now)` and `toUpsertPayload(txn, ctx)` (maps normalized txn → `p_tx` + default `p_shares`, per data-model) in `simplefin.ts`; export; `sync:functions`; `npm test` green.

### Server

- [ ] T028 [US2] Implement edge function `supabase/functions/simplefin-sync/index.ts` per contract: auth + membership → manual rate-limit gate (1h) → `get_institution_secret` → build window → `GET /accounts` → for each txn `upsert_transaction` (default person = `household_people` linked to `created_by`, else lowest `sort_order`) → `mark_simplefin_synced`. Return `{ imported, updated, warnings }`. Errors: `rate_limited`, `sync_failed`, `provider_unreachable`, `institution_not_found`.
- [ ] T029 [P] [US2] Deno pure-logic test in `supabase/functions/simplefin-sync/` for the rate-limit gate + default-person selection helper (extract as pure fns; mirror `completion.test.ts`).

### Client + UI

- [ ] T030 [US2] Add `syncInstitution(institutionId, { manual })` to `web/lib/aggregation.ts`.
- [ ] T031 [US2] Add a rate-limited "Refresh now" control to the SimpleFIN institution row in `LinkedBanks.tsx` (calm "just updated" message on `rate_limited`; show imported count / warnings on success). Refresh linked banks + activity after sync.
- [ ] T032 [US2] Component test: "Refresh now" calls `syncInstitution`, success surfaces the imported count, `rate_limited` surfaces the calm message (mock client).

**Checkpoint**: US2 independently testable — sync writes correct, deduped, split-valid ledger rows.

## Phase 5: User Story 3 — Disconnect (P3)

**Goal**: disconnect deletes the secret, marks disconnected, stops syncs; imported txns remain.
**Independent test**: disconnect flips status + deletes secret; idempotent; activity retains imported rows.

- [ ] T033 [US3] Implement edge function `supabase/functions/simplefin-disconnect/index.ts` per contract: auth + membership → idempotent if already disconnected → `delete_institution_secret` + status `disconnected` + `disconnected_at`. (No provider revoke call — SimpleFIN is disabled Bridge-side.)
- [ ] T034 [US3] Extend `disconnectInstitution` in `web/lib/aggregation.ts` to route to `simplefin-disconnect` for SimpleFIN institutions (provider-aware), keeping Plaid routing intact.
- [ ] T035 [US3] Ensure `LinkedBanks.tsx` disconnect works for SimpleFIN rows (reuse the existing inline-confirm disconnect UI); component test covers success + idempotent no-op (mock client).

**Checkpoint**: US3 independently testable.

## Phase 6: Polish & Cross-Cutting

- [ ] T036 [P] Verify the full bar per [quickstart.md](./quickstart.md): `services/aggregation` typecheck+test+`sync:functions`+re-test (drift-lock); `web` `tsc --noEmit`+`npm test`+`npm run build`; Deno edge checks.
- [ ] T037 [P] Add i18n strings for the SimpleFIN connect/refresh/disclosure copy across all locale files under `web/lib/i18n/` (mirror how LinkedBanks copy is localized).
- [ ] T038 Reconcile `PARITY.md` if any shared money/normalization capability changed (amount→cents is new pure logic — add a row / note if applicable); update `docs/index.md`/`docs/web.md`/`docs/supabase.md` pointers as needed.
- [ ] T039 Write developer documentation `docs/simplefin.md` (how SimpleFIN works in Ortho: token flow, claim, Vault secret, sync loop, normalization, dedupe, deprecation of Plaid) for future functionality; link it from `docs/index.md`.
- [ ] T040 `/code-review` the full diff; fix findings; re-run the bar (T036).

---

## Dependencies & order

- **Setup (T001–T002)** → **Foundational/US4 (T003–T009)** must finish first (keeps Plaid green + recursive copy).
- **US1 (T010–T023)** depends on Foundational. **MVP = through T023.**
- **US2 (T024–T032)** depends on US1 (needs a connected institution + core module).
- **US3 (T033–T035)** depends on US1 (needs a connection). Independent of US2.
- **Polish (T036–T040)** last.

## Parallel opportunities

- T003/T004 (script + its test) pair; T005/T007/T008 relocations touch different trees → parallel after T003.
- Within US1: T010 ∥ T011 (different test files); T018 ∥ core work.
- Within US2: T024 ∥ T025 (different concerns in test files); T029 ∥ client tasks.
- Polish: T036 ∥ T037 ∥ (T039 doc) before T040 review.

## MVP scope

**User Story 1 (connect)** through **T023** is the demoable MVP: a member connects a bank
via SimpleFIN and sees institutions + accounts. US2 (sync) is the headline value and
follows immediately.

## Format validation

All tasks use `- [ ] Tddd [P?] [US?] description + path`. Setup/Foundational-shared and
Polish tasks carry no story label except the US4 containment tasks (which map to User
Story 4). Every implementation task names an exact file path.
