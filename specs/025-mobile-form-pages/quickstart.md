# Quickstart / Validation: Mobile new/edit flows as dedicated pages

How to validate the feature end-to-end. Implementation detail lives in `tasks.md`; this is the run/verify
guide. See `contracts/routes.md` and `data-model.md` for the URL/state contract.

## Prerequisites

- Work in `web/`. Node deps installed (`npm ci` if needed).
- Tests: vitest 4 + @testing-library/react. jsdom is opted-in per file (`// @vitest-environment jsdom`
  at the top). `test/setup.ts` stubs `window.matchMedia`.

## Automated validation (primary — this is TDD)

Run the whole suite and the typecheck:

```bash
cd web
npx tsc --noEmit
npm test
```

Feature-specific tests to add (write **failing first**, then implement):

1. **Transaction pages** (`test/**/transactions-new-page.test.tsx`, `…-edit-page.test.tsx`):
   - Mock `@/lib/useMediaQuery` → `useIsExpanded: () => false` (mobile) and `next/navigation`
     (`useRouter` returning a captured `push`/`replace`; `usePathname`).
   - Render `<NewTransactionPage/>` inside a real `AppStateProvider` seeded via the in-memory Supabase
     mock (`test/helpers/supabase-mock.ts`) + fixtures (`test/helpers/fixtures.ts`).
   - Assert: the transaction form renders (amount input, merchant, Save); filling valid fields and Saving
     calls the store's `addTransaction` (spy) with expected data and then `router.push('/transactions')`.
   - Edit page: seed a transaction, set `window.location.search='?id=<txId>'`, assert the form is
     prefilled from the store and Save calls `updateTransaction` with the same id.
   - `copyFrom` / settle-up params reconstruct the copy / transfer prefill.
   - **Redirects**: `useIsExpanded: () => true` ⇒ `router.replace('/transactions')` and no form; edit with
     an unknown `id` ⇒ `router.replace('/transactions')`.
2. **Property pages** (`test/**/housing-new-page.test.tsx`, `…-edit-page.test.tsx`): same shape — kind step
   then form on new; prefilled `<PropertyForm>` on edit; Save calls `addProperty`/`updateProperty`;
   desktop-width and not-found redirects.
3. **Entry-point branching** (`test/**/…-entry-nav.test.tsx`): with `useIsExpanded: () => false`, the
   Activity "＋" / row copy / settle / detail "Edit" and the Housing add/edit triggers call
   `router.push` with the correct URL; with `useIsExpanded: () => true`, they open the in-place
   tray/drawer (assert the existing overlay appears) and do **not** navigate.
4. **Housing extraction parity** (`test/**/property-form.test.tsx` + keep `test/**/AddProperty*`): the
   desktop `AddPropertyModal` (Drawer) still renders and submits via `<PropertyForm>` unchanged.
5. **Bundle-split guard** stays green: `test/web/form-factor-split.test.ts` — desktop compositions remain
   dynamically imported; the new pages don't statically import `*Desktop`. Extend it to assert the new
   `*/new` and `*/edit` pages don't pull desktop tray modules if practical.
6. **No regressions**: existing transaction/property/scan/detail/nav suites stay green.

Expected outcome: `npx tsc --noEmit` clean; `npm test` all green (new tests + unchanged existing tests);
`form-factor-split` green.

## Manual validation (secondary — visual)

> Never run a production build (`next build`) while a shared dev server is running (constitution).

- Dev server, narrow the window to `<1024px`:
  - Activity → "＋" navigates to `/transactions/new` (full-screen form, page header with back + Save).
    Save → back on Activity with the new row. Back/Cancel → Activity, nothing added.
  - A transaction → detail sheet → "Edit" → `/transactions/edit?id=…` prefilled → Save persists.
  - Row "Copy" → `/transactions/new?copyFrom=…` prefilled. Balance "Settle up" → transfer prefilled.
  - Housing → "Add property" → `/housing/new` kind step → form → Save → Housing. "Edit" → `/housing/edit?id=…`.
- Widen to `≥1024px`:
  - The same triggers open the existing right tray/drawer in place — **no** URL change.
  - Manually load `/transactions/new` (or any of the four) → redirected to the list.

## Guardrails

- Desktop files untouched: `TransactionsDesktop.tsx`, `HousingDesktop.tsx`, `WebModal.tsx`, `Drawer.tsx`
  desktop behavior. Confirm via `git diff --stat` that these are not modified.
- Tokens-only styling; page chrome reuses existing header/controls. No new colors/shadows.
