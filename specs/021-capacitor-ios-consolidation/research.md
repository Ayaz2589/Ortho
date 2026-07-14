# Phase 0 Research: Capacitor iOS Consolidation

Source: an 11-agent deep-research workflow (4 codebase-discovery agents + 6 external-research
agents + 1 synthesis pass) run before `/speckit-specify`. Full synthesized report:
[research-report-full.md](./research-report-full.md) (copied into this feature's spec directory).
This file distills that report into the Decision / Rationale / Alternatives format Phase 0 expects,
resolving every unknown from the plan's Technical Context.

## Decision 1: Capacitor project location and package manager

**Decision**: Scaffold at `web/ios/App/` via `npx cap add ios`, using Capacitor 8's default Swift
Package Manager (SPM) integration — not CocoaPods.

**Rationale**: `cap init`/`cap add` must run from the directory containing `package.json` and the
built web assets, i.e. `web/`. SPM produces a plain `App.xcodeproj` (no `.xcworkspace`, no
synthesized Pods project), keeping the CI `xcodebuild` invocation shape close to the existing
`iOS/Ortho-iOS.xcodeproj` pattern already scripted in `ios-ci.yml`, and avoids a second
package-manager dependency in the repo.

**Alternatives considered**: CocoaPods (Capacitor's older default) — rejected: adds a Ruby/Pods
toolchain dependency for no benefit here, and mixing SPM/CocoaPods in one project is explicitly
discouraged. Placing the Capacitor project at the repo root (sibling to `iOS/`) — rejected: breaks
the CLI's requirement of running from the directory with `package.json`, and would blur the
frozen-vs-live boundary between the two Xcode projects.

## Decision 2: Static export + auth-gate migration

**Decision**: Set `output: 'export'` in `web/next.config.ts` (plus `images: { unoptimized: true }`).
Delete `web/proxy.ts` outright and delete the confirmed-dead `web/lib/supabase/server.ts`. Replace
`proxy.ts`'s three behaviors with client-side equivalents at the same call sites that already do
related work:
1. Signed-out → `/sign-in`: move into `app/(app)/layout.tsx`'s existing `AppStateProvider`
   bootstrap (`web/lib/store.tsx`'s `runBootstrap()`), which already calls `supabase.auth.getUser()`
   — add `router.replace('/sign-in')` on `!authUser`, short-circuited by the existing
   `isTestBuild() && readFlags().bypassAuth` check.
2. Signed-in → `/dashboard` from `/sign-in`: add a mount-time `getUser()` check + redirect to
   `app/sign-in/page.tsx` (already imports `useRouter`/`createClient`).
3. Root `/`: convert `app/page.tsx` from a Server Component `redirect()` to a small `'use client'`
   component calling `useRouter().replace('/dashboard')` on mount.

Delete `lib/flags.ts`'s `BYPASS_AUTH_COOKIE` mechanism (it existed only because middleware couldn't
read `localStorage`); read `readFlags().bypassAuth` directly once the gate is client-side.

**Rationale**: Next 16's own docs mark Proxy (the renamed `middleware.ts`) as unsupported under
`output: 'export'` — it will not execute at all once static export ships, so leaving it in place is
dead code, not a safety net. Codebase discovery confirmed zero Route Handlers, zero Server Actions,
zero dynamic segments, and zero `next/image` usage — `proxy.ts` is the *only* real blocker; every
other page is already `'use client'` and already does data access through the browser Supabase
client. `web/lib/supabase/server.ts` is unused by grep today (only `proxy.ts` had its own inline
server-client construction), so deleting it is a no-op cleanup, not a migration project.

**Alternatives considered**: Keep a real Next.js server running behind the Capacitor WebView (point
`server.url` at a deployed origin) — rejected: this is also the single highest-risk historical App
Store Guideline 4.2 rejection trigger ("reads as just a website"), and static export is
straightforward here since there's no genuine server-only logic to preserve. Convert `app/page.tsx`'s
Server Component redirect to rely on Next's build-time meta-refresh (technically still supported
under static export) — rejected in favor of an explicit client redirect for consistency with the
rest of the now-fully-client app, and because it needs the same signed-in check as everywhere else
once the gate is client-side.

## Decision 3: Session persistence

**Decision**: Persist the Supabase session via a Keychain-backed secure-storage Capacitor plugin
(`@aparajita/capacitor-secure-storage`), wired into `supabase-js`'s `auth.storage` option (native
only — `Capacitor.isNativePlatform() ? keychainStorageAdapter : undefined`, falling through to the
existing cookie/localStorage path on desktop web).

**Rationale**: `supabase-js` accepts any `{getItem, setItem, removeItem}` object as `auth.storage` —
a documented mechanism for non-browser runtimes. WKWebView's own site-data storage is
"best-effort" (WebKit's own storage-policy docs; can be evicted under disk pressure or cleared
across WebKit versions), an durability gap the native Swift app never had (Keychain-backed via the
SDK). `@capacitor/preferences` was explicitly rejected as the storage target: it's an unencrypted
UserDefaults wrapper included in default device backups, and Capacitor's own docs steer sensitive
data away from it. Codebase discovery additionally surfaced that today's web `onAuthStateChange`
listener only reacts to `SIGNED_OUT`, not proactive idle-tab revalidation (a pre-existing,
documented gap vs. iOS-native's app-lifetime `authStateChanges` subscription) — closing this
specifically for the Capacitor build via an `@capacitor/app` `appStateChange` listener
(`isActive && supabase.auth.getSession()`) is in scope for FR-003 ("at least as reliably as the
current native app").

**Alternatives considered**: Bare `localStorage`/WKWebView storage — rejected per the durability gap
above. `@capacitor/preferences` — rejected, unencrypted + backed up. A custom native Keychain plugin
written in-house instead of a community package — rejected as unnecessary scope; the community
plugin is actively maintained and this is a well-solved problem.

## Decision 4: Scan feature split — native plugin vs. shared TypeScript

**Decision**: One custom Swift Capacitor plugin (`web/ios/App/App/Plugins/Scan/`) owns exactly the
capabilities with no browser equivalent: AVFoundation camera capture with live-OCR-gated shutter,
Vision OCR (`RecognizeDocumentsRequest` iOS 26+ / `VNRecognizeTextRequest` classic fallback), PDFKit
extraction (both digital-text-layer and scanned/render-then-OCR branches, kept together in one
pipeline), and the optional FoundationModels refiner (`refineMerchant`/`rescue`, iOS 26+ only, called
from TS after the deterministic parser runs). Everything else — `ScanHeuristics` (merchant/amount/
date parsing, statement-row reconstruction, category rules), `ScanParser` (receipt-vs-statement
tiered decision), `ScanInference` (duplicate/category inference against transaction history), and
the `ScanSession` UI state machine — ports to TypeScript under `web/lib/scan/` and
`web/components/scan/`.

**Rationale**: Codebase discovery marked every native-only capability `portableToJS: false` (no
browser API matches Vision's OCR/table-detection accuracy) and both `ScanHeuristics`/`ScanParser`
(`portableToJS: true`) with file-header comments in the Swift source itself already documenting them
as a near-verbatim port target of `web/scripts/import/engine/{dates,categorize,exclusions}.ts` — i.e.
this repo already has the TS conventions these functions were written to mirror. `ScanInference` is
*more* correct in TS than Swift, since transaction/merchant history already lives in
`web/lib/store.tsx` on the web side — keeping it native would mean marshaling that data across the
JS↔Swift bridge for no reason. This split directly serves the migration's core goal (eliminate the
TS/Swift drift-bug class) for this feature's own logic, not just the rest of the app.

**Alternatives considered**: Keep the entire scan pipeline (including parsing/heuristics) inside the
Swift plugin, treating it as a black box returning only final `ParsedCandidate`s — rejected: this
would preserve exactly the kind of hidden-Swift-only-logic this whole migration exists to eliminate,
and would leave `ScanInference`'s duplicate-detection unable to see web-side transaction history
without an awkward data round-trip into the plugin. Reimplement OCR itself in JS (e.g. Tesseract.js)
to avoid a native plugin entirely — rejected: a confirmed functional downgrade from Vision's
accuracy/table detection, and would abandon the "equivalent accuracy" requirement in FR-009.

## Decision 5: JS ↔ Swift plugin interface

**Decision**: A small `ScanPlugin` surface (`capture`, `extractPDF`, `refineMerchant`, `rescue`,
`checkPermissions`, `requestPermissions`), all consuming/returning one `ScanDocumentText` JSON
contract (`{ pages: [{ lines: [{text, frame}], tables: [{rows}] }] }`, top-left-origin, normalized
0–1 frames) — identical in shape to today's `ScanModels.swift` contract, so the ported TS parser
needs zero input-shape changes versus what `ScanParserTests.swift` already exercises. Binary image
data is never base64-encoded through `call.resolve()`; the plugin writes to
`FileManager.temporaryDirectory` and returns a `file://` path, converted to a loadable URL via
`Capacitor.convertFileSrc(uri)`. `capture()` returns both the image URI (for the review UI's photo
preview) and the already-extracted `ScanDocumentText.Page` in the same call, since OCR already ran
natively during capture.

**Rationale**: Preserving the exact `ScanModels.swift` output shape means the ported TS parser's
test suite (Decision 6) can reuse frozen fixture JSON without any adapter layer. Avoiding
base64-through-`resolve()` avoids a documented ~37% size overhead and measurable JS-thread cost for
full-resolution deskewed images.

**Alternatives considered**: `call.keepAlive` streaming for the multi-photo statement flow —
rejected in favor of `notifyListeners('pageCaptured', ...)` fired once per photo during a persistent
capture session, since a scan session is closer to N discrete captures than a true single-subscription
stream (e.g. `watchPosition`). Full contract detail: `contracts/scan-plugin-api.md`.

## Decision 6: Scan test-fixture migration

**Decision**: Do a one-time capture (via the still-intact `ScanTextExtractor.swift`, on a macOS
runner, before/alongside the plugin port) of each of the 13 existing fixtures'
`ScanDocumentText` JSON, check those into `shared/scan-fixtures/` as frozen OCR inputs, and port
`ScanParserTests.swift`'s fixture assertions into a new `web/test/scan/` Vitest suite running the
ported TS parser against those frozen inputs. The ~dozen pure `ScanHeuristics` unit tests (no
Vision/PDFKit dependency — literal strings/dates) transliterate directly to Vitest, no fixture
capture needed.

**Rationale**: Vision/PDFKit only run on Apple platforms (confirmed: this Linux sandbox, and any
non-macOS CI runner, cannot execute them) — the fixtures cannot be re-OCR'd from a TS test. This
mirrors the project's existing golden-vector methodology exactly, but is now a
regression/pinning suite (one implementation, not two to keep honest) per the constitution's
amended Principle VI.

**Alternatives considered**: Skip fixture migration and write only new TS-native test cases —
rejected: would silently drop FR-009's "at least as accurate as today" requirement, since the
existing fixtures encode real hard cases (e.g. `unreadable.png`, `receipt-no-total.png`) with no
guarantee new ad-hoc cases cover the same ground.

## Decision 7: Native-feel plugin matrix

**Decision**: `@capacitor/camera` (photo capture/library), `@capawesome/capacitor-file-picker`
(Files-app PDF picking — `@capacitor/camera` alone cannot reach Files/iCloud Drive),
`@capacitor/haptics`, `@aparajita/capacitor-biometric-auth` (Face ID/Touch ID — no official plugin
exists), `@aparajita/capacitor-secure-storage` (Keychain, see Decision 3), `@capacitor/status-bar`,
`@capacitor/keyboard` (`resize: 'body'`), `@capacitor/share`, `@capacitor/splash-screen` +
`@capacitor/assets` (dev-only icon/splash generation). `capacitor.config.ts` sets
`server.iosScheme: 'https'` so the production origin is `https://localhost` (CORS-allow-listable in
Supabase) instead of the default `capacitor://localhost`, which Supabase's CORS validator would
reject.

**Rationale**: Full capability→package rationale and iOS-specific Info.plist/entitlement setup is in
the research report §3. `@capacitor/push-notifications` and `@capacitor/app` deep-link handling are
available but deliberately **not** wired up (Decision 10).

**Alternatives considered**: `@capgo/capacitor-native-biometric` as the biometrics package —
considered equally valid; `@aparajita/capacitor-biometric-auth` chosen per the research pass with no
strong differentiator either way; revisit only if it proves unmaintained at implementation time.

## Decision 8: CI restructuring

**Decision**: New `.github/workflows/capacitor-ios-ci.yml`: `npm ci` → `next build` (static export)
→ `npx cap sync ios` → `xcodebuild build` (not `test`) against `web/ios/App/App.xcodeproj`. Narrow
`.github/workflows/ios-ci.yml` to `workflow_dispatch`-only triggers and drop its `xcodebuild test`
step down to `xcodebuild build` only.

**Rationale**: Confirmed via the GitHub API that `main` has zero branch-protection rules — today's
"enforcement" is detection/visibility only, not a merge gate, so this is not a hard blocker either
way, but leaving `ios-ci.yml` running its 11 XCTest parity suites on every push/PR would produce
permanent, misleading red the instant any vectored TS function next changes, since nobody will
update the frozen Swift mirrors. A manual "does the frozen app still compile" smoke check preserves
real value (catching silent bit-rot) without asserting parity it can no longer track. Most testable
logic (Decision 4/6) is moving to TypeScript anyway, so `build`-only for the new Capacitor project
plus the ported Vitest suite (in the existing `web-ci.yml`) covers the bulk of real coverage.

**Alternatives considered**: Delete `ios-ci.yml` outright — rejected: a manual compile check has
nonzero value if the frozen app is ever revisited (e.g. an emergency rollback per FR-021), and
narrowing triggers is a smaller, more reversible diff than deleting the workflow file. Run
`xcodebuild test` on the new Capacitor project immediately — deferred: no Swift unit tests exist yet
for the new plugin (only the Vitest port of the parser logic); revisit once the plugin has its own
test surface (open item, see spec Edge Cases / research report §10 item 9).

## Decision 9: Golden-vector / PARITY.md retirement

**Decision**: Keep `shared/test-vectors/` + `web/scripts/gen-vectors.ts` + the 11
`web/test/*.parity.test.ts` suites as-is, mechanically, reframed from "cross-language lock" to
"single-implementation regression suite" (per the amended constitution). **Delete**
`web/test/i18n/catalog-parity.test.ts` outright — it `readFileSync`s
`iOS/Ortho-iOS/Localizable.xcstrings` directly and will start failing (or silently pass on stale
coverage) the moment that frozen file stops being hand-updated; there is no replacement needed since
Capacitor serves `web/lib/i18n/*` directly. Archive the current `PARITY.md` to
`docs/archive/PARITY-2026-07-08.md` and rewrite the live `PARITY.md` as a leaner
web(+Capacitor iOS)-vs-CLI matrix, rewriting its scan-feature paragraph specifically (today it says
scanning is "iOS only... not a product-surface divergence" — becomes wrong the moment it's a
Capacitor plugin invoked from React). Sweep `docs/index.md`, `docs/ios.md`, `docs/web.md`,
`docs/shared.md`, `README.md`, `CLAUDE.md` to describe the single-implementation reality; re-scope
`docs/ios.md` to "read only when touching the frozen legacy app or the scan plugin's original Swift
source."

**Rationale**: The golden-vector harness's entire premise — two live implementations kept honest
against each other — stops being true the moment nobody updates the Swift mirrors, but the fixture
files themselves are cheap, already-working infrastructure that still catches accidental TS behavior
changes even with one language present; deleting them would lose real regression coverage for no
benefit. Codebase discovery enumerated every file referencing the parity system (research.md source
report §6 / discovery pass 4) — this decision addresses each deliberately rather than leaving stale
references.

**Alternatives considered**: Delete `shared/test-vectors/`, `gen-vectors.ts`, and inline expected
values directly into the Vitest files, removing the generator indirection entirely — rejected as
unnecessary churn; the generator mechanism has no dependency on there being two languages and
remains the simplest way to keep TS-derived fixtures in sync with the TS logic that produces them.

## Decision 10: Explicit non-goals for this feature

**Decision**: Do not build push notifications (`@capacitor/push-notifications`), deep/universal link
handling (`@capacitor/app`'s `appUrlOpen`), or an Android build as part of this feature.

**Rationale**: Codebase discovery found no server-side notification-sending infrastructure and no
current product requirement for either — building entitlements/APNs plumbing or an
`apple-app-site-association`-hosting requirement speculatively would be scope creep against FR-019.
Android is structurally cheap to add later (same web bundle, same plugin API surface) but reintroduces
a second, separately-budgeted round of every native-feel bug class in a differently-fragmented
WebView environment — explicitly sequenced as a future milestone, not parallelized with this
migration.

**Alternatives considered**: Build push notifications now since the plugin matrix already names it —
rejected per FR-019 and the absence of any driving requirement.

## Decision 11: Rollout sequencing

**Decision**: Four phases — (0) land static export + Capacitor scaffold + the *entire* native-feel UX
pass + auth/session migration + at minimum the camera-capture half of the scan plugin, as one bundle,
pre-TestFlight; (1) internal TestFlight dark-launched alongside the still-live native app; (2)
external TestFlight gated on an explicit, fully-checked native-feel bar; (3) public submission only
once that bar is met, keeping the frozen native app's compile capability as an explicit rollback path
until the new build proves stable in production. Android (Decision 10) is an out-of-scope Phase 4.

**Rationale**: Bundling the full native-feel pass into Phase 0 rather than trickling it in is the
best available insurance against an App Store Guideline 4.2 rejection, whose documented triggers are
exactly the visible tells (content under the notch, keyboard covering inputs) a trickled rollout risks
shipping to reviewers first. Internal TestFlight requires no App Review and is available immediately,
making it the right place to catch real-device-only bugs (keyboard/bounce issues are repeatedly
reported as reproducing only on physical hardware, not Simulator).

**Alternatives considered**: Submit directly to public review after internal-only testing —
rejected: skips the explicit UX bar this feature's success criteria (SC-004, SC-005) depend on.

---

**Report provenance note**: [research-report-full.md](./research-report-full.md) and the raw
per-agent codebase-discovery/external-research JSON this file distills were produced by a workflow
run (`wf_7662a9e1-e60`) prior to `/speckit-specify`. Key file-level facts cited above (exact line
numbers, confirmed-dead-code greps, GitHub API branch-protection checks) come from that report's
codebase discovery pass and are treated as verified as of 2026-07-08 — reverify anything load-bearing
that depends on the live GitHub/Supabase state if significant time has passed before implementation.
