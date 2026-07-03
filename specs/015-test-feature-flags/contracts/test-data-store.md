# Contract: Test-Data Isolation & Auth Bypass

The central safety contract: in test-data mode, **nothing reaches the live backend**. Tests assert
these on both surfaces.

## C-TD-1 — No live reads or writes in test-data mode

When `effectiveUseTestData` is true:
- No create / update / delete request is issued to the live Supabase backend for any domain
  (transactions, shares, cards, properties, budgets, rental payments, people).
- No live read (`loadAll` / `loadXFromServer`) populates the store; data comes only from the
  in-memory seed.
- The DEBUG importers (iOS `LegacyImporter` / `TDBankMay2026Importer`) and "Sync all from server" are
  inert under the flag.

**iOS mechanism**: each optimistic mutator in `AppState` performs its local array mutation, then the
`Task { try await …API.create/update/delete… }` server hop is wrapped `if !testDataEnabled { … }`.
Reads early-return under the flag.

**web mechanism**: `createClient()` returns the in-memory fake (`lib/testdata/memory-client.ts`)
when `isTestBuild() && effectiveUseTestData`; every store read/write/auth call funnels through that
one handle, so no live network call is constructed.

**Test**:
- web — with the flag on, assert `createBrowserClient` (the real client) is never constructed and no
  fetch/insert escapes; mutating in-app leaves the fake's recorded writes local (SC-001).
- iOS — with `testDataEnabled` true, assert mutators complete without invoking the API layer
  (inject a spy/no-op API seam or assert no `dataError` and no network attempt).

## C-TD-2 — Local mutations work fully

With the flag on, add/edit/delete/split/settle operate on the in-memory dataset and are reflected in
all derived views (dashboard totals, member balances, groups, month/range pickers). No operation is
disabled (FR-006).

## C-TD-3 — Real data is untouched and restored

- Enabling the flag does not modify live data.
- Disabling the flag restores the real live data with zero residue from the test session; real rows
  are identical to before (FR-007, SC-002).
- Fixed sample UUIDs never appear in any live create/update/delete payload (FR-012).

## C-TD-4 — Auth bypass short-circuits the whole gate

When `bypassAuth` is true (test build only):
- iOS: the root gate renders the tab shell directly; `observeAuthChanges()` / bootstrap are skipped;
  any existing real session is left intact (not signed out).
- web: **both** halves are handled together — `proxy.ts` skips the `/sign-in` redirect (reads the
  `ortho_bypass_auth` cookie under `isTestBuild()`), **and** `store.tsx` skips `auth.getUser()`,
  seeds from the in-memory client, and neuters the `onAuthStateChange` `SIGNED_OUT` hard-redirect.
- Result: no redirect loop, no empty shell, no live auth/data call (FR-013..016).

**Test** (web): with bypass cookie + test env, a request to an app route is not redirected to
`/sign-in`; the store boots populated from the seed; toggling bypass off restores the redirect.

## C-TD-5 — Clean mode switch

Toggling `useTestData` re-initializes the data source (re-seed / re-bootstrap, or prompted relaunch
on iOS for the session-less direction). Live and test rows are never present together in one session
(FR + R6).

## C-TD-6 — Production unreachable

On a non-test build, none of the above code paths are reachable (guaranteed by C-FF-4). The
in-memory client, seed, and bypass branches dead-code-eliminate (web) or compile/branch out (iOS).
