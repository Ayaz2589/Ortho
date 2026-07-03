# Research: Test-Build Feature Flags

Phase 0 decisions. Each resolves an open choice in the spec's Assumptions against the actual code
seams found during the pre-plan understanding pass. Format: Decision → Rationale → Alternatives
rejected.

## R1 — iOS test-build detection: `#if DEBUG` OR TestFlight sandbox receipt

**Decision**: `TestBuild.isTestBuild` returns `true` when compiled `#if DEBUG` **or** when the
running binary is a TestFlight build (`Bundle.main.appStoreReceiptURL?.lastPathComponent ==
"sandboxReceipt"`). In an App Store Release build it returns `false`. The flag *reads*
(`FeatureFlags`) are also compiled to constant-`false` in the non-test path so a value written on a
Debug/TestFlight install can never flip behavior in an App Store build.

**Rationale**: The user said "on test devices." A physical iPhone in the tester's hands runs a
**TestFlight** build (installing a raw Debug build requires a tethered Mac + provisioning). The
existing DEBUG-gated `-uiDemo`/Developer section is invisible on TestFlight because TestFlight is a
Release archive (confirmed: all targets `defaultConfigurationName = Release`, Release config defines
no `DEBUG`). So a DEBUG-only gate would *not* satisfy "test devices." Adding the sandbox-receipt
check makes the section appear on TestFlight test devices while the App Store receipt path keeps it
out of production. This is the one genuinely load-bearing choice; it is recorded as an overridable
Assumption in the spec.

**Alternatives rejected**:
- *DEBUG-only* — invisible on the exact devices the user tests on (TestFlight). Rejected.
- *Simulator check (`targetEnvironment(simulator)`)* — excludes real test devices. Rejected.
- *A hardcoded device-UUID allowlist* — brittle, needs maintenance, no precedent in the repo.
- *Always-on with a hidden gesture* — risks discovery/enablement in production. Rejected on safety.

## R2 — iOS test-data isolation: guard the network hop, don't swap the client

**Decision**: Add `AppState.testDataEnabled` (fed by `FeatureFlags`). In test-data mode, seed the
in-memory arrays with the refreshed sample dataset and **wrap the `Task { try await …API… }` server
hop in every optimistic mutator** (`addTransaction`, update/delete, cards, properties, budgets,
rental payments, people) in `if !testDataEnabled { … }`. Also early-return `loadAllFromServer` /
`loadXFromServer` and the DEBUG importers under the flag so a live read can't clobber the local set.

**Rationale**: The `@Observable` in-memory arrays are already the UI's single source of truth; the
server hop is a separable fire-and-forget side effect. Skipping it yields a fully working local
store with the smallest, most auditable change (~8–10 guards + read early-returns). It also *fixes a
latent bug*: `addTransaction`'s comment claims "in demo mode the server hop is skipped" but no such
guard exists today, so adding a transaction under `-uiDemo` currently RLS-fails and rolls itself
back. This decision makes that comment true.

**Alternatives rejected**:
- *Fake the `SupabaseClient`* — it is a concrete SDK type (`@ObservationIgnored let`), not a
  protocol; it cannot be substituted at the client level. Rejected as infeasible.
- *Introduce a `TransactionStore` protocol with live/in-memory impls* — cleaner separation but a
  much larger diff across every domain accessor, and the parity risk (must emit byte-identical
  `Transaction` values) is higher. Deferred as a possible future refactor; not needed for this
  feature.
- *A dedicated "test household" row* — still requires FK-valid, RLS-passing rows in the live tables
  and would sync to web. Violates the no-poisoning requirement. Rejected outright.

## R3 — web test-build detection: build-time env, dead-code-eliminable

**Decision**: `isTestBuild()` returns `true` when `process.env.NEXT_PUBLIC_VERCEL_ENV !==
'production'` (falling back to `process.env.NODE_ENV !== 'production'` when the Vercel var is
absent, e.g. local `next dev`/Vitest). The Developer section and every flag-honoring branch are
wrapped so that with the literal production comparison they **dead-code-eliminate** from the prod
bundle. Section *visibility* keys off this; flag *values* live in `localStorage`.

**Rationale**: `NEXT_PUBLIC_*` is inlined at build time and reaches both the client bundle and (via
`process.env`) the `proxy.ts` edge/server context — the only signal visible to *both* halves of the
web auth gate. `NODE_ENV` cleanly separates `next dev`/test from a production build for the
local-only case. Because the comparison is against a build-time constant, the prod build literally
does not contain the section or the honoring code.

**Alternatives rejected**:
- *localStorage-only gate* — invisible to `proxy.ts` (server-side, no `localStorage`); useless for
  auth-bypass. Rejected as insufficient alone (kept for flag *values*, not for gating).
- *Query-param toggle* — no precedent, and doesn't survive navigation cleanly. Not chosen.
- *Runtime hostname heuristic* — fragile (preview and prod can share domains); SSR-unsafe. Rejected.

## R4 — web test-data isolation: swap `createClient()` for an in-memory fake

**Decision**: When the test-data flag is on (test build only), `lib/supabase/client.ts`'s
`createClient()` returns an **in-memory Supabase-shaped fake** (`lib/testdata/memory-client.ts`,
adapted from `test/helpers/supabase-mock.ts` minus the `vitest` import) pre-seeded from
`lib/testdata/seed.ts` (Person-centric, adapted from `test/helpers/fixtures.ts`). Every store read
(`loadAll`), write (all optimistic mutators), and `auth.getUser`/`onAuthStateChange` route through
that one handle (`store.tsx:182`), so no live call is constructed. `proxy.ts` uses its own server
client, so bypass there is handled separately by R5.

**Rationale**: `store.tsx` already funnels 100% of data through a single `createClient()` handle —
this is exactly the seam the test suite swaps via `vi.mock`. Returning a fake from the factory
isolates all data with zero call-site changes. The blueprint (`SupabaseClientLike` surface + row
factories) already exists in `test/helpers/`; productionizing it (drop the `vitest` dep, ship under
`lib/`) is the smallest faithful path.

**Alternatives rejected**:
- *Bypass `runBootstrap` and set store state directly* — viable, but leaves the mutators writing to
  whatever `createClient()` returns; you'd still have to neuter each mutator's network half. Swapping
  the client covers reads *and* writes in one place. Chosen the client-swap as primary; the bootstrap
  branch (R5) still skips `getUser` under bypass.
- *Port the iOS `-uiDemo` seed verbatim* — it's User-centric/pre-Person; web `resolveUser` resolves
  owners against `people`, so old seeds render as "Removed". Must base the web seed on the current
  `fixtures.ts`. Rejected the verbatim port.

## R5 — web auth-bypass: both halves of the gate, via a cookie

**Decision**: The bypass flag sets a `ortho_bypass_auth=1` **cookie** (in addition to the
localStorage flag) because `proxy.ts` runs server-side and cannot read localStorage. `proxy.ts`
skips the `/sign-in` redirect when `isTestBuild()` **and** the cookie is present. In `store.tsx`,
`runBootstrap` skips `auth.getUser()` and seeds from the in-memory client under bypass, and the
`onAuthStateChange` `SIGNED_OUT` hard-redirect is neutered under bypass. Bypass implies test-data
(so there is data to show).

**Rationale**: The understanding pass confirmed the web gate has two independent halves — patching
only `proxy.ts` yields an authed shell over an empty store; patching only the store yields a redirect
loop. A cookie is the only signal a running (even production-built but non-prod-*env*) instance can
flip that also reaches the middleware. All of it is still wrapped in `isTestBuild()` so production
can't honor the cookie.

**Alternatives rejected**:
- *Synthesize a fake Supabase session* — far more invasive; RLS still rejects a forged token against
  the real project. In-memory data + skip-the-gate is simpler and safer.
- *NEXT_PUBLIC env var instead of cookie* — can't be toggled at runtime from Settings (needs a
  redeploy). The cookie lets the in-app toggle work; the env gate stays as the production kill-switch.

## R6 — Toggle semantics: clean re-init, no blended data

**Decision**: Toggling **Use test data** is a mode switch between two disjoint data sources. iOS
re-seeds the `AppState` collections (and, for the cleanest guarantee, may present a "relaunch to
apply" affordance since the seeded-vs-empty choice is made at `@main`); web re-runs bootstrap
(swapping the client). The app never mixes live and test rows in one session.

**Rationale**: Live and test rows carry different identity spaces (real UUIDs vs fixed sample UUIDs);
blending them would break FK/owner resolution and risk a stray live write. A hard mode switch keeps
the isolation guarantee simple to reason about and to test.

**Alternatives rejected**:
- *Live re-seed with no relaunch on iOS in all cases* — possible for the signed-in→test direction,
  but the auth-bypass (session-less) direction is decided above Settings at `@main`; a relaunch (or
  driving `authPhase` explicitly) is the robust path. Chosen a per-direction approach documented in
  quickstart.

## R7 — Refreshed sample dataset: Person-centric, payer-set, multi-month

**Decision**: Modernize the sample set on both surfaces to the current model. iOS: add
`Person.sample` (two people linked to the two sample users), retype `Transaction.sample` owners to
Person ids, set `paidBy`, add `Budget.sample` and `RentalPayment.sample`, and widen `makeSample`
dates to span ≥3 months. web: author `lib/testdata/seed.ts` from `test/helpers/fixtures.ts`
(already Person-centric with `owner_ids`+`shares`+timestamps). Keep the fixed sample UUIDs for
determinism; guarantee (by test) they never reach a live write.

**Rationale**: Directly fixes the user's "the dummy data model is outdated" observation and makes the
test experience faithful (non-empty balances, budgets, housing, month navigation). The web fixtures
are already correct, so web is mostly a productionization; iOS is where the real modernization lands.

**Alternatives rejected**:
- *Leave the sample as-is and only add flags* — would ship a half-broken test experience (empty
  balances/budgets/members). Rejected; the spec makes modernization a requirement (FR-009..012).

## R8 — Persistence & namespacing

**Decision**: iOS — `@AppStorage("ff_useTestData")` / `@AppStorage("ff_bypassAuth")`, read through a
`FeatureFlags` `@Observable` that returns constant `false` off test builds. web — a single
`localStorage` key `ortho.flags` (JSON) via `lib/flags.ts` (mirroring `appearance.ts`'s
read/write/apply trio), plus the `ortho_bypass_auth` cookie. Existing keys to avoid: iOS
`appearance`/`language`; web `appearance`/`currency`/`language`/`fxRates`/`fxRatesFetchedAt`/
`localUsers`.

**Rationale**: Reuses each surface's established preference pattern; the `ff_`/`ortho.flags`
namespacing prevents collisions; forcing `false` off test builds satisfies FR-003.

**Alternatives rejected**: per-flag localStorage keys (more sprawl than one JSON blob); iOS
`UserDefaults` model-level with `didSet` (heavier than `@AppStorage` for view-local toggles).

## R9 — Verification loop

**Decision**: Web is developed and verified locally with `cd web && npm test` (behavior-first).
iOS is verified through `.github/workflows/ios-ci.yml` on a draft PR (the Linux sandbox cannot build
iOS), watched with `GH_TOKEN=placeholder gh run watch --exit-status`. New iOS **test files** must be
added to the XCTest target in `project.pbxproj` (the target is not filesystem-synced); new non-test
Swift files under an existing group are picked up, but a NEW `Config/` group also needs a pbxproj
entry. The refreshed `-uiDemo` sample data will change the CI simulator screenshots — inspect the
artifact and treat the change as expected.

**Rationale**: Matches the repo's established iOS-via-CI loop and the pbxproj gotchas documented in
`docs/ios.md`. Batching Swift changes per push keeps CI cycles reasonable.

**Alternatives rejected**: attempting a local iOS build (impossible on Linux). N/A.
