# Ortho iOS Delivery Migration: Native SwiftUI → Capacitor-Wrapped Next.js Web App

**Research report for spec input.** Synthesizes codebase discovery (scan pipeline, static-export blockers, auth/session mechanics, golden-vector parity system) with external research (Capacitor 8.4.1 architecture, plugin ecosystem, Swift plugin patterns, Next.js 16.2.9 static-export support, App Store review risk, WKWebView UX pitfalls). Current versions as of this research (2026-07-08): Capacitor 8.4.1 stable (9 in alpha), Next.js 16.2.9.

---

## 1. Executive summary

**Recommended approach:** Ship iOS from the existing Next.js/React web codebase, statically exported (`output: 'export'`) and wrapped in Capacitor 8, using Swift Package Manager as the native package manager. Keep the on-device receipt/statement scanning capability as one custom Capacitor Swift plugin (AVFoundation capture + Vision OCR + PDFKit, unchanged from today's implementation) while porting the pure parsing/heuristics logic (`ScanHeuristics`/`ScanParser`/`ScanInference`) to TypeScript, joining the golden-vector-style regression system. Replace `web/proxy.ts`'s server-side auth gate with client-side guards (the app is already ~100% `'use client'`), and replace browser-cookie session storage with a Keychain-backed secure-storage adapter for `supabase-js`. Freeze `iOS/Ortho-iOS/` in place (already decided) and demote its CI from a required parity gate to a manual/best-effort smoke build. This is a technically low-risk, well-trodden path — every individual server-side and native capability in this app has a documented, concrete client-side or plugin equivalent; there is no hard blocker.

**Single biggest execution risk:** not technical feasibility but **perceived native-ness** — whether the wrapped web app feels like a native iOS app rather than "a website in a box." This shows up in two connected ways: (a) genuine UX polish (safe-area insets, keyboard resize behavior, scroll bounce, status-bar theming, tap responsiveness — none of which the web codebase has ever had to handle) needs deliberate, budgeted engineering, not an afterthought; and (b) Apple App Store Guideline 4.2 ("Minimum Functionality") rejections are explicitly triggered by exactly this class of visible tell (content under the notch, keyboard covering inputs, browser-style page transitions), independent of how many native plugins are technically wired up. Every other risk in this migration (auth, session persistence, scan feature parity, golden-vector retirement) has a clean mechanical answer; this one requires sustained design/QA investment and should be gated explicitly before any App Store submission, not treated as a rounding error on top of "get it building."

---

## 2. Capacitor setup plan

### 2.1 Where the Capacitor project lives

Capacitor's CLI (`cap init`, `cap add ios`, `cap sync`) must run from the directory containing `package.json` and the built web assets — that's `web/`. The generated native project should therefore live at **`web/ios/App/`**, kept structurally and namespace-distinct from the frozen `iOS/Ortho-iOS/` (top-level `iOS/` directory, native SwiftUI app, unmaintained). Do not attempt to merge or relocate — they are two independent Xcode projects that happen to coexist in one repo during the transition. Add `web/ios/App/build/`, `web/ios/App/Pods/` (only if CocoaPods is ever chosen), and Xcode user-state files to `.gitignore`; **do** commit `web/ios/App/App.xcodeproj`, `Info.plist`, the storyboard/asset catalog, and any hand-written Swift plugin source, exactly as `iOS/Ortho-iOS.xcodeproj` is committed today.

### 2.2 Scaffolding steps

```bash
cd web
npm i @capacitor/core
npm i -D @capacitor/cli
npx cap init Ortho com.ortho.app --web-dir out   # appId TBD — see §10
npm i @capacitor/ios
npx cap add ios                                   # SPM package manager (Capacitor 8 default) — do not pass --packagemanager Cocoapods
```

Capacitor 8's default for **new** `cap add ios` scaffolds is Swift Package Manager, not CocoaPods — keep this default deliberately. It produces a plain `App.xcodeproj` (no `.xcworkspace`, no synthesized Pods project), which is both simpler to reason about and keeps the CI `xcodebuild` invocation shape close to the existing `iOS/Ortho-iOS.xcodeproj` pattern already scripted in `ios-ci.yml`. Do not mix SPM and CocoaPods in one project — pick SPM once and stay on it; if a future plugin is CocoaPods-only, that is the moment to revisit, not preemptively.

### 2.3 `next.config.ts` changes for static export

```ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'export',
  images: { unoptimized: true },   // next/image is unused today but this
                                    // is required the instant output:'export'
                                    // is set, and is the cheapest safe default
  trailingSlash: true,             // route/index.html folders — needed for
                                    // predictable resolution when served by
                                    // Capacitor's static asset layer, not a
                                    // real HTTP server (verify against
                                    // Capacitor's default WKWebView asset
                                    // server behavior before locking this in)
}
export default nextConfig
```

Confirmed via Next 16.2.9's own bundled docs (`node_modules/next/dist/docs/...`): this repo has zero Route Handlers, zero Server Actions, zero dynamic `[param]` segments, and zero `next/image` usage today — none of the classic static-export blocker categories apply except one: `web/proxy.ts`. Next's own "Platform support" table marks Proxy (the v16 rename of `middleware.ts`) as unsupported (`Static export = No`); under `output: 'export'` it simply never executes. See §5 for the replacement.

`package.json`'s `"start": "next start"` script becomes meaningless once `output:'export'` ships (no Node server exists) — remove it or repoint at `npx serve out` for local static-preview needs.

### 2.4 Build/CI pipeline

**Local/dev loop:**
```
next build (out/) → npx cap sync ios → npx cap open ios  (or npx cap run ios --live-reload for hot iteration)
```
Never ship `server.url`/`server.cleartext` in committed production config — dev-only, set transiently via `cap run --live-reload --host <lan-ip>`.

**CI (new workflow, e.g. `.github/workflows/capacitor-ios-ci.yml`, replacing today's single-stage `ios-ci.yml` job):**
```
npm ci (web/)
next build                                    # static export → web/out/
npx cap sync ios                              # copies out/ into web/ios/App/App/public, resolves SPM deps
xcodebuild build -project web/ios/App/App.xcodeproj -scheme App \
  -destination "id=$UDID" ...
```
This is a three-stage pipeline replacing today's single `xcodebuild test -project iOS/Ortho-iOS.xcodeproj -scheme Ortho-iOS ...` step. Whether to run `xcodebuild test` (once the scan-plugin Swift unit tests and any plugin-contract tests exist) or just `build` (smoke-compile) is a scope decision for the spec — recommend starting with `build` plus the ported TS scan-parser tests running in the existing `web-ci.yml` Vitest job, since the bulk of testable logic is moving to TypeScript (§4). Keep the existing `-uiDemo`-style simulator-screenshot artifact pattern if there's an equivalent app-level test-data mode reachable in the web app (there should be, since `lib/flags.ts` already has a test-build bypass mechanism) — this is valuable, cheap CI visibility and shouldn't be dropped just because the app changed delivery mechanisms.

Signing/TestFlight: `npx cap build ios` (Capacitor 7.0+) wraps `xcodebuild archive` + `exportArchive` via `ios.buildOptions.{signingStyle,exportMethod,signingCertificate,provisioningProfile}` in `capacitor.config.ts` — prefer this over hand-rolled archive/export scripting for the release pipeline, and update the gitignored `CI-SETUP.local.md` deploy-workflow doc accordingly once this lands.

### 2.5 `capacitor.config.ts` key settings

```ts
const config: CapacitorConfig = {
  appId: 'com.ortho.app',        // MUST match existing App Store Connect bundle
                                  // ID if continuing the same listing — confirm
                                  // against iOS/Ortho-iOS's actual bundle ID
                                  // before finalizing (see §10)
  appName: 'Ortho',
  webDir: 'out',
  ios: {
    contentInset: 'never',       // paired with viewport-fit=cover + CSS env() padding, see §7
    scheme: 'App',
    preferredContentMode: 'mobile',
  },
  server: {
    iosScheme: 'https',          // production origin becomes https://localhost —
                                  // allow-listable in Supabase's CORS settings,
                                  // unlike the default capacitor://localhost
  },
}
```
`server.iosScheme: 'https'` is the one non-default setting worth calling out explicitly: Supabase's CORS-origin validator (like most) rejects non-`http(s)` schemes, so the default `capacitor://localhost` production origin would silently break every Supabase API call unless CORS is loosened broadly. Setting this and adding `https://localhost` to Supabase's allowed origins is the documented, narrow fix.

---

## 3. Plugin matrix

All packages are current for Capacitor 8.x. "Official" = published under `@capacitor/*` by the Ionic team; others are actively-maintained community packages, called out because Capacitor has no first-party option for that capability.

| Capability | Package | Official? | Why | iOS setup needed |
|---|---|---|---|---|
| Camera capture / photo library | `@capacitor/camera` | Yes | `getPhoto()`/`pickImages()` for receipt photos; does NOT cover Files-app PDF picking | `NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription`, `NSPhotoLibraryAddUsageDescription` in Info.plist |
| Document/PDF picker (Files app, iCloud Drive) | `@capawesome/capacitor-file-picker` | No (community, ~60k weekly dl) | `@capacitor/camera` only ever shows the Photos picker, never Files app — needed for statement PDF import | No entitlement required for local/Files-app access |
| Push notifications | `@capacitor/push-notifications` | Yes | APNs registration + receipt/tap handling | Xcode "Push Notifications" capability (entitlements file) + "Background Modes → Remote notifications"; APNs `.p8` auth key from Apple Developer portal |
| Local notifications | `@capacitor/local-notifications` | Yes | On-device reminders (rent-due, bill reminders) with no server | No entitlement; request permission at runtime |
| Biometric unlock (Face ID) | `@aparajita/capacitor-biometric-auth` **or** `@capgo/capacitor-native-biometric` | No — **no official plugin exists** | Wraps `LocalAuthentication`; gate access to the Keychain-stored Supabase session | `NSFaceIDUsageDescription` in Info.plist (App Store rejects without it); no capability toggle needed |
| Haptics | `@capacitor/haptics` | Yes | Impact/notification/selection Taptic feedback — cheap, explicitly named in research as a native-feel differentiator | None |
| Secure session storage | `@aparajita/capacitor-secure-storage` | No (actively maintained; alt: Capawesome `capacitor-secure-preferences`) | Keychain-backed `getItem/setItem/removeItem`, backs a `supabase-js` custom `auth.storage` adapter — **never** `@capacitor/preferences` (unencrypted UserDefaults, included in device backups) and never bare localStorage/WKWebView storage (best-effort, evictable) | No entitlement for app-private Keychain access; choose `kSecAttrAccessible*ThisDeviceOnly` if reinstall-clears-session is desired |
| Status bar theming | `@capacitor/status-bar` | Yes | Light/dark style + background color matched to Ortho's existing theme tokens | `UIViewControllerBasedStatusBarAppearance = YES` in Info.plist, or `setStyle()` silently no-ops |
| Keyboard resize behavior | `@capacitor/keyboard` | Yes | Controls whether/how the WebView resizes when the keyboard opens; default `native` mode breaks `100vh` layouts | Configure `resize: 'body'` in `capacitor.config`; no Info.plist keys |
| Share sheet | `@capacitor/share` | Yes | Native `UIActivityViewController` for CSV/PDF export; falls back to `navigator.share` on desktop web transparently | None |
| Deep links / Universal Links | `@capacitor/app` | Yes | `appUrlOpen` listener hands URLs to the existing Next.js client router | Associated Domains capability + `applinks:` entitlement, `apple-app-site-association` hosted at `/.well-known/` on the app's domain |
| Filesystem | `@capacitor/filesystem` | Yes | Materializes scanned/fetched PDFs to a real `file://` URI for Share/file-picker handoff | `UIFileSharingEnabled` + `LSSupportsOpeningDocumentsInPlace` in Info.plist if files should surface in the iOS Files app; PrivacyInfo.xcprivacy manifest required for recent SDK targets |
| In-app browser (external link-outs) | `@capacitor/browser` | Yes | `SFSafariViewController`-backed, shares cookies/session with system Safari — right choice for e.g. a Stripe billing portal handoff | None |
| Splash screen | `@capacitor/splash-screen` + `@capacitor/assets` (dev tool) | Yes | Native launch screen held via `launchAutoHide:false` until first meaningful paint; `@capacitor/assets generate --ios` produces all required sizes from one 1024×1024 + one ≥2732×2732 source | Native Storyboard-based; generate a `splash-dark.png` variant given Ortho's light/dark theme tokens |
| Receipt/statement scanning | **Custom in-house Swift plugin** | N/A | See §4 in full | See §4 |

---

## 4. Scan feature migration plan (the critical native capability)

### 4.1 Split: what stays native vs. what moves to TypeScript

**Stays in the custom Swift Capacitor plugin (`web/ios/App/App/Plugins/Scan/`, "Custom Native iOS Code" pattern — plain Swift files added to the app target, no separate SPM package needed since this plugin is app-private):**
- AVFoundation camera capture with live-OCR-gated shutter (the ~3fps `VNRecognizeTextRequest.fast` readiness hysteresis) and `CIPerspectiveCorrection` deskew — no browser equivalent exists, must stay native, port verbatim from `ScanCaptureView.swift` including the `cgOrientation(for:)` portrait-handling logic.
- Image preprocessing (downscale to 2200px long edge, orientation bake-in) — kept colocated since Vision OCR consumes it immediately after; not worth a parallel JS Canvas implementation.
- Vision OCR (`RecognizeDocumentsRequest` iOS 26+ structured path, `VNRecognizeTextRequest` classic clustered fallback) — the core reason this can't be a pure web reimplementation; no browser OCR API matches Vision's accuracy/table detection.
- PDFKit extraction, **both branches kept together** (digital-text-layer via `page.string`, and scanned/no-text-layer via render-to-image-then-OCR) — even though the text-layer branch is conceptually portable to `pdf.js`, splitting it out would create two extraction pipelines to keep in sync for no real benefit; one native pipeline covering all PDF input is simpler.
- The optional FoundationModels on-device refiner (`ScanRefiner.swift` — merchant polish + last-chance rescue parse), exposed as separate opt-in plugin methods (`refineMerchant`, `rescue`), gated on `SystemLanguageModel.default.availability == .available` (iOS 26+ only), called from TS **after** the deterministic parser already ran. **This needs an explicit product decision, not a silent default** — see §10.

**Moves to TypeScript (`web/lib/scan/`, alongside the existing `web/scripts/import/engine/{dates,categorize,exclusions}.ts` it already mirrors — the file-header comments in `ScanHeuristics.swift` already document this as a near-verbatim port target):**
- `ScanHeuristics` (merchant cleanup, amount/currency/date parsing incl. month-name forms, statement-row and stacked-app-list reconstruction, grand-total detection, category rule table, payment-row detection) — pure regex/string functions, zero Apple-API dependency.
- `ScanParser` (tiered receipt-vs-statement decision: ≥3 one-line rows → statement; ≥3 stacked app-list rows → statement; confident labeled total → receipt; 1–2 rows → statement; forgiving fallback → receipt; else none).
- `ScanInference` (duplicate-claiming against existing transactions, category inference from merchant history + rule table) — this one is *more* correct in TS than it was in Swift, since transaction/merchant history already lives in `web/lib/store.tsx` on the web side; keeping it native would have meant marshaling that data across the JS↔Swift bridge for no reason.
- The `ScanSession` UI state machine (Phase transitions: idle → parsing → receiptPrefilled | interstitial → reviewing → summary | failed; disposition tracking; pre-skip rules for payment rows and toggle-controlled duplicates) — pure product logic, reimplement as a React reducer mirroring the Swift enum 1:1. Not a golden-vector concern, but replicate the exact behavior (phase shape, pre-skip rules, "zero-count segments omitted" summary rule) since it encodes product-approved UX, not something to redesign.

### 4.2 JS↔Swift call interface

Net effect: the plugin's JS-facing surface shrinks to a handful of methods, all returning/consuming one `ScanDocumentText` JSON contract (`{ pages: [{ lines: [{text, frame}], tables: [{rows}] }] }`, top-left-origin, normalized 0–1 frames — identical shape to today's `ScanModels.swift` contract, so the ported TS parser needs zero changes to its input shape versus what `ScanParserTests.swift` already exercises):

```ts
export interface ScanPlugin {
  capture(): Promise<{ imageUri: string; page: ScanDocumentTextPage }>;
  extractPDF(opts: { fileUri: string }): Promise<{ pages: ScanDocumentTextPage[] }>;
  refineMerchant(opts: { merchant: string }): Promise<{ merchant: string; category?: string } | null>; // optional, iOS 26+ only
  rescue(opts: { page: ScanDocumentTextPage }): Promise<ParsedCandidateGuess | null>;                  // optional, iOS 26+ only
  checkPermissions(): Promise<{ camera: PermissionState }>;
  requestPermissions(): Promise<{ camera: PermissionState }>;
}
```

Swift side: modern `@CapacitorPlugin(name: "Scan", permissions: [...])` annotation subclassing `CAPPlugin`, `@objc func capture(_ call: CAPPluginCall)` reading via `call.getString/getObject`, responding via `call.resolve([String: Any])`. **Binary handling matters**: never base64-encode a full-resolution deskewed image through `resolve()` (37% size overhead, measurable JS-thread cost); write to `FileManager.temporaryDirectory` and return a `file://` path, which JS converts to a loadable URL via `Capacitor.convertFileSrc(uri)`. Have `capture()` return **both** the image URI (for the review UI's photo preview) and the already-extracted `ScanDocumentText.Page` JSON in the same call — OCR already happened natively during capture, don't make TS issue a second round-trip. For the multi-photo statement flow, prefer `notifyListeners('pageCaptured', data)` fired once per photo during a persistent capture session over Capacitor's `call.keepAlive` pattern (reserved for true single-subscription streams like `watchPosition`) — a scan session is closer to N discrete captures.

### 4.3 Test fixture migration

Vision/PDFKit only run on Apple platforms (confirmed: this Linux sandbox, and any CI runner without macOS, cannot execute them), so the 13 existing fixtures in `iOS/Ortho-iOS/Resources/ScanFixtures/` cannot be re-OCR'd from a TS test. The correct migration: **do a one-time macOS/CI capture** of each fixture's `ScanDocumentText` JSON via the new Swift plugin (or the still-frozen `ScanTextExtractor.swift` directly, before it's retired), check those JSON blobs into `shared/test-vectors/` (or a new `shared/scan-fixtures/` directory) as frozen **OCR inputs**, then port `ScanParserTests.swift`'s `assertFixture` assertions into a new Vitest suite running the ported TS parser against those frozen inputs. This mirrors the project's existing golden-vector methodology exactly, but is now a **regression/pinning suite** (one implementation, not two to keep honest) rather than a cross-language parity lock. The ~dozen pure `ScanHeuristics` unit tests (`testStatementRow*`, `testBareDate`, `testStackedRows*`, `testFallback*`, `testCRSuffixIsCredit`, etc.) have zero Vision/PDFKit dependency and are directly transliterable to Vitest as literal-string/date test cases, no fixture capture needed.

---

## 5. Auth & session migration plan

### 5.1 Replacing `web/proxy.ts`'s server-side gate

`web/proxy.ts` is unsupported under `output:'export'` (Next's own docs: Platform support → Static export = No) and will simply never execute — delete it outright rather than leave dead code. Also delete `web/lib/supabase/server.ts` (confirmed dead code via repo-wide grep today, and its `next/headers` `cookies()` dependency is itself unsupported for static export). Move the three redirect rules it enforced into three client-side call sites, all reusing the same `createClient()` browser Supabase client already in use:

1. **Signed-out → `/sign-in` on any protected route:** `AppStateProvider`'s `runBootstrap()` in `web/lib/store.tsx` already calls `supabase.auth.getUser()` first; today, on `!authUser` it silently `setLoading(false); return`s, relying on `proxy.ts` having already redirected. Change this to `router.replace('/sign-in')` when `!authUser`, short-circuited by the existing `isTestBuild() && readFlags().bypassAuth` check (reproducing `proxy.ts`'s `bypassAuth` branch exactly). Keep `loading` true until this resolves — the existing `{loading ? <Loading/> : children}` branch in `app/(app)/layout.tsx` already prevents a content flash, so this is a small, low-risk change to an already-central choke point, not new plumbing.
2. **Signed-in → `/dashboard` on `/sign-in`:** add a mount-time effect to `app/sign-in/page.tsx` (already imports `useRouter`/`createClient`) calling `getUser()` and redirecting if a user is already present.
3. **Root `/` route:** convert `app/page.tsx` from a Server Component `redirect()` to a small `'use client'` component calling `useRouter().replace('/dashboard')` on mount — technically still supported as-is under static export (Next emits a build-time meta-refresh), but converting avoids a signed-out user briefly seeing the dashboard shell before rule #1 kicks them back out, and keeps the pattern consistent with #2.

Delete `lib/flags.ts`'s `BYPASS_AUTH_COOKIE` mechanism and its `document.cookie` write in `writeFlags()` — it existed only because `proxy.ts` couldn't read `localStorage`; once the gate is client-side, read `readFlags().bypassAuth` directly.

**Explicitly flag, don't silently inherit:** web's existing `onAuthStateChange` listener only reacts to the `SIGNED_OUT` event, not proactive idle-tab revalidation — this is a documented, pre-existing gap versus iOS-native's app-lifetime `authStateChanges` subscription (`docs/parity-audit-2026-07-02.md`). Removing `proxy.ts` does not make this worse (it only re-checked per-navigation, not for an idle tab either) but it does remove the last bit of server-side reassurance masking it. Recommend closing this gap for the Capacitor build specifically (not desktop web, which can stay as today) by adding an `@capacitor/app` `appStateChange` listener: `App.addListener('appStateChange', ({isActive}) => isActive && supabase.auth.getSession())`, so foregrounding the app re-validates the session the same way the native Swift app's launch-time subscription does.

### 5.2 Session storage: Keychain, not localStorage/cookies

`supabase-js`'s `createClient(url, key, { auth: { storage, autoRefreshToken, persistSession, detectSessionInUrl } })` accepts any object satisfying `{getItem, setItem, removeItem}: Promise`-returning methods (Supabase's own documented mechanism for non-browser runtimes). Build a thin adapter delegating to `@aparajita/capacitor-secure-storage` (Keychain-backed) and wire it in as:

```ts
auth: {
  storage: Capacitor.isNativePlatform() ? keychainStorageAdapter : undefined, // undefined → default browser cookie/localStorage path for desktop web
  autoRefreshToken: true,
  persistSession: true,
  detectSessionInUrl: false,
}
```

**Why not `@capacitor/preferences`:** it's an unencrypted UserDefaults wrapper included in default iTunes/iCloud device backups — Capacitor's own docs steer sensitive data away from it. **Why not bare WKWebView localStorage:** WebKit's own "Updates to Storage Policy" doc and multiple Apple Developer Forum threads confirm WKWebView site data is "best-effort" and can be evicted under disk pressure or cleared across WebKit versions — independent of and unrelated to Supabase's 30-day timebox, a durability gap the native Swift app never had (Keychain-backed via the SDK). One iOS-specific gotcha with no web analog: Keychain items can survive app delete+reinstall depending on the `kSecAttrAccessible*` class chosen; decide deliberately whether "fresh install = fresh session" is wanted (pick `...ThisDeviceOnly` + a first-run clear flag if so).

### 5.3 OTP flow — no changes needed

Confirmed low-risk: Ortho's auth is the 8-digit numeric-code flow (`signInWithOtp` → `verifyOtp({token, type:'email'})`), not magic-link. Both are plain async network calls executed directly from JS inside the WKWebView — no browser hand-off, no Universal Link, no PKCE code-exchange, since that machinery is exclusive to magic-link/OAuth flows this app doesn't use. Only adjustment: set `detectSessionInUrl: false` (standard defensive practice for non-browser embeds, not required for correctness here). This becomes relevant only if OAuth/social login is added later (out of scope).

The 30-day `[auth.sessions] timebox = "720h"` cap itself is enforced server-side by Supabase Auth (GoTrue) identically regardless of client — nothing here changes that. **Reminder carried over from codebase discovery, not new to this migration:** this timebox must independently be confirmed set on the hosted/production Supabase project (Dashboard → Auth → Sessions, or `supabase config push`) — `config.toml`'s local value is not auto-mirrored, and a prior drift incident was found.

---

## 6. Golden-vector / PARITY.md retirement plan

Frame: `iOS/Ortho-iOS/` becomes a frozen historical reference, not a second live client — the golden-vector harness's entire premise (two live implementations kept honest against each other) stops being true the moment nobody updates the Swift mirrors. Neither `ios-ci.yml` nor `web-ci.yml` is a GitHub branch-protection required-to-merge check today (confirmed: `main` has zero protection rules via the API) — so nothing here is a hard blocker to merging, but leaving it as-is produces permanent, misleading red/noise.

**Decisions:**

1. **`ios-ci.yml`:** strip push/PR path triggers down to `workflow_dispatch`-only, and reduce the job to `xcodebuild build` only (drop `xcodebuild test`). This preserves a manual "does the frozen app still compile" smoke check without asserting against 11 XCTest parity suites that will start failing the instant any vectored TS function next changes, since nobody will update their Swift mirrors. Do not delete the workflow outright — a manual compile check has nonzero value if `iOS/Ortho-iOS/` is ever revisited — but do disable it from running on every push/PR, since it can no longer pass reliably as a parity check.

2. **`shared/test-vectors/` + `web/scripts/gen-vectors.ts` + `web/test/*.parity.test.ts`:** **keep as-is**, but reframe the mental model from "cross-language parity lock" to "TS regression/snapshot fixtures." The `web-ci.yml` drift-check step (regenerate vectors, diff against committed JSON) still catches accidental behavior changes in `mortgage.ts`/`insights.ts`/`splits.ts`/`money.ts`/`transactionFilters.ts`/`balances.ts`/`range.ts`/`housing.ts`/`lease.ts` even with only one language present — it's cheap, already working infrastructure, and there's no real benefit to deleting it. Do not delete `shared/`; do stop requiring pbxproj entries for any *new* vector file (§ "Adding a new vector file" in `docs/shared.md` simplifies to just `gen-vectors.ts` + one Vitest file going forward, since there's no second consumer to wire up).

3. **`iOS/Ortho-iOSTests/*ParityTests.swift`:** leave in place, untouched, inside the frozen `iOS/Ortho-iOS/` tree — they're part of the historical snapshot, not something to actively delete. They simply stop being exercised by CI once `ios-ci.yml` triggers are cut to manual (#1).

4. **`web/test/i18n/catalog-parity.test.ts` — delete.** This is a separate, easy-to-miss non-vector lock that `readFileSync`s `iOS/Ortho-iOS/Localizable.xcstrings` directly from the web CI Vitest run. Once nobody hand-updates that frozen Swift resource file, this test starts failing (or silently passes on stale coverage) the moment a new web-only string is added. There is no replacement needed — Capacitor serves `web/lib/i18n/*` directly, so `Localizable.xcstrings` becomes dead weight read by no runtime code, only by this one test.

5. **`PARITY.md`:** rewrite, don't just edit rows. Its entire premise ("one product on three surfaces" with iOS as a co-equal, vector-generating app) is gone. Archive the current file as a dated historical snapshot (e.g. `docs/archive/PARITY-2026-07-08.md`) and replace the live `PARITY.md` with a smaller "web (+ Capacitor iOS shell) vs. CLI" matrix — strike the iOS column, retire or relabel the "Golden-vector enforcement" row as "regression fixtures, web-only," and rewrite the "How parity is enforced" and "Known divergences → Apps (web ↔ iOS)" sections, which become purely historical. **Specifically rewrite the scan-feature paragraph**: today it says scanning is "iOS only... an input method, not a product-surface divergence" — this becomes wrong the moment it ships as a Capacitor plugin invoked from React; it's no longer "iOS-only," it's "a native plugin used by the one remaining client." Add a one-line changelog banner ("Last reconciled: [spec ref], Capacitor consolidation — iOS/Ortho-iOS/ frozen, golden-vector harness repurposed as TS regression fixtures") rather than erasing the prior audit trail.

6. **Docs sweep:** `docs/index.md`, `docs/ios.md`, `docs/web.md`, `docs/shared.md`, `docs/makefile.md`, `docs/supabase.md`, `README.md`, `shared/test-vectors/README.md` all describe or route through the three-surface/two-language model by name. `docs/index.md`'s routing table should point contributors at Capacitor/web as the iOS delivery vehicle; re-scope `docs/ios.md` to "read only when touching the frozen legacy app or referencing the scan plugin's original Swift source." `CLAUDE.md` (repo root) currently hard-points at `specs/020-drift-reconciliation/plan.md` as "the current plan" — update it to point at whatever this migration's spec becomes once created.

7. **CLI parity (`PARITY.md` CLI rows, `web/test/import/*`) is unaffected** — the CLI never participated in the golden-vector harness; only row labels need adjusting if the iOS column is removed, not substance.

---

## 7. Native-feel UX checklist

Every item below is a documented, real gotcha (not speculative) for wrapping an existing responsive web app in a Capacitor WKWebView, mapped to Ortho's specifics (Lato-based design system, light/dark CSS tokens, four-tab bottom navigation, transaction-entry sheets, scan review flow).

| Pitfall | Why it happens | Fix |
|---|---|---|
| **Safe-area insets** (notch/Dynamic Island/home indicator) | `env(safe-area-inset-*)` can resolve to **0** inside a Capacitor WKWebView even when the identical page renders correct insets in mobile Safari — a widely reported WKWebView-specific gap, not a general iOS CSS issue | Set `viewport-fit=cover` on the viewport meta (Next.js `viewport` export in `app/layout.tsx`); apply insets as padding on the **outer app shell only** (tab bar, header) so individual screens don't re-solve it; pair with `ios.contentInset` native config; add a community `capacitor-plugin-safe-area` if raw numeric values are needed in JS (e.g. for canvas-based UI) |
| **Virtual keyboard covering inputs** | Default `Keyboard` resize mode (`native`) resizes the whole WebView, breaking any `100vh`-based layout | Set `resize: 'body'` explicitly in `capacitor.config`; test on a **real iPhone**, not just Simulator — this bug is repeatedly reported as reproducing only on physical devices; add extra bottom offset beyond raw keyboard height to also clear iOS's QuickType suggestion bar, relevant to every transaction-entry/scan-review form field |
| **Rubber-band overscroll bounce** | `overscroll-behavior: none` is silently ignored by WKWebView — a strong "this is a webpage" tell if left on | Rely on Capacitor's default `scrollView.bounces = false` (already set in `CAPBridgeViewController`); on iOS 16 specifically this has regressed (also set `alwaysBounceVertical = false` if it reappears) — re-verify on each new iOS release, not a one-time fix; keep inner `overflow:auto` containers (e.g. a modal transaction list) unaffected — they get their own CSS-respecting scroll behavior |
| **Text-selection callout / long-press** | Default WKWebView shows iOS's Copy/Look Up/Share callout on long-press of any element | `-webkit-touch-callout: none; user-select: none;` on the app shell, **explicitly re-enabled** on inputs/textareas and genuinely copyable content (transaction IDs, addresses) — don't apply blanket, or users lose legitimate copy ability |
| **Tap responsiveness** | Legacy 300ms tap delay is mostly resolved by modern WebKit + `width=device-width`, but only becomes fully consistent with an explicit opt-out of double-tap-zoom disambiguation | Add `touch-action: manipulation` once at the design-system layer (Button/Link/tab-bar-item primitive components), not per-screen |
| **Status bar color/style** | Doesn't respond to theme changes at all unless wired explicitly; a documented `backgroundColor` behavior change occurred at iOS 17 | Set `UIViewControllerBasedStatusBarAppearance = YES` in Info.plist (silent no-op otherwise); drive `StatusBar.setStyle()`/`setBackgroundColor()` from the **same** handler that already flips Ortho's light/dark CSS tokens (not just at cold launch); use `overlaysWebView: true` so the status bar visually matches whichever screen background is showing, consistent with a design-system-driven app; verify explicitly on iOS 17+ |
| **Splash screen flash** | Default `launchShowDuration` (500ms) + `launchAutoHide: true` can hide the splash before the first real frame paints, exposing a blank flash | `launchAutoHide: false`, call `SplashScreen.hide()` manually after first meaningful paint (post auth-check + first route render); match `backgroundColor` between splash and WebView; generate a `splash-dark.png` via `@capacitor/assets` given Ortho's dark theme |
| **Back-swipe gesture** | WKWebView's native `allowsBackForwardNavigationGestures` operates on WebView page-load history, not Next.js's client-side `pushState` router — edge-swipe-back often silently does nothing | Decide explicitly: either wire a small plugin mapping an edge-pan gesture to `router.back()`, or accept in-app tab/back-button navigation as primary (consistent with the existing four-tab shell) and treat native edge-swipe as a later nice-to-have — don't let this be discovered in QA |
| **Push permission timing** | iOS permission prompts are one-shot; a denial can't be re-prompted, and cold-launch asks convert poorly | Never request on first app open; show an in-app "priming" explanation tied to a concrete moment of intent (e.g. after the first bill/reminder is created), only calling `requestPermissions()` after the user opts in through that in-app UI |

---

## 8. App Store review risk & mitigations

**Governing guideline:** Apple App Store Review Guideline 4.2 (Minimum Functionality). Its documented rejection language explicitly names the exact pattern this migration risks producing if under-invested: *"push notifications, Core Location, or sharing do not provide a robust enough experience"* — meaning bolting a couple of decorative plugins onto an otherwise plain wrapped website is, per Apple's own stated language, **insufficient**. This is not a one-time gate either — a previously-approved build is not precedent; a subsequent update can be caught by a different or stricter reviewer.

**Risk assessment: LOW-to-MODERATE, execution-dependent, not policy-dependent.** Ortho's planned architecture already contains the specific ingredients Apple's rejection language and community case histories point to as the standard mitigation, and it exceeds Apple's own explicit counterexample (push alone is insufficient) by also shipping camera + Vision OCR + on-device ML (hardware/ML-bound, non-decorative — exactly what community guidance repeatedly names as what actually resolves 4.2 rejections) and biometric unlock. Category also helps: Apple has historically been more lenient with account-bound utility/finance apps holding real persisted data than with "wrap our marketing site" content aggregators — Ortho is unambiguously the former.

**Concrete mitigations (in priority order):**
1. **Bundle the static export locally inside the binary** — do not point the production WKWebView at a live remote deployment URL. This is required anyway for `output:'export'` compatibility once `proxy.ts` is retired, and it simultaneously removes the single highest-risk historical rejection trigger (a WebView pointed at a remote origin reads as "just a website" to reviewers). Add a CI/build-time guard asserting `capacitor.config`'s `server.url` is unset for release builds.
2. **Ship the already-planned genuine native plugins**, not decorative ones: the custom scan plugin (camera + Vision OCR + PDFKit + optional on-device FoundationModels — hardware+ML, hard to fake), push notifications, Face ID/Touch ID gating Keychain session access.
3. **Complete the native-feel UX pass (§7) before first submission, not after.** A visibly "un-native" WebView (content under the notch, keyboard covering inputs, wrong-colored status bar, visible rubber-band bounce) is exactly the signal that invites 4.2 scrutiny in the first place — treat §7 as one release gate, not a post-launch backlog.
4. **Native-styled offline/error states**, not a browser-style blank screen or interstitial when Supabase is unreachable.
5. **Provide App Review with working demo credentials** in the App Store Connect review notes so reviewers can actually pass the 8-digit email-OTP sign-in and reach the native plugin surfaces (scan, biometrics) — review friction is worse when reviewers bounce off login and default to a superficial "looks like a website" judgment. Keep the test-only `bypassAuth` flag strictly out of production builds; use a real reviewer account instead.

---

## 9. Rollout / de-risking recommendation

`iOS/Ortho-iOS/` staying in the repo, frozen and unmaintained (not deleted), is already decided — this section covers only its CI treatment and the cutover sequence for the new Capacitor build.

**`ios-ci.yml` (existing native-app CI): switch triggers to `workflow_dispatch`-only, reduce to `xcodebuild build` (drop `test`).** Do not disable/delete it outright — a manual "still compiles" smoke check has nonzero value if the frozen app is ever revisited for a specific bug, and deleting the workflow file is a needless extra diff versus just narrowing its triggers. Do not leave it running on every push/PR unchanged — it *will* start failing permanently the moment any vectored TS function next changes, per §6, producing pure noise on unrelated PRs.

**Phased cutover for the Capacitor build:**

- **Phase 0 — Foundation (pre-TestFlight):** Land the static-export pipeline, Capacitor scaffold, and the *entire* §7 native-feel UX pass together as one gate — safe area, keyboard, bounce, text-selection, tap responsiveness, status bar, real generated icon/splash assets. Also land the auth/session migration (§5) and at minimum the camera-capture half of the scan plugin (§4). Treat this as one bundle, not a trickle — it is also the best insurance against a Guideline 4.2 rejection later.
- **Phase 1 — Internal TestFlight, dark-launched alongside the still-live native app:** Internal TestFlight (up to 100 testers, no App Review required, builds available immediately) while `iOS/Ortho-iOS/` continues shipping unchanged to the public App Store. This is where push notifications (with correctly-timed priming, §7) and Universal Links get added, and where the real-device-only keyboard/bounce bugs get caught.
- **Phase 2 — External TestFlight with an explicit UX bar:** Expand to external TestFlight (up to 10,000 testers, lightweight review) only once internal dogfooding is clean. Define and check off an explicit bar before proceeding: no content under the notch/home indicator anywhere; no input ever hidden by the keyboard; no visible rubber-band bounce; status bar always matches current theme; push permission never requested before user-initiated opt-in; the scan plugin at full parity with the frozen Swift app's fixture suite (§4.3). Do not submit for full review until every item is checked.
- **Phase 3 — Submission and cutover:** Submit the Capacitor build for full App Store review only once the Phase 2 bar is met. **Keep the rollback path explicit**: do not remove `iOS/Ortho-iOS/` build capability or retire its manual CI trigger until the Capacitor build has a release or two of production crash-free-rate/telemetry parity in the wild. If bundle ID reuse (§10) means the Capacitor build *replaces* the existing App Store listing's binary, the practical rollback mechanism is "expedited resubmission of a build compiled from the still-intact `iOS/Ortho-iOS/` tree," not a live dual-listing — confirm this is an acceptable rollback SLA before cutover, or consider a brief dual-listing period if not.
- **Phase 4 — Android: explicitly out of scope for this spec**, sequenced as a separate future milestone. `npx cap add android` reuses the same web bundle and plugin API surface (structurally cheap to add later), but Android's OEM-fragmented system WebView reintroduces a second, separately-budgeted round of the exact bug classes in §7, plus a forced rework for any app targeting Android 16+/API 36 (edge-to-edge UI removes `StatusBar` background-color control entirely). Do not parallelize Android with this iOS migration.

---

## 10. Open risks / unknowns for the spec to flag

These need an explicit product/engineering decision or `[NEEDS CLARIFICATION]` marker in the formal spec — none block starting the work, but each has a real downstream consequence if left implicit:

1. **`appId` / bundle ID reuse.** This report assumed `com.ortho.app` as a placeholder. If the intent is to update the *existing* App Store Connect listing (preserving reviews, ranking, install base) rather than create a new listing, the Capacitor app's `appId` **must** exactly match `iOS/Ortho-iOS`'s current bundle identifier (found in its project settings / `SupabaseConfig.swift.template` context — not confirmed in this research pass). Get this bundle ID and lock it in before scaffolding `cap init`, since changing it later means a new App Store listing.
2. **FoundationModels refiner fate (§4.1).** No cross-platform equivalent exists. Options: (a) keep as an optional native plugin call, iOS 26+ only, silently absent elsewhere (matches today's behavior exactly); (b) substitute a cloud LLM call (e.g. Claude API, consistent with the user's stated cross-app AI/payments plans) — but this is a deliberate privacy trade-off (loses the "on-device only" guarantee spec 014 was built around) and must be called out as a decision point in the spec, not silently substituted by an implementer.
3. **Keychain adapter byte-size limits.** iOS Keychain items don't have React Native SecureStore's ~2KB cap that forced Supabase's community "LargeSecureStore" AES-split pattern for Expo — this report assumes a single-item adapter for the whole session JSON is sufficient, but this should be verified against whichever specific plugin (`@aparajita/capacitor-secure-storage` or alternative) is chosen before relying on it in production.
4. **`trailingSlash: true` + Capacitor's static asset serving.** Recommended in §2.3 based on general static-export/self-hosting guidance, but not verified against Capacitor's specific default WKWebView asset-serving behavior for this app's route structure — test explicitly once the Capacitor scaffold lands, before assuming it's correct.
5. **Push notifications: in scope for v1 or deferred?** The plugin matrix (§3) includes it, but nothing in the codebase discovery indicates push is a current product requirement (no server-side notification-sending infrastructure was found). If out of scope for the initial Capacitor ship, drop the `@capacitor/push-notifications` setup from Phase 0/1 and revisit later — don't build entitlements/APNs plumbing speculatively.
6. **Universal Links domain.** `@capacitor/app`'s deep-link handling (§3) needs a real domain hosting `apple-app-site-association` under Associated Domains — confirm which domain (presumably the production web app's) before scaffolding, and confirm it's DNS/hosting-ready for that file.
7. **Old `iOS/Ortho-iOS/` CI rollback SLA.** §9 assumes the frozen Swift project can still be compiled and expedited-resubmitted if the Capacitor build needs an emergency rollback. This assumes nobody accidentally breaks the frozen build (e.g. via an incompatible Xcode/SDK upgrade over time) — worth an explicit decision on whether the manual `workflow_dispatch` CI check (§9) is run periodically (e.g. monthly) to catch silent bit-rot, or left purely on-demand.
8. **Reviewer demo account provisioning.** §8's "provide working demo credentials" mitigation requires an actual reachable email inbox for the 8-digit OTP flow during Apple's review — confirm who owns provisioning and maintaining that account before submission, since it's a process dependency, not a code change.
9. **Scan plugin test coverage bar for `xcodebuild test` vs. `build`-only CI (§2.4, §9).** This report recommends starting CI at `build`-only once the bulk of testable logic moves to TypeScript, but the camera-capture UX itself (§4, live-OCR shutter gating) has zero automated coverage today and will have none in the new architecture either unless explicitly scoped — decide whether that gap is acceptable long-term or needs a follow-up spec item (e.g. a thin native unit test for the readiness-hysteresis counters, callable from `xcodebuild test` without needing camera hardware).