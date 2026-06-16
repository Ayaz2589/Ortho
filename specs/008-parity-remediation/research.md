# Research: Cross-Platform Parity Remediation

Each divergence is resolved to a single canonical behavior. Format: Decision / Rationale / Alternatives.

## R1 — iOS cold-launch session restore

**Decision**: Restore the session synchronously before the auth gate's first render. In `AppState`,
expose the SDK's already-persisted session at init time (read `supabase.auth.currentSession`), and add an
explicit launch phase (`.launching` / `.signedIn` / `.signedOut`) so `Ortho_iOSApp`'s `WindowGroup` renders
a neutral launch view until the phase resolves, instead of defaulting to `SignInView` while
`authStateChanges` is still in flight.

**Rationale**: The current gate is `session != nil ? RootTabView : SignInView`, and `session` is only set
by the async `observeAuthChanges` stream, so the first frame is always signed-out → a sign-in flash even
for valid sessions. supabase-swift persists the session to the keychain and exposes it synchronously via
`auth.currentSession`; using it removes the race.

**Alternatives**: (a) Keep async-only but show a splash whenever `session == nil && !hasResolvedAuth` —
still needs a resolved flag, so equivalent work; chosen approach is cleaner. (b) `emitLocalSessionAsInitialSession`
SDK opt-in — emits the local session immediately but still asynchronously and can emit an expired one; we
already need the refresh/expiry handling (R2), so synchronous read + R2 covers it without the opt-in's flash.

## R2 — Expired-but-refreshable session

**Decision**: Replace the defensive `if session.isExpired { self.session = nil }` branch in
`observeAuthChanges` with a refresh attempt: `try await supabase.auth.refreshSession()`; keep the user
signed in on success, only fall to signed-out when refresh genuinely fails (revoked/expired refresh token).

**Rationale**: Dropping an expired-but-refreshable session signs out a user who has a valid refresh token —
the exact "lands on Sign In with empty data" symptom. Refreshing is what web's middleware does implicitly.

**Alternatives**: Trust the SDK's auto-refresh only — insufficient, because the explicit `isExpired` drop
pre-empts it. Remove the `isExpired` check entirely — risky: an unrefreshable expired session would let the
user into the shell with failing requests; refresh-then-decide is correct.

## R3 — Sign-out teardown

**Decision**: On `signOut()` (and/or whenever the session transitions to nil), after `auth.signOut()` clear
all in-memory domain collections (`transactions`, `cards`, `properties`, `rentalPayments`, `budgets`,
`people`, `households`), reset `currentHouseholdID = nil` and `bootstrappedAuthID = nil`.

**Rationale**: Today sign-out only calls `auth.signOut()`, leaving stale data in memory and a stale
`bootstrappedAuthID`, so re-sign-in as the same user skips re-bootstrap and shows stale/empty state. Web
tears down fully. Resetting `bootstrappedAuthID` guarantees the next session re-bootstraps.

**Alternatives**: Recreate `AppState` on sign-out — heavier (loses non-account prefs like appearance);
targeted teardown is sufficient and matches web.

## R4 — OTP code length (⚠ confirm against production before changing the gate)

**Decision**: Drive both clients' verify-gate length from a single per-client constant set to the **actual
production** OTP length, and reconcile the on-screen copy/placeholder to it. **The implement task MUST
confirm the production length before editing the gate**, because the evidence conflicts:
- `supabase/config.toml` (local dev stack) sets `otp_length = 6`.
- The user verifiably signs in on iOS today, whose Verify button is gated at **8** digits (input clamped to
  8) — which can only work if the production project issues ≥8-digit codes.

Resolution rule: set the canonical constant to whatever production issues. If production = 6, lower the iOS
gate/clamp/placeholder to 6 and align local config (already 6). If production = 8, raise web's gate to 8.
**Do not blindly "fix" iOS to 6**, which would clamp input below an 8-digit production code and break the
currently-working sign-in. Confirmation sources, in order: the Supabase dashboard Auth → Email setting, or
the length of an actual code the project emails. Until confirmed, preserve the working iOS behavior.

**Rationale**: This is the one item where a wrong guess breaks auth. The lived signal (iOS 8-gate works)
outweighs the local-only `config.toml`, but they must be reconciled, not assumed.

**Alternatives**: Hard-code 6 to match `config.toml` — rejected (risks breaking production sign-in). Accept
any length ≥6 — rejected (loses the symmetry the FR requires).

## R5 — platform_locks parity

**Decision**: Implement the iOS half to achieve true parity. Add a `PlatformLocksAPI`: on successful
bootstrap upsert a lock row `(user_id, platform='ios', locked_at=now)`; on sign-out delete the user's lock;
when reading, if an active lock for the *other* platform (`web`) exists, surface a calm "active on another
device" state and yield (mirror web's redirect/banner semantics).

**Rationale**: The "single active platform" guarantee is fully wired on web (upsert/delete + proxy redirect
+ banner) but absent on iOS, so the guarantee is dead cross-platform — a correctness gap, not cosmetic. The
spec/feature description explicitly chose "implement the iOS half" over removal.

**Alternatives**: Remove web's machinery — rejected by the feature description (keep the guarantee).
Defer — rejected; leaving it half-present is the divergence we're closing.

## R6 — Multi-owner income splits (iOS)

**Decision**: Remove the `kind == .expense` precondition from the iOS split editor's visibility
(`showsSplit`) so multi-owner income offers the same even/percent/value editor as expense, and persists the
entered shares. Fix the iOS caption to not imply expense-only.

**Rationale**: Web already splits income; iOS forces income to even, so the same income transaction stores
different per-owner cents per client — a silent data divergence. `computeShares` is already kind-agnostic;
only the UI gate differs.

**Alternatives**: Restrict web to expense-only + force even income — rejected (removes a working capability
and is the less useful behavior). Canonical = allow income splits on both.

## R7 — Custom-split edit/copy prefill (iOS, lossless)

**Decision**: When seeding the add/edit form from a stored transaction, detect whether the stored
`effectiveShares` differ from the even `computeShares` for the same owners/amount; if so, set
`splitMethod = .value` and seed the per-owner value fields from the **exact stored cents**. Even splits seed
`.even` as today. Mirror web's existing detection. Lock with a new `transaction-splits` edit-prefill vector.

**Rationale**: iOS currently leaves `splitMethod = .even` and seeds rounded whole-percent strings, so a
no-op re-save recomputes an even split and discards the custom cents — silent corruption. Web round-trips
losslessly by reopening custom splits as value with exact cents.

**Alternatives**: Seed `.percent` from exact percentages — rejected (percentages can't always represent
exact cents; value is lossless). Block editing of custom splits — rejected (unacceptable UX).

## R8 — iOS person rename/recolor

**Decision**: Add `AppState.setPersonColor(_:colorKey:)` mirroring `renamePerson` (optimistic local update
+ rollback on failure, persisting via `HouseholdsAPI.updatePerson`). Add an `onTap` to `UserRowView` in
`HouseholdView` that opens an edit sheet reusing `AddUserSheet`'s name field + color swatches, seeded from
the existing person, whose Save calls `renamePerson` and/or `setPersonColor`.

**Rationale**: `renamePerson` exists but is never called and `setPersonColor` doesn't exist, so a person's
name/color are fixed at creation on iOS — uncorrectable for the non-removable account holder. Web has the
full editor. Reusing `AddUserSheet` keeps the design consistent.

**Alternatives**: Inline rename in the row — rejected (no room for color; a detail sheet matches web).

## R9 — Wire the iOS XCTest parity target

**Decision**: Add a unit-test target to `Ortho-iOS.xcodeproj` (product type `com.apple.product-type.bundle.unit-test`,
TEST_HOST = the app), add the four `Ortho-iOSTests/*ParityTests.swift` to its Compile Sources, add the four
`shared/test-vectors/*.json` to its Copy Bundle Resources (the tests load vectors from the test bundle), and
add a test-action scheme so `xcodebuild test -scheme Ortho-iOS -destination 'platform=iOS Simulator,...'` runs.

**Rationale**: The tests and vectors exist but no target compiles them, so iOS parity is unenforced — the
root reason drift (insight IDs) went undetected. This makes the golden vectors actually gate iOS.

**Alternatives**: A standalone SPM test package — rejected (the tests reference app types; an in-project
TEST_HOST target is simplest and matches `xcodebuild`). Manual vector path via `#file` — rejected (bundle
resources are the portable, CI-safe way).

## R10 — Insight ID reconciliation

**Decision**: Rename iOS `InsightEngine` rule-ID prefixes to the canonical **web** scheme documented in
`shared/test-vectors/README.md` (e.g. `cashflow-deficit`, `cashflow-savings`), and drop the periodKey suffix
from the one outlier so IDs are input-deterministic and identical. Extend `web/scripts/gen-vectors.ts` to
exercise all insight rules so every rule's ID/output is vectored, then regenerate `insights.json`.

**Rationale**: 8 of 11 iOS IDs diverge from the web/vector contract, so once the iOS suite runs (R9) two of
three insight scenarios fail. Web's IDs are the named contract; align iOS to them. IDs are internal de-dup
keys (not user-visible), so renaming is safe.

**Alternatives**: Change web to iOS's IDs — rejected (web is the documented contract and is already
vector-asserted). Leave divergent + loosen the vector — rejected (defeats the harness).

## R11 — Web desktop reuse of shared components

**Decision**: Make `TransactionsDesktop`'s detail pane render the shared `TransactionDetailBody` (already
renders per-owner cents + percent) and have the desktop dashboard render the shared `SpendByCategoryCard` /
`PerOwnerBreakdownCard` / `InsightsCardStack` into its grid, replacing the trimmed re-implementations.

**Rationale**: The ≥1024px layouts are separate re-implementations that dropped per-owner amounts and
drill-down present on phone-web + iOS. Reusing the shared bodies restores capability and removes duplicate
code (a maintenance source of future drift). Constitution III: desktop is additive, not a rewrite — reusing
shared bodies inside the existing desktop chrome honors that.

**Alternatives**: Re-add the missing bits to the desktop variants — rejected (perpetuates duplication/drift).

## R12 — Web language → locale

**Decision**: Lift the language selection into `lib/store.tsx`, map each option to a BCP-47 locale
(`en-US`, `bn-BD`, `es-ES`, `ja-JP`, `zh-Hans`, `ko-KR`; "System" → `navigator.language`), persist it, and
drive the store's `locale` (consumed by `Intl`-based money/number/date formatters) from it so all consumers
re-render. Mirrors iOS's `@AppStorage("language")` → `.environment(\.locale)` + `Localizer`.

**Rationale**: `chooseLanguage` only writes `localStorage` and `locale` is hardcoded `'en-US'`, so the web
picker is inert. This delivers number/date/money localization parity with iOS.

**Alternatives**: Full UI-string translation now — out of scope (no web string-catalog layer exists); this
delivers formatting parity, with string translation a documented follow-on.

## Cross-cutting

- **New/changed golden vectors** (Principle VI): (a) `transaction-splits.json` gains income-split + custom-split
  edit-prefill cases; (b) `insights.json` regenerated to cover all rules with canonical IDs. Both suites assert them.
- **No schema migrations**: all tables already exist; only client behavior changes.
- **Determinism**: insight/date logic keeps injected reference dates; tests never hit the network.
