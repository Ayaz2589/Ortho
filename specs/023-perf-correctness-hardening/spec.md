# Feature Specification: Web + iOS Performance & Correctness Hardening

**Feature Branch**: `023-perf-correctness-hardening`

**Created**: 2026-07-14

**Status**: Draft

**Input**: User description: "Do a full sweep of the Ortho web application — check for bugs, refactors, anything that would speed the web app and iOS app up — then create a spec to make the changes." Scope is the union of a four-part codebase audit (performance, correctness, iOS/Capacitor shell, refactor/type-safety). The audit dossier with exact `file:line` references and fix directions is the implementation source of truth: `specs/023-perf-correctness-hardening/audit-findings.md`.

## Overview

Ortho is a calm, money-first household budgeting app: one canonical web/TypeScript codebase delivered to two targets — a responsive browser app and a Capacitor-wrapped iOS app — over a shared Supabase backend. A four-part audit of that codebase surfaced a batch of defects and improvement opportunities that share one theme: **make the app faster and more correct without changing what it computes or how it looks.**

This feature lands those fixes. It corrects genuine money/UX bugs, removes weight and repeated work from the load-and-scroll path (both targets), and hardens the codebase against future breakage — under a hard guarantee that every performance and refactor change is behavior- and pixel-identical, and every bug fix changes behavior only to make a wrong result right. The static-export delivery model stays intact, so the iOS target is unaffected by construction.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Money stays correct in any display currency (Priority: P1)

A household member whose display currency is not USD (e.g. £ or €) opens an existing shared transaction that was split by exact per-owner amounts, and edits it (or opens it and saves without changing anything). The per-owner amounts still add up to the transaction total, the split is saved correctly, and Save is never falsely blocked. Settling up between two members leaves their balance at exactly zero.

**Why this priority**: This is the app's #1 money invariant — per-owner shares must sum to the transaction total. Today, in a non-USD display currency, editing a custom-split transaction can either falsely block every save or silently persist shares that don't sum to the total, corrupting per-owner spend and settle-up balances thereafter. Wrong money is the most severe class of defect in a budgeting app.

**Independent Test**: In a non-USD display currency, open a value-split transaction, save it unchanged, and confirm the stored shares still sum to the total and no false validation error appears; repeat with an actual edit; run a settle-up and confirm the balance reaches exactly zero.

**Acceptance Scenarios**:

1. **Given** a 2-owner value-split transaction and a GBP/EUR display currency, **When** the user opens it and taps Save without changing anything, **Then** it saves and the per-owner shares still sum exactly to the transaction total (no drift, no false "amounts must add up" error).
2. **Given** the same transaction, **When** the user changes a field and saves, **Then** the split is validated and stored against the true (un-drifted) total.
3. **Given** two members with a non-zero balance in a non-USD currency, **When** one settles up, **Then** the created transfer zeroes the balance with no residual cent.

---

### User Story 2 - The app opens fast and scrolls smoothly (Priority: P1)

Anyone opening Ortho (browser or iOS) downloads less on first load and sees the money figures paint quickly; scrolling a long transaction list and interacting right after an edit feels immediate, with no jank.

**Why this priority**: Speed is the explicit goal of the sweep and directly protects the product promise ("money is the headline, tap response feels immediate"). The largest remaining first-load weight and the heaviest repeated per-render work are both removable with no change to what the user sees.

**Independent Test**: Build the app and confirm the initial-load download shrank versus baseline and that a default-language user fetches no translation catalog; profile a long-list render and an unrelated update and confirm repeated formatter/aggregation work and whole-list re-renders are eliminated — with identical on-screen output.

**Acceptance Scenarios**:

1. **Given** a freshly built app, **When** the initial download is measured, **Then** translation catalogs for non-active languages are absent from initial load and a default-language user downloads none, and the measured initial-load size is lower than the recorded baseline.
2. **Given** a long transaction list, **When** it renders, **Then** locale formatters and dashboard aggregations are not rebuilt/recomputed per row/render, and the displayed amounts, dates, and insights are identical to before.
3. **Given** any single unrelated state change (one optimistic add, an FX refresh, a loading toggle), **When** it occurs, **Then** the entire list and every dashboard card do not all re-render — only the affected parts do — with no visible difference.

---

### User Story 3 - Budget insights read correctly for any selected month (Priority: P2)

A user who selects a specific past or current month on the dashboard sees budget insights whose "days left" and over/approaching/under-budget verdicts are correct for that month.

**Why this priority**: Insights are a trust surface. Today, selecting a specific month feeds a mid-month reference date into the insight engine, so a long-finished month still shows "…with 14 days left" and the positive "under budget" card can never appear in month-select mode. The amounts are right but the framing is wrong, which erodes trust.

**Independent Test**: Select a completed past month with a known budget outcome and confirm the day-count and the chosen verdict (over/approaching/under) match the month's real elapsed time; confirm the "under budget" card can appear.

**Acceptance Scenarios**:

1. **Given** a completed past month is selected, **When** budget insights render, **Then** the day-count reflects that month's actual length (not ~14 days) and no "days left" is implied for a month that is over.
2. **Given** a month whose spend finished well under budget, **When** it is selected, **Then** the "under budget" positive insight can fire (it is not permanently suppressed in month-select mode).

---

### User Story 4 - iOS feels native and keeps your place (Priority: P2)

An iOS user scans a receipt, backgrounds and reopens the app, and moves between tabs — the camera dismisses into the review flow, unlocking with Face ID returns them exactly where they were, the status bar is always readable, and a revoked session is caught on reopen.

**Why this priority**: These are the native-feel and session-security promises of the iOS shell (constitution Principle III). Each is a concrete, reproducible break: the scan camera never dismisses (review renders behind it) and drops multi-page captures; the biometric lock reloads the whole app on every unlock (losing scroll, modals, and in-progress input); the status bar only matches the theme after visiting Settings; and the foreground session check can't detect a server-side revocation.

**Independent Test**: On device/simulator via CI or manual check: capture a receipt and confirm the camera dismisses and all pages are kept; background and Face-ID-unlock and confirm no reload and preserved scroll/modal/input; force a theme and confirm the status bar matches from launch on every tab; revoke a session server-side and confirm foreground catches it.

**Acceptance Scenarios**:

1. **Given** a receipt/statement capture on iOS, **When** capture completes, **Then** the camera surface dismisses, the review flow is visible and usable, and every page of a multi-page capture is retained.
2. **Given** the app is backgrounded and re-opened behind the biometric lock, **When** the user unlocks, **Then** they return to the same screen with data, scroll position, open modals/drawers, and in-progress form input intact — no spinner, no re-bootstrap.
3. **Given** a forced light/dark theme, **When** the app launches and the user moves across tabs, **Then** the status bar text is readable (matches the theme) from first paint, not only after opening Settings.
4. **Given** a session revoked server-side (still within local token lifetime), **When** the app is foregrounded, **Then** the revocation is detected.
5. **Given** a transient interruption (Control Center, notification shade, the auth sheet itself), **When** it occurs, **Then** no duplicate Face ID prompt or spurious lock flash appears.

---

### User Story 5 - Web niceties and correct copy (Priority: P2)

A browser user can select and copy an amount or merchant name from the screen, and the sign-in screen accurately describes the code they'll receive.

**Why this priority**: Small but real correctness/usability leaks: the iOS long-press-selection suppression isn't native-gated, so it disables text selection on the browser build too; and a translation string still advertises a "6-digit code" when sign-in is 8-digit. Both are cheap, visible fixes.

**Independent Test**: On the browser build, select and copy an amount and a merchant name; read the sign-in caption and confirm it says 8-digit.

**Acceptance Scenarios**:

1. **Given** the browser build, **When** the user selects text such as an amount or merchant name, **Then** selection and copy work (the long-press suppression applies only to the iOS shell).
2. **Given** the sign-in screen in any language, **When** the code caption is shown, **Then** it states an 8-digit code.

---

### User Story 6 - Responsive at scale (Priority: P3)

As a household's transaction history grows large, the ledger and dashboard stay responsive: an unrelated update doesn't re-render every row, and data loads fetch only what's needed.

**Why this priority**: This is the structural payoff behind US2 — splitting the single data context so unrelated changes stop re-rendering all consumers, memoizing rows, and (follow-on) windowing the ledger; plus fetching only the columns used. Highest value at large data volumes, larger and riskier than the US2 quick wins, so lower priority.

**Independent Test**: With a large synthetic ledger, trigger an unrelated state change and confirm only affected components re-render; confirm data loads request only used columns with identical loaded values.

**Acceptance Scenarios**:

1. **Given** a large ledger, **When** one optimistic mutation occurs, **Then** only the changed row and directly-affected summaries re-render, not the whole list.
2. **Given** a data load, **When** it runs, **Then** it requests only the columns the app uses, and the resulting in-app data is identical to before.

---

### User Story 7 - A codebase that's safe to change (Priority: P3)

A developer changing the schema or a transaction flow is caught at compile time (not runtime) by type checks, works against a single source of truth for shared logic, and isn't slowed by dead code.

**Why this priority**: Reduces future bug risk and maintenance cost without user-facing change: type the Supabase-row→domain boundary so a column/enum rename fails to compile; model transfer-vs-spend through one typed accessor instead of eight hand-branched sites; de-duplicate the month-accordion and transaction-form-body logic; purge confirmed dead code (unused translation keys with a reintroduction guard, an orphaned helper) and resolve the unwired aggregate-RPC module.

**Independent Test**: Introduce a column rename in a scratch branch and confirm the type check now fails; confirm the dead-key guard test fails when a stray key is added; confirm the deduplicated helpers have a single definition.

**Acceptance Scenarios**:

1. **Given** a renamed Supabase column/enum, **When** the type check runs, **Then** it fails at compile time rather than surfacing at runtime.
2. **Given** an unreachable translation key is added, **When** the guard test runs, **Then** it fails.
3. **Given** the month-accordion and form-body logic, **When** inspected, **Then** each has a single shared definition used by both mobile and desktop.

---

### Edge Cases

- **FX round-trip drift** (US1): values that don't survive a cents→display→cents round-trip (≈22% at GBP, ≈8% at EUR; USD/CAD/JPY exact) must not corrupt split shares or the settle-up amount — the true integer-cents value is authoritative, not the re-parsed display string.
- **No-op edit** (US1): opening and saving a transaction unchanged must be a true no-op for its stored split.
- **Second consecutive write failure** (US1/data): if a compensating rollback write also fails, the app must not present a share-less/partial transaction as consistent — surface the error and keep the affected row flagged rather than dropped.
- **Default vs non-default language** (US2): a default-language (English) user must download zero translation catalogs; switching language loads exactly one, and the UI shows no English fallback flash for a translated screen once loaded.
- **Completed vs current month** (US3): month-scoped insights must be correct for a month that is entirely in the past as well as the in-progress current month.
- **Transient iOS interruptions** (US4): Control Center / notification shade / the auth sheet must not be treated as a real background→foreground lock transition.
- **Behavior/visual parity** (all): the finance regression-vector suites, the full test suite, and the type check must remain green — this feature changes *when/how efficiently* code runs (and corrects specific wrong results), never *what* the shared logic computes for correct inputs, and introduces no visual/token change.

## Requirements *(mandatory)*

### Functional Requirements — Correctness (US1, US3, US4, US5)

- **FR-001**: Editing a transaction with a custom (per-owner value) split in any display currency MUST preserve per-owner shares that sum exactly to the transaction total; a no-op edit MUST NOT alter the stored split and MUST NOT falsely block Save. The true integer-cents total and stored shares are authoritative over any display-currency re-parse.
- **FR-002**: A settle-up transfer MUST bring the computed balance between two members to exactly zero regardless of display currency (no residual cent).
- **FR-003**: Budget insights for a user-selected specific month MUST compute "days left" / month-progress from that month's real elapsed time and MUST evaluate the same over/approaching/under-budget rules as the current-month view, including firing the positive "under budget" outcome when warranted.
- **FR-004**: On iOS, after a capture completes, the camera capture surface MUST dismiss and the review flow MUST be visible and usable; a multi-page capture MUST retain every captured page.
- **FR-005**: On iOS, unlocking via biometrics after backgrounding MUST return the user to the same screen with loaded data, scroll position, open modals/drawers, and in-progress form input intact — with no full reload/re-bootstrap.
- **FR-006**: Foreground session re-validation MUST detect a session revoked server-side, not only an expired local token.
- **FR-007**: User-facing copy MUST accurately describe current behavior; specifically the sign-in code-length copy MUST read as 8 digits in every language.
- **FR-008**: A write failure during transaction create/edit MUST never leave a persisted transaction with missing shares or shares that don't sum to its total; if full rollback cannot be confirmed, the app MUST surface the error and MUST NOT present the affected data as consistent.
- **FR-009**: On the browser (non-native) build, users MUST be able to select and copy on-screen text (amounts, merchant names); the long-press selection suppression MUST apply only to the iOS shell.
- **FR-010**: On iOS, the status-bar text style MUST match the active light/dark theme from first launch and on every destination, not only after visiting Settings.
- **FR-011**: On iOS, a transient interruption (Control Center, notification shade, the auth sheet itself) MUST NOT cause a duplicate biometric prompt or a spurious lock flash.

### Functional Requirements — Performance (US2, US6)

- **FR-012**: Translation catalogs for non-active languages MUST NOT be part of the initial-load download; a default-language user MUST download no translation catalog.
- **FR-013**: The measured initial-load JavaScript MUST decrease versus the recorded baseline as a result of FR-012, with no change to any displayed translation.
- **FR-014**: Money and date formatting MUST NOT reconstruct locale formatters per row/render; output MUST be byte-identical to today.
- **FR-015**: Dashboard summary/insight/budget computations MUST NOT recompute on unrelated re-renders; results MUST be identical.
- **FR-016**: A single unrelated state change (one optimistic mutation, an FX refresh, a loading toggle) MUST NOT re-render every transaction row and dashboard consumer; only affected components re-render.
- **FR-017**: Data loads MUST fetch only the columns the app uses (no select-all); loaded values MUST be identical to today.

### Functional Requirements — Maintainability & Type-Safety (US7)

- **FR-018**: The Supabase-row → domain-object boundary MUST be type-checked so a column/enum rename fails at compile time rather than at runtime.
- **FR-019**: The transaction transfer-vs-spend shape MUST be accessed through a single typed guard/accessor rather than duplicated ad-hoc branching across call sites.
- **FR-020**: The duplicated month-accordion logic and the duplicated transaction-form-body assembly MUST each have a single source of truth shared across mobile and desktop.
- **FR-021**: Every translation-catalog key MUST be reachable from the UI (or an allowlisted dynamic source); unreachable keys MUST be removed and a guard MUST prevent reintroduction.
- **FR-022**: Confirmed-orphaned code (the unused relative-time helper; duplicated test doubles where feasible) MUST be removed, and the unwired aggregate-RPC module MUST be explicitly resolved — kept documented-unwired or deleted — and MUST NOT be wired in this feature.

### Functional Requirements — Cross-Cutting Guarantees (all stories)

- **FR-023**: No change may alter any computed money/date result for correct inputs, nor any visual, design token, or copy (except the FR-007 correction). The finance regression-vector suites, the full test suite, and `tsc --noEmit` MUST pass.
- **FR-024**: The static-export delivery model MUST be preserved (no server, SSR, route handler, or middleware) so the Capacitor iOS build is unaffected; iOS build verification is via the Capacitor iOS CI on push.
- **FR-025**: Each bug fix (FR-001…FR-011) MUST be developed test-first — a failing test that reproduces the defect precedes the fix (constitution Principle VI).

### Key Entities

- **Split shares**: the per-owner cents map on a transaction; invariant — sums exactly to the transaction total (client-enforced). Central to US1/FR-001/FR-008.
- **Translation catalog**: the per-language string table; today all ship eagerly, targeted for on-demand loading (US2/FR-012).
- **Session**: the authenticated Supabase session (Keychain-persisted on iOS); its foreground liveness and biometric-lock lifecycle are the subject of US4.
- **Initial-load download**: the JavaScript every user fetches before the app is usable; the quantity US2 reduces (measured with the existing bundle tool).
- **Budget-insight reference date**: the "now" fed to the insight engine; must derive from the selected month's real time (US3/FR-003).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In a non-USD display currency, editing and saving any split transaction yields per-owner shares that sum exactly to the total in 100% of cases; no transaction can be persisted with shares that don't sum to its total.
- **SC-002**: The measured initial-load download decreases versus the recorded baseline (target: the ~30 KB-compressed translation-catalog weight leaves initial load; default-language users download none), verified by the bundle-measurement tool.
- **SC-003**: On a long ledger, an unrelated state change no longer re-renders the whole list, and locale formatters/dashboard aggregations are not rebuilt per row/render — with on-screen amounts, dates, and insights byte-identical to before.
- **SC-004**: Budget-insight day-counts and over/approaching/under verdicts are correct for any selected month, including completed past months (the "under budget" card can fire in month-select mode).
- **SC-005**: On iOS, capture→review works end to end (camera dismisses, all pages retained), unlocking after backgrounding restores the exact prior screen with no reload, and the status bar matches the theme from launch — verified via the Capacitor iOS CI and/or a manual device check.
- **SC-006**: Browser users can select and copy amounts and merchant names; sign-in copy reads "8-digit" in every language.
- **SC-007**: All existing automated tests (including the regression-vector parity suites) and the type check pass unchanged; the app still produces a working static export and the Capacitor iOS CI is green.
- **SC-008**: The codebase carries zero confirmed dead translation keys (guarded against reintroduction) and no confirmed orphaned helpers; the Supabase→domain boundary is type-checked; the aggregate-RPC module is explicitly resolved.

## Assumptions

- **Delivery model is fixed**: static export (no runtime server) and the Capacitor iOS target stay; not revisited here.
- **No behavior/visual change for perf & refactor items**: any observable change from a performance or refactor item is a regression; only the bug fixes (FR-001…FR-011) change behavior, and only to correct a wrong result.
- **iOS verification is via CI**: the Linux dev environment can build the static export and run the full test suite + type check but cannot build the iOS app; the Capacitor iOS CI on push is the iOS build signal, and iOS-runtime behaviors (biometric lifecycle, camera dismissal, status bar) are validated there and/or by a manual device check.
- **B7 scope is client-side hardening**, not a schema change: this feature checks/handles the compensating rollback writes and surfaces failures; making the parent+shares write truly atomic via a Postgres RPC is a larger, separately-scoped follow-up (noted in `PARITY.md`).
- **Aggregates stay unwired**: `lib/api/aggregates.ts` is a net performance *loss* to wire standalone (adds round-trips, breaks offline); this feature resolves it (keep-documented-unwired or delete) but does not wire it. `loadAll` windowing is likewise deferred (coupled to server aggregates); only column-projection is in scope.
- **Supabase typegen**: generated `Database` types are preferred; if schema codegen isn't runnable in-sandbox, a hand-written typed row→domain mapper at the load boundary is an acceptable equivalent that satisfies FR-018.
- **Explicitly out of scope / audited-correct — do not touch**: splits/balances/money/currency rounding, `monthBounds`, mortgage math, housing net-rental, and housing date parsing were all audited and found correct.
- **The audit dossier** (`specs/023-perf-correctness-hardening/audit-findings.md`) is the implementation source of truth for exact `file:line` locations and fix directions.
