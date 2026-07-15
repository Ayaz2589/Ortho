# Contract — Correctness Fixes (US1, US3, US4, US5)

Each bug fix is **test-first** (FR-025): a failing test reproduces the defect before the fix. Below,
each has its acceptance contract and how it's verified. Web-observable fixes get jsdom/component
tests; iOS-runtime fixes get a contract + Capacitor iOS CI build + a manual device check.

## C-B1 — FX split-shares (FR-001) — HIGH, web-testable
- **Contract**: for any display currency, opening a value-split transaction and saving unchanged
  leaves `sum(shares) === amount_cents` and does not block Save; editing the split validates/stores
  against the un-drifted `finalCents`.
- **Repro test (first)**: GBP display; a 2-owner value split (dossier cases 2¢→1/1 and 11¢→2/9);
  assert the current code either false-blocks or writes `sum(shares) !== amount_cents`. Then fix →
  assert the invariant holds and `canSave === true`.
- **Verify**: Vitest (jsdom) on `TxForm`; the invariant also implicitly guarded by any store write test.

## C-B2 — Month-scoped budget insights (FR-003) — web-testable, vectored
- **Contract**: a selected completed month shows `daysLeft`/progress from that month's real elapsed
  time; the "under budget" positive insight can fire in month-select mode; current-month behavior
  unchanged.
- **Repro test (first)**: feed a past month + under-budget spend; assert current output shows "~14
  days left" and no under-budget card. Fix → assert correct day-count + the positive card.
- **Verify**: `insights.ts` unit/vector test; **regenerate affected vectors and review the diff**
  (month-select fields only; current-month unchanged).

## C-B3 — iOS scan camera dismissal + multi-page (FR-004) — iOS-runtime
- **Contract**: capture completes → camera dismisses → review flow visible/usable; multi-page capture
  retains every page; temp images cleaned up.
- **Verify**: Capacitor iOS CI build (Swift compiles/links) + manual device/simulator: single-shot and
  multi-page. Not runnable in the Linux sandbox — assert the JS `useScanFlow` `onPageCaptured` wiring
  with a mocked plugin where possible.

## C-B4 — Biometric lock preserves state (FR-005) — iOS-runtime
- **Contract**: unlocking after backgrounding returns to the same screen with data/scroll/modals/
  in-progress input intact; no spinner, no re-bootstrap (`runBootstrap` runs once per app launch).
- **Verify**: manual device check (background → Face ID → confirm no reload); a web/jsdom test can
  assert the provider is not unmounted when the gate toggles (render the shell with a mocked gate
  state and assert the provider instance/`booted` ref persists).

## C-B5 — Foreground liveness via getUser (FR-006) — mostly web-testable
- **Contract**: the `appStateChange`/foreground handler calls `getUser()` (server), so a revoked
  session is detected.
- **Repro test (first)**: mock the Supabase client; assert the current handler calls `getSession`; fix
  → assert it calls `getUser` and that a `getUser` error path drives sign-out.
- **Verify**: store test with the Supabase mock.

## C-B6 — "8-digit" copy (FR-007) — web-testable
- **Contract**: the sign-in code caption reads "8-digit" in every language.
- **Verify**: a catalog/render test asserts no "6-digit"/"6-digit code" string remains; sign-in render
  shows 8-digit. Folded into the D16 dead-key work.

## C-B7 — Checked compensating writes (FR-008) — web-testable
- **Contract**: on a compensation failure, the app keeps the error banner and does not present the
  affected row as consistent (no share-less row silently normalized).
- **Repro test (first)**: mock the Supabase client so the primary write fails AND the compensating
  delete/update fails; assert current code drops/normalizes the row; fix → assert error surfaced and
  the row is not presented as consistent.
- **Verify**: store test with the Supabase mock. (True atomicity via RPC is out of scope.)

## C-B8 — Native-gated text selection (FR-009) — web-testable
- **Contract**: on the browser build, amounts/merchant names are selectable/copyable; iOS keeps
  long-press suppression.
- **Verify**: assert the `user-select:none` rule is scoped by a native platform class (not bare
  `html`); a jsdom test checks the class-gating logic in the boot path.

## C-B9/B10 tail — iOS status bar + re-entrancy (FR-010, FR-011) — iOS-runtime
- **Contract**: status-bar text style matches the theme from launch and on every tab; a transient
  interruption does not double-prompt Face ID or flash the lock.
- **Verify**: manual device check + Capacitor iOS CI build; the re-entrancy guard's logic
  (ignore-while-unlocking) gets a unit test on `biometricGate.ts` where feasible.
