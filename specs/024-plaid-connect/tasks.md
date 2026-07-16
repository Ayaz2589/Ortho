# Tasks: Connect a Bank Account (Plaid Connect)

**Input**: Design documents from `/specs/024-plaid-connect/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: TDD is explicitly requested (constitution VI + user directive): every
implementation task is preceded by its failing-test task. Write the test, watch
it fail, then implement to green. Never regenerate a test to match code.

**Organization**: grouped by user story; each phase ends with a
**commit-and-push checkpoint** (small, truthful commits — `feat(024)/test(024)/docs(024)` style).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable (different files, no dependency on an unfinished task)
- **[Story]**: US1 web connect · US2 iOS connect · US3 disconnect · US4 household visibility

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: the new core package skeleton, deps, CI wiring — no behavior yet.

- [X] T001 Scaffold `services/aggregation/` mirroring `services/billing/`: `package.json` (name `@ortho/aggregation-core`, `vitest` devDep, scripts `test` + `sync:functions`), `tsconfig.json` (`lib: ["ES2022"]`, `types: []`), `tsconfig.tests.json`, `README.md` (extraction contract), `scripts/sync-to-functions.mjs` (byte-copy `src/` → `supabase/functions/_shared/aggregation/`), empty `src/index.ts`; `npm install` to create `package-lock.json`
- [X] T002 [P] Add `react-plaid-link@4.1.1` to `web/package.json` (`cd web && npm install react-plaid-link`)
- [X] T003 [P] Wire `services/aggregation` into CI in `.github/workflows/web-ci.yml`: replicate the billing steps (npm ci, `tsc --noEmit`, `tsc -p tsconfig.tests.json --noEmit`, `npm test`) for the new package
- [X] T004 Write the drift lock `services/aggregation/test/shared-sync.test.ts` (byte-identical file-set assertion vs `supabase/functions/_shared/aggregation/`, copied from billing's), watch it fail, then run `npm run sync:functions` to green it

**Checkpoint**: commit + push — `chore(024): scaffold services/aggregation package, CI wiring, react-plaid-link`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: schema + the provider client every story calls. BLOCKS all stories.

- [X] T005 Write migration `supabase/migrations/20260717120000_plaid_connect.sql` exactly per data-model.md: `supabase_vault` extension, 3 enums, `linked_institutions` + `linked_accounts` (member-select RLS, no client writes), zero-policy `linked_institution_secrets` + `plaid_link_sessions`, indexes, `touch_updated_at` trigger on `linked_institutions`, 3 `SECURITY DEFINER` Vault wrapper RPCs granted to `service_role` only; heavily commented in the house style. If Docker is available, validate with `supabase db reset` (all migrations must replay)
- [X] T006 [P] Add `LinkedInstitution` / `LinkedAccount` row types to `web/lib/types.ts` mirroring the two client-visible tables
- [X] T007 Write failing tests `services/aggregation/test/client.test.ts` + `test/errors.test.ts`: `createPlaidClient(fetchLike, {clientId, secret, env})` — base URL by env (`sandbox`/`production` only), `Plaid-Version: 2020-09-14` header, credentials injected into the JSON body, JSON parsing; error mapping — network throw/5xx → `provider_unreachable`, structured Plaid error body → `provider_error` (with `error_code` preserved for server logs), missing config → `not_configured`
- [X] T008 Implement `services/aggregation/src/types.ts` (institutions/accounts/session shapes, `AggregationErrorCode` union matching contracts/plaid-functions.md) + `src/plaidClient.ts` (fetch-injected, structural `FetchLike` type — no DOM lib) + `src/index.ts` exports, to green T007; run `npm run sync:functions` (drift lock stays green)

**Checkpoint**: commit + push — `feat(024): migration (linked banks + Vault RPCs) and fetch-injected Plaid client (TDD)`

---

## Phase 3: User Story 1 — Connect a bank from the web app (P1) 🎯 MVP

**Goal**: Settings → Linked banks → disclosure → embedded Plaid Link →
institution + accounts recorded and listed. Feature-dark state when unconfigured.

**Independent Test**: web Vitest suite green: unconfigured/disclosure/connect/
abandon/OAuth-return/listing all pass with Plaid modules mocked; sandbox UI
smoke per quickstart §2.6 once operator keys exist.

### Core (provider logic, test-first)

- [X] T009 [P] [US1] Write failing tests `services/aggregation/test/link-token.test.ts`: embedded request builder (`products: ["auth"]`, `additional_consented_products: ["transactions"]`, `country_codes: ["US"]`, `user.client_user_id`, `redirect_uri = appBaseUrl + "/plaid-oauth"`, language allowlist→`en` fallback) + response parser (`link_token`, `expiration`)
- [X] T010 [P] [US1] Write failing tests `services/aggregation/test/exchange.test.ts`: `/item/public_token/exchange` response parse (`access_token`, `item_id`), `/accounts/get` fixture → normalized accounts (name/official_name/mask/type/subtype), `/institutions/get_by_id` fixture → name (and graceful absence)
- [X] T011 [US1] Implement `services/aggregation/src/plaid.ts` (builders + parsers) to green T009+T010; export via `src/index.ts`; `npm run sync:functions`

### Edge functions (thin adapters over the synced core)

- [X] T012 [US1] Implement `supabase/functions/plaid-link-token/index.ts`: preflight/auth per `_shared/http.ts` + billing-checkout pattern; resolve household membership (`not_household_member`); create Plaid link token (embedded path); insert `plaid_link_sessions`; respond `{sessionId, linkToken, expiresAt}`; `not_configured` when `PLAID_*` unset
- [X] T013 [US1] Implement `supabase/functions/plaid-exchange/index.ts` per contracts/plaid-functions.md: session load/ownership/expiry/idempotent-completed; embedded `publicToken` path; institution upsert (`on conflict (provider, provider_item_id)`), `store_institution_secret` RPC, accounts insert, session→`completed`; **compensation** (best-effort `/item/remove` + cleanup, session stays `pending`, `exchange_failed`) on any post-exchange failure

### Web lib + store (test-first)

- [X] T014 [P] [US1] Write failing tests `web/test/lib/aggregation.test.ts`: invoke wrapper (mock `supabase.functions.invoke`) returns `{ok:true,...}` / `{ok:false,code}` for every contract error code, never throws provider text
- [X] T015 [P] [US1] Write failing tests `web/test/lib/plaid-link-session.test.ts`: pending-record persist/read/clear + expiry check per contracts/link-session-lifecycle.md (fixed localStorage key; injected clock — never the real one)
- [X] T016 [US1] Implement `web/lib/aggregation.ts` (billing.ts pattern) + `web/lib/plaidLinkSession.ts` to green T014+T015
- [X] T017 [P] [US1] Write failing test `web/test/store/linked-banks-bootstrap.test.tsx`: bootstrap fan-out includes `linked_institutions`+`linked_accounts` selects; `refreshLinkedBanks()` refetches; data exposed via `useApp()`
- [X] T018 [US1] Implement store additions in `web/lib/store.tsx` (DataCtx fields + services refresher) to green T017

### UI (test-first)

- [X] T019 [P] [US1] Write failing tests `web/test/settings/linked-banks.test.tsx`: unconfigured→calm placeholder (FR-012); empty state shows disclosure copy (FR-002); "Connect a bank" → link-token call → (mocked `usePlaidLink`) open → `onSuccess` → exchange → list shows institution + accounts without reload; `onExit` abandon → unchanged page + cleared pending record; provider failure → one calm `role="status"` line (never red)
- [X] T020 [US1] Implement `web/app/(app)/settings/linked-banks/page.tsx` + `web/components/settings/LinkedBanks.tsx` + `web/components/settings/PlaidLinkButton.tsx` (embedded mode; `react-plaid-link` lazy-loaded so the Plaid script never enters the initial bundle) to green T019 — tokens-only styling, real buttons, ≥40px targets
- [X] T021 [US1] Add the "Linked banks" entry row to `web/app/(app)/settings/page.tsx` (household-members only), following the existing settings-row pattern; extend the settings page test
- [X] T022 [P] [US1] Write failing tests `web/test/settings/plaid-oauth-return.test.tsx`: route resumes Link with stored `linkToken` + `receivedRedirectUri`; no pending record → calm notice + link back to Linked banks
- [X] T023 [US1] Implement `web/app/(app)/plaid-oauth/page.tsx` to green T022
- [X] T024 [US1] Add every new user-visible string to all 5 catalogs `web/lib/i18n/{bn,es,ja,ko,zh}.ts` (catalog-reachability test enforces)

**Checkpoint**: commit + push — full web suite + `services/aggregation` suite green; `feat(024): US1 — web embedded Plaid Link connect (TDD)`

---

## Phase 4: User Story 2 — Connect a bank from the iOS app (P2)

**Goal**: Capacitor platform forks to Hosted Link in the external browser;
`ortho://plaid-done` hand-back + foreground poll complete the session
idempotently.

**Independent Test**: web Vitest suite: hosted-mode fork, hand-back routing,
foreground poll (200/409/410 branches), double-completion harmlessness — all
with Capacitor + Plaid mocked. Device smoke per quickstart §2.7.

- [X] T025 [P] [US2] Write failing tests in `services/aggregation/test/hosted-session.test.ts`: hosted request builder (`hosted_link.completion_redirect_uri = "ortho://plaid-done"`, `is_mobile_app: true`; no `redirect_uri`) + `hosted_link_url` parse + `/link/token/get` result extraction (`item_add_results[].public_token` present / absent / legacy shape) per contracts
- [X] T026 [US2] Implement hosted builders/parsers in `services/aggregation/src/plaid.ts` to green T025; `npm run sync:functions`
- [X] T027 [US2] Extend `supabase/functions/plaid-link-token/index.ts` (hosted mode → `hostedLinkUrl` in response) and `supabase/functions/plaid-exchange/index.ts` (no `publicToken` + hosted session → `/link/token/get` resolution; none yet → `session_incomplete` 409)
- [X] T028 [P] [US2] Write failing tests `web/test/settings/linked-banks-ios.test.tsx`: on Capacitor platform Connect requests `mode:"hosted"` and top-level-navigates to `hostedLinkUrl` (never in-page Link); `appUrlOpen` for `ortho://plaid-done` routes to Linked banks and triggers exchange; foreground `appStateChange` with a pending record → exchange; `409` keeps waiting silently, `410`/`404` clears calmly; hand-back firing twice yields exactly one institution
- [X] T029 [US2] Implement the platform fork in `PlaidLinkButton.tsx` + a `usePlaidHandBack` hook (in `web/lib/plaidLinkSession.ts` or alongside the component) wired at the `(app)` shell level like 018's foreground entitlement refresh, to green T028
- [X] T030 [US2] Register the `ortho` URL scheme in `web/ios/App/App/Info.plist` (`CFBundleURLTypes` — config only, no Swift) and note it in `web/capacitor.config.ts` comments if the house style expects it
- [X] T031 [US2] Add any new strings to all 5 i18n catalogs

**Checkpoint**: commit + push — `feat(024): US2 — iOS Hosted Link connect with hand-back + foreground poll (TDD)`

---

## Phase 5: User Story 3 — Disconnect a bank (P2)

**Goal**: revoke at Plaid first, then mark disconnected; failure is loud
(calm copy), never a silent zombie; idempotent.

**Independent Test**: core tests for `/item/remove` semantics; RTL tests for
confirm→gone and failure→retry; headless proof via quickstart §2.5 later.

- [X] T032 [P] [US3] Write failing tests `services/aggregation/test/disconnect.test.ts`: `/item/remove` request builder; response mapping — success, Plaid `ITEM_NOT_FOUND` → success (access already gone), network/5xx → `provider_unreachable`
- [X] T033 [US3] Implement disconnect pieces in `services/aggregation/src/plaid.ts` to green T032; `npm run sync:functions`
- [X] T034 [US3] Implement `supabase/functions/plaid-disconnect/index.ts` per contract: membership check, idempotent already-disconnected 200, revoke → `delete_institution_secret` → status flip; nothing changes locally on `provider_unreachable`
- [X] T035 [P] [US3] Write failing tests in `web/test/settings/linked-banks.test.tsx` (extend): Disconnect → confirm dialog → success removes institution from active list (and hides its accounts); failure → calm retryable `role="status"` message with institution still shown
- [X] T036 [US3] Implement disconnect UI in `LinkedBanks.tsx` + `disconnectInstitution` in `web/lib/aggregation.ts` to green T035
- [X] T037 [US3] Add any new strings to all 5 i18n catalogs

**Checkpoint**: commit + push — `feat(024): US3 — disconnect with provider-first revoke (TDD)`

---

## Phase 6: User Story 4 — Household visibility (P3)

**Goal**: both members see linked banks with connector attribution; nothing
secret is client-readable (already enforced by schema — this story is the UI
attribution + proof).

**Independent Test**: RTL render as the non-connecting member (store fixtures)
shows institution, accounts, "Connected by A · date"; RLS posture asserted by
the migration review + SC-002 grep in Phase 7.

- [X] T038 [P] [US4] Write failing test (extend `web/test/settings/linked-banks.test.tsx`): institutions render connector name (resolved via existing users/people data) + connected date + status, for a member who did not connect it
- [X] T039 [US4] Implement attribution rendering in `LinkedBanks.tsx` to green T038; i18n the strings ×5

**Checkpoint**: commit + push — `feat(024): US4 — household visibility & attribution`

---

## Phase 7: Polish & Cross-Cutting

- [X] T040 [P] Write operator sandbox probe `web/scripts/ops/plaid-smoke.ts` (billing-probe pattern, `OPERATOR=1` gate): link-token → `/sandbox/public_token/create` → exchange → assert rows + Vault mapping → disconnect → assert revoke + status; prints a checklist, never logs tokens
- [X] T041 [P] Docs sweep: `docs/supabase.md` (3 new functions, Vault pattern §, migration row in §4.4/4.1), `docs/web.md` (Linked banks page, aggregation lib, hand-back hook), `docs/index.md` one-line mention if warranted; `FUTURE-TASKS.md` §1.1 note that connect-only landed as 024 (sync still future); PARITY.md — confirm no new row needed (no money/date logic; record that check in the tasks addendum if so)
- [X] T042 [P] SC-002 secret-material audit: grep the static export output for `PLAID_` / `access-token` patterns; assert exchange/list responses in tests carry only display fields; verify no `console.log` of tokens in functions
- [X] T043 Full gates locally: `cd web && npx tsc --noEmit && npm test`; `cd services/aggregation && npx tsc --noEmit && npx tsc -p tsconfig.tests.json --noEmit && npm test`; `cd services/billing && npm test` (drift locks); `cd web && npm run gen:vectors` + confirm zero vector drift; `npm run build` (static export succeeds and its route list includes `/plaid-oauth` and `/settings/linked-banks`)
- [ ] T044 Final push; watch both workflows green (`GH_TOKEN=placeholder gh run watch --exit-status` for Web CI and Capacitor iOS CI); fix anything red before proceeding to review

**Checkpoint**: commit + push — `docs(024)/chore(024)` as appropriate

---

## Dependencies & Execution Order

- **Phase 1 → 2 → 3** strictly (setup → schema+client → MVP story).
- **US2 (Phase 4)** depends on US1's functions/lib/UI existing (extends them).
- **US3 (Phase 5)** depends on Phase 2 + a listable institution (US1) for its UI tests; its core/function tasks depend only on Phase 2.
- **US4 (Phase 6)** depends on US1 (renders its data).
- **Phase 7** last; T040–T042 parallelizable, T043→T044 sequential.
- Within every story: failing test task strictly before its implementation task.

## Parallel opportunities

- T002/T003 alongside T001; T006 alongside T005; T009+T010 together; T014+T015+T017 together; T019+T022 together; T025+T028 test-writing together; T032+T035 together; T040+T041+T042 together.

## Implementation Strategy

MVP = Phases 1–3 (US1): a household member connects a sandbox bank on web,
end-to-end, feature-dark until operator keys exist. Then US2 (iOS), US3
(disconnect — required before any real shipping), US4 (attribution), polish.
Each checkpoint leaves the branch green and pushed; suites must pass at every
checkpoint, not just at the end.
