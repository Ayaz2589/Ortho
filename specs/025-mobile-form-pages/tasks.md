---
description: "Task list — Mobile new/edit flows as dedicated pages"
---

# Tasks: Mobile new/edit flows as dedicated pages

**Input**: Design documents from `specs/025-mobile-form-pages/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/routes.md, quickstart.md
**Tests**: REQUIRED — constitution Principle VI (TDD) is non-negotiable; every behavior is written test-first.
**Working dir**: all paths are under `web/` unless noted. Run tests with `npm test` in `web/`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable (different files, no dependency on an incomplete task)
- **[Story]**: US1 (transaction pages, P1) · US2 (property pages, P2) · US3 (desktop-preserved + guards, P3)

## Guardrails (apply to EVERY task)

- **Do NOT modify** `web/components/web/TransactionsDesktop.tsx`, `web/components/housing/HousingDesktop.tsx`,
  `web/components/web/WebModal.tsx`, or `web/components/web/Drawer.tsx` desktop behavior.
- Read query params via `new URLSearchParams(window.location.search)` in a mount `useEffect` (intent state
  starts `undefined` until read) — **never** `useSearchParams()` (research D2).
- Tokens-only styling; reuse existing controls. `npm test` must stay green after every implementation task.

---

## Phase 1: Setup & baseline

- [ ] T001 Confirm baseline is green before changing anything: from `web/` run `npx tsc --noEmit` and `npm test`; record counts. Per `web/AGENTS.md`, read the bundled routing docs `node_modules/next/dist/docs/01-app/01-getting-started/04-linking-and-navigating.md` and the `use-router` reference to confirm `useRouter`/`usePathname` from `next/navigation` and soft-nav behavior under `output:'export'`.

---

## Phase 2: Foundational (BLOCKING — shared by US1/US2/US3)

**Purpose**: pure, reusable seams the pages and entry points build on. No page exists yet.

- [ ] T002 [P] Test-first: `web/test/lib/use-form-factor-nav.test.ts` — assert `useFormFactorNav().go(url, inPlace)` calls `inPlace()` and does NOT navigate when `useIsExpanded()` is true (mock `@/lib/useMediaQuery`), and calls `router.push(url)` (NOT `inPlace`) when false (mock `next/navigation`). Verify red.
- [ ] T003 Implement `web/lib/useFormFactorNav.ts`: returns `{ isExpanded, go(url: string, inPlace: () => void) }` where `go` = `isExpanded ? inPlace() : router.push(url)`. Make T002 green.
- [ ] T004 [P] Test-first: `web/test/lib/form-page-intent.test.ts` — pure parsers over a search string per `data-model.md`: `parseTxNewIntent('?copyFrom=x')`, `('?from=a&to=b&amount=1200')`, invalid/partial → blank; `parseIdParam('?id=x')`; `parseKindParam` validates against `PropertyKind`. Verify red.
- [ ] T005 Implement `web/lib/formPageIntent.ts` (pure, no DOM) with those parsers + validation/fallbacks. Make T004 green.
- [ ] T006 [P] Test-first: `web/test/web/form-page-header.test.tsx` — `FormPageHeader` renders a semantic `<header>` with a back/cancel button (calls `onCancel`) and a Save button (calls `onSave`, disabled when `!canSave`), keyboard-reachable, visible focus ring, tokens only. Verify red.
- [ ] T007 Implement `web/components/web/FormPageHeader.tsx` (title + back/cancel + Save; ≥44px targets). Make T006 green.
- [ ] T008 Test-first: `web/test/housing/property-form.test.tsx` — mount desktop `AddPropertyModal` (Drawer) inside a real `AppStateProvider`; assert it still renders the property form and Save calls `addProperty`/`updateProperty` unchanged (desktop-parity baseline for the extraction). Verify green against current code, then keep green through T009.
- [ ] T009 Extract `web/components/housing/PropertyForm.tsx` — move `AddPropertyModal`'s form body verbatim (all field state, the `[open, editing?.id]` seed effect, `handleSubmit`, kind-conditional Mortgage/Units/Lease sections). `AddPropertyModal` keeps its `<Drawer>` and renders `<PropertyForm kind editing? onDone={onClose} />` inside. Desktop unchanged; T008 + existing housing tests stay green.

**Checkpoint**: helpers + `FormPageHeader` + `PropertyForm` exist and are green; desktop housing untouched.

---

## Phase 3: US1 — Add/edit a transaction on a full mobile page (P1) 🎯 MVP

**Goal**: mobile `/transactions/new` and `/transactions/edit` render the transaction form full-screen,
reusing `useTxForm` + `TxFormBody`; desktop keeps its tray.
**Independent test**: on `<1024px`, add and edit a transaction as pages; create/update hit the store; back/save
return to `/transactions`. Desktop-width load redirects.

### Tests (write first, verify red)

- [ ] T010 [P] [US1] `web/test/transactions/new-page.test.tsx`: mock `useIsExpanded:()=>false` + `next/navigation`; render `NewTransactionPage` in a seeded `AppStateProvider`; assert the form renders (`.ow-amount-input`, merchant, Save), a valid Save calls `addTransaction` (spy) with expected data then `router.push('/transactions')`; "Save and add another" stays on page (`resetForAnother`, no navigation).
- [ ] T011 [P] [US1] Extend `new-page.test.tsx`: `window.location.search='?copyFrom=<seededTxId>'` reconstructs the copy prefill; `'?from=<p1>&to=<p2>&amount=1200'` reconstructs the settle-up transfer; invalid/partial params fall back to a blank add form.
- [ ] T012 [P] [US1] Extend `new-page.test.tsx`: with `useIsExpanded:()=>true` the page calls `router.replace('/transactions')` and renders no form.
- [ ] T013 [P] [US1] `web/test/transactions/edit-page.test.tsx`: `?id=<seededTxId>` prefills the form from the store and Save calls `updateTransaction` with the SAME id; unknown `?id` → `router.replace('/transactions')`; `useIsExpanded:()=>true` → `router.replace('/transactions')`.

### Implementation (make the tests green)

- [ ] T014 [US1] Create `web/components/web/TxFormPageClient.tsx`: mirrors `TxModalWeb`'s composition (title/saveLabel derivation, `picking` copy sub-view, `useTxForm({editing,copying,initialTransfer})` + `TxFormBody`) but renders inside `FormPageHeader` page chrome instead of `WebModal`; Save→`onSaved` (push list), keep "add another" in-page.
- [ ] T015 [US1] Create `web/app/(app)/transactions/new/page.tsx` (`'use client'`): read intent via `window.location` mount effect (`formPageIntent`), desktop-guard (`useIsExpanded` → `router.replace('/transactions')`), resolve `copyFrom`→`transactions.find` and settle-up→`TransferPrefill`, render `<TxFormPageClient .../>`; on save/cancel `router.push('/transactions')`.
- [ ] T016 [US1] Create `web/app/(app)/transactions/edit/page.tsx` (`'use client'`): read `?id`, desktop-guard, resolve `transactions.find(id)` (redirect to `/transactions` if absent or once deleted), render `<TxFormPageClient editing=... />`; save/cancel → `router.push('/transactions')`.

### Entry-point branching (tests first, then edits — desktop paths unchanged)

- [ ] T017 [P] [US1] `web/test/transactions/entry-nav.test.tsx`: with `useIsExpanded:()=>false`, tapping Activity "＋"/empty-state calls `router.push('/transactions/new')`, row Copy → `?copyFrom=`, settle → `?from=&to=&amount=`; with `useIsExpanded:()=>true`, the same triggers open the existing in-place tray and do NOT call `router.push`. Verify red for the mobile branch.
- [ ] T018 [US1] Edit `web/app/(app)/transactions/page.tsx` `openAdd`/`openCopy`/`openSettle` to route through `useFormFactorNav` (mobile → push with intent params; desktop → today's `setState`). Do not touch `TransactionsDesktop`. Make T017 green.
- [ ] T019 [P] [US1] `web/test/transactions/detail-edit-nav.test.tsx`: on mobile, the `TransactionDetailModal` "Edit" button calls `router.push('/transactions/edit?id=<id>')` and closes the sheet (no longer mounts `TxModalWeb`). Verify red.
- [ ] T020 [US1] Edit `web/components/transactions/TransactionDetailModal.tsx` Edit action to navigate on mobile (close sheet + push edit URL). Make T019 green. Confirm no desktop detail→edit path regresses.

**Checkpoint**: US1 fully testable and green; MVP shippable.

---

## Phase 4: US2 — Add/edit a property on a full mobile page (P2)

**Goal**: mobile `/housing/new` (kind step → form) and `/housing/edit` reuse the extracted `PropertyForm`;
desktop keeps its Drawer.
**Independent test**: on `<1024px`, add (choose kind → form) and edit a property as pages; create/update hit
the store; back/save return to `/housing`. Desktop-width load redirects.

### Tests (write first, verify red)

- [ ] T021 [P] [US2] `web/test/housing/new-page.test.tsx`: `useIsExpanded:()=>false` + router mock; render `NewPropertyPage`; assert the property-kind step shows first, choosing a kind reveals `<PropertyForm>`, a valid Save calls `addProperty` (spy) then `router.push('/housing')`; `?kind=<valid>` skips the picker; `useIsExpanded:()=>true` → `router.replace('/housing')`, no form.
- [ ] T022 [P] [US2] `web/test/housing/edit-page.test.tsx`: `?id=<seededPropId>` renders `<PropertyForm editing=...>` prefilled (correct kind/sections), Save calls `updateProperty` with SAME id; unknown `?id` → `router.replace('/housing')`; desktop width → `router.replace('/housing')`.

### Implementation (make the tests green)

- [ ] T023 [US2] Create `web/components/housing/PropertyFormPageClient.tsx`: in-page kind-selection step (reuse `PropertyTypePicker`'s choices/logic without its Drawer) → `<PropertyForm kind editing? onDone/>`, wrapped in `FormPageHeader` chrome; save/cancel → `onDone`.
- [ ] T024 [US2] Create `web/app/(app)/housing/new/page.tsx` (`'use client'`): desktop-guard → `router.replace('/housing')`; read optional `?kind` via `window.location`; render `<PropertyFormPageClient/>`; save/cancel → `router.push('/housing')`.
- [ ] T025 [US2] Create `web/app/(app)/housing/edit/page.tsx` (`'use client'`): read `?id`, desktop-guard, resolve `properties.find(id)` (redirect if absent/deleted), render `<PropertyFormPageClient editing=... kind=p.kind/>`; save/cancel → `router.push('/housing')`.

### Entry-point branching (tests first, then edits — desktop paths unchanged)

- [ ] T026 [P] [US2] `web/test/housing/entry-nav.test.tsx`: with `useIsExpanded:()=>false`, Housing "Add property" → `router.push('/housing/new')` and a property "Edit" → `router.push('/housing/edit?id=<id>')`; with `useIsExpanded:()=>true`, they open the existing kind-picker/Drawer and do NOT navigate. Verify red.
- [ ] T027 [US2] Edit `web/app/(app)/housing/page.tsx` add + edit triggers to route through `useFormFactorNav` (mobile push; desktop today's `setState`). Do not touch `HousingDesktop`. Make T026 green.

**Checkpoint**: US2 fully testable and green; desktop housing untouched.

---

## Phase 5: US3 — Desktop preserved & robust across widths (P3)

**Goal**: prove desktop is unchanged and the routes never show a broken state at the wrong width / bad id.
**Independent test**: at `≥1024px` triggers open trays with no nav; loading any page URL wide, or an
unresolvable edit id, redirects to the list.

- [ ] T028 [P] [US3] `web/test/web/desktop-unchanged.test.tsx`: with `useIsExpanded:()=>true`, assert transaction + housing add/edit triggers open the in-place tray/drawer and never call `router.push` (consolidated desktop guard).
- [ ] T029 [P] [US3] `web/test/web/page-guards.test.tsx`: parametrized over the four pages — desktop width → `router.replace(list)`; the two edit pages with unresolvable `id` → `router.replace(list)`; assert no store mutation occurs in redirect cases.
- [ ] T030 [US3] Extend `web/test/web/form-factor-split.test.ts` to assert the four new pages (`transactions/new`, `transactions/edit`, `housing/new`, `housing/edit`) do not statically import `*Desktop` compositions; keep it green.

**Checkpoint**: desktop guaranteed unchanged by tests.

---

## Phase 6: Polish & final gate

- [ ] T031 [P] Accessibility + tokens sweep on new chrome: `FormPageHeader`, `TxFormPageClient`, `PropertyFormPageClient` use semantic elements, keyboard order (back → fields → Save), visible focus ring, no new hardcoded colors/shadows, `prefers-reduced-motion` respected. Add assertions to the header/page tests where missing.
- [ ] T032 [P] Docs: update `docs/web.md` directory map + route list to include the four new pages and the `PropertyForm`/`useFormFactorNav` seams (and note the mobile-page vs desktop-tray split). Keep it accurate.
- [ ] T033 Final gate: from `web/` run `npx tsc --noEmit` and `npm test` (all green, incl. `form-factor-split`); run `git diff --stat main...HEAD` and CONFIRM `TransactionsDesktop.tsx`, `HousingDesktop.tsx`, `WebModal.tsx`, and `Drawer.tsx` are NOT listed (desktop untouched). Fix anything red before done.

---

## Dependencies & order

- **Phase 1 → Phase 2 → (Phase 3 = MVP) → Phase 4 → Phase 5 → Phase 6.**
- US1 (Phase 3) depends only on Foundational (nav helper, intent parser, FormPageHeader). It is the MVP and
  can ship alone.
- US2 (Phase 4) depends on Foundational **including the `PropertyForm` extraction (T009)**.
- US3 (Phase 5) depends on US1 + US2 pages/entry points existing.
- Within a story: tests (T0xx) before their implementation; entry-point test before its edit.

## Parallel opportunities

- Foundational tests T002/T004/T006 are `[P]` (independent files). T008 (parity) independent too.
- US1 page tests T010–T013 are `[P]`; US2 tests T021/T022 `[P]`; US3 T028/T029 `[P]`.
- Implementation tasks that touch the same file (e.g. T015/T016 both new files but independent → `[P]`-able;
  T018 and T020 touch different files → parallel-safe).

## MVP scope

**US1 (Phase 3) is the MVP**: mobile add/edit *transaction* as full pages with desktop unchanged. Ship, then
layer US2 (property pages) and US3 (guard hardening).

## Independent test criteria (recap)

- **US1**: `<1024px` add/edit transaction are distinct pages; store create/update fire; back/save → `/transactions`; desktop-width redirects.
- **US2**: `<1024px` add (kind→form)/edit property are distinct pages; store create/update fire; back/save → `/housing`; desktop-width redirects; desktop Drawer still works via `PropertyForm`.
- **US3**: `≥1024px` triggers open trays with no nav; all four routes redirect to the list at desktop width or on bad id; bundle-split guard green; desktop files unmodified.
