# Implementation Plan: Capacitor iOS Consolidation

**Branch**: `021-capacitor-ios-consolidation` | **Date**: 2026-07-09 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/021-capacitor-ios-consolidation/spec.md`

## Summary

Retire `iOS/Ortho-iOS/` (freeze in place, no new work) and ship iOS going forward as the existing
`web/` Next.js codebase, statically exported and wrapped in Capacitor 8 for a real App Store binary
under the existing bundle identity (`AyazUddin.Ortho-iOS`). The on-device receipt/statement-scan
capability survives as one custom Swift Capacitor plugin (capture + Vision OCR + PDFKit, ported
close to verbatim from `iOS/Ortho-iOS/Services/Scan/`), while its pure parsing/heuristics/inference
logic ports to new TypeScript under `web/lib/scan/` and joins the existing regression-fixture
system. `web/proxy.ts`'s server-side auth gate is replaced by three client-side guard call sites
reusing the existing browser Supabase client; session storage moves from cookies to a Keychain-backed
secure-storage adapter so login persists like a native app's. A native-feel UX pass (safe areas,
keyboard, scroll bounce, status bar, splash) and a small set of native plugins (camera, file picker,
haptics, biometrics, share, secure storage, status bar, keyboard, splash) make the wrapped app read
as native rather than "a website in a shell" — the primary App Store Guideline 4.2 risk. The
golden-vector cross-language enforcement is retired/reframed as a single-implementation regression
suite now that there is only one live client; `PARITY.md` and the docs sweep are rewritten
accordingly. Rollout is TestFlight-first (internal → external) behind an explicit native-feel bar,
with the frozen native app kept buildable as a rollback path. Delivered test-first throughout.

This plan and its Phase 0/1 outputs are grounded in a prior deep-research pass (Capacitor 8.4.1
architecture, plugin ecosystem, Next.js 16.2.9 static-export support, App Store review risk,
WKWebView UX pitfalls) combined with a file-by-file codebase discovery of the current scan pipeline,
web server-side surface, auth/session mechanics, and golden-vector enforcement. See
[research.md](./research.md) for the full decision log.

## Technical Context

**Language/Version**: TypeScript (Next.js 16 App Router / React 19) for all shared app logic and
the newly-ported scan parser; Swift 5 for the one custom Capacitor plugin (camera capture, Vision
OCR, PDFKit, optional FoundationModels refiner).

**Primary Dependencies**: `@capacitor/core`, `@capacitor/cli`, `@capacitor/ios` (Swift Package
Manager, not CocoaPods); `@capacitor/camera`, `@capawesome/capacitor-file-picker`,
`@capacitor/haptics`, `@aparajita/capacitor-biometric-auth`, `@aparajita/capacitor-secure-storage`,
`@capacitor/status-bar`, `@capacitor/keyboard`, `@capacitor/share`, `@capacitor/splash-screen` (+
`@capacitor/assets` dev-only icon/splash generator). Existing stack (Next.js, React, TypeScript,
Tailwind v4, `@supabase/supabase-js` / `@supabase/ssr`, Vitest) is otherwise unchanged.

**Storage**: Existing shared Supabase Postgres backend, unchanged. New: iOS Keychain (via the
secure-storage plugin) for the Supabase session, replacing browser cookies on the Capacitor build;
`FileManager.temporaryDirectory` for in-flight scan capture images/PDF pages, exposed to JS via
`Capacitor.convertFileSrc(uri)`.

**Testing**: Vitest (existing `web/test/`), extended with a new `web/test/scan/` suite exercising
the ported TS parser against frozen OCR-input fixtures (captured once from the existing native
fixture library, since Vision/PDFKit cannot run outside Apple platforms — not even in CI without a
macOS runner). `xcodebuild build` (smoke-compile, not `test`) for the new Capacitor iOS project in a
new CI workflow. The frozen `iOS/Ortho-iOSTests/*` suites remain in the repository but stop being a
required CI signal (see research.md Decision 8).

**Target Platform**: iOS 17+ device/simulator via a Capacitor-wrapped WKWebView shell (Capacitor 8's
supported floor); the optional on-device "smart cleanup" scan assist additionally requires iOS 26+
(FoundationModels) and degrades silently below that, exactly as it does today. Desktop/mobile web is
unchanged and continues to run in an ordinary browser.

**Project Type**: Single web codebase (`web/`) with two delivery targets — a browser build (desktop
+ responsive web, unchanged) and a Capacitor-wrapped native iOS build (new). Not a mobile+API split:
there is no separate native application layer beyond the one custom scan plugin and thin
Capacitor-config glue.

**Performance Goals**: No new numeric targets beyond matching current user-perceived responsiveness:
tap response must feel immediate (no perceptible delay per FR-006), and scan capture-to-result
timing should match today's native app (unchanged pipeline, just relocated behind a plugin
boundary — no additional network hops are introduced).

**Constraints**: On-device-only scan processing, no cloud OCR/LLM substitute (FR-008, FR-010); no
server dependency at runtime (static export, FR-002); reuse of the existing App Store bundle
identity (FR-015); no push notifications, deep/universal links, or Android in this feature (FR-019);
TestFlight-first rollout gated on a native-feel checklist before public submission (FR-020).

**Scale/Scope**: No change in user population or data scale — same two-person-household product,
same Supabase backend, same four destinations (Dashboard, Transactions, Housing, Settings). Scope is
delivery-mechanism and native-plugin work, not new product surface area.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

The constitution was amended to **v2.0.0** as part of this feature (see
`docs(021)` commit amending `.specify/memory/constitution.md`) specifically to remove the
contradiction this feature would otherwise create: the prior "iOS app is canonical" framing is
replaced with "the web/TypeScript codebase is the single canonical implementation, delivered
natively per canvas." Re-checked against the amended constitution:

| Principle | Status | Notes |
|---|---|---|
| I. One Design System, Tokens Only | ✅ PASS | No new tokens/colors introduced; the Capacitor shell renders the existing `app/globals.css` tokens unchanged. Native chrome (status bar, splash) is driven from the same tokens (research.md Decision 7). |
| II. Calm Over Dense | ✅ PASS | No UI redesign; native-feel work (safe area, keyboard, bounce) is presentation-layer only. |
| III. Right Form Factor Per Canvas | ✅ PASS (post-amendment) | This feature is the direct implementation of the amended principle: bottom sheets / safe-area / keyboard / status-bar handling on the Capacitor iOS shell, delivered from the one codebase. |
| IV. Plainspoken Voice & Money Formatting | ✅ PASS | Unaffected — no copy or money-formatting changes. |
| V. Accessible & Interaction-Complete | ✅ PASS | Native affordances (Face ID, haptics, share) are additive; existing accessible-DOM/keyboard-reachability requirements carry over unchanged since it's the same React components. |
| VI. Test-Driven & Regression-Safe | ✅ PASS (post-amendment) | Ported scan logic (`ScanHeuristics`/`ScanParser`/`ScanInference`) is developed test-first against frozen fixtures (research.md Decision 3, FR-009); existing `lib/` coverage bar is maintained. The amendment already reframes "golden vectors" as a regression suite, matching this feature's own retirement of the cross-language framing (FR-018). |

No violations requiring Complexity Tracking. The one governance action this feature required —
amending the constitution's foundational framing — was completed as a prerequisite, not worked
around.

## Project Structure

### Documentation (this feature)

```text
specs/021-capacitor-ios-consolidation/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   ├── scan-plugin-api.md          # JS <-> Swift bridge contract for the custom Scan plugin
│   └── session-storage-adapter.md  # supabase-js auth.storage contract for Keychain persistence
└── tasks.md             # Phase 2 output (/speckit-tasks — not created by this command)
```

### Source Code (repository root)

```text
web/                                      # existing Next.js app — extended, not replaced
├── next.config.ts                        # MODIFIED: output: 'export', images.unoptimized
├── capacitor.config.ts                   # NEW: appId (reused bundle id), webDir: 'out', ios config
├── package.json                          # MODIFIED: + @capacitor/* deps, remove `next start` script
├── proxy.ts                              # DELETED: unsupported under static export (research.md D2)
├── ios/
│   └── App/                              # NEW: `npx cap add ios` output, Swift Package Manager
│       ├── App.xcodeproj
│       ├── App/
│       │   ├── AppDelegate.swift
│       │   ├── Info.plist                # NSCameraUsageDescription, NSFaceIDUsageDescription, etc.
│       │   ├── Assets.xcassets           # app icon + splash source (via @capacitor/assets)
│       │   ├── public/                   # `cap sync` copies web/out/ here — gitignored
│       │   └── Plugins/
│       │       └── Scan/                 # NEW: the custom Capacitor Swift plugin
│       │           ├── ScanPlugin.swift          # @CapacitorPlugin surface: capture/extractPDF/
│       │           │                              # refineMerchant/rescue/checkPermissions
│       │           ├── ScanCaptureController.swift  # ported from ScanCaptureView.swift
│       │           ├── ScanTextExtractor.swift      # ported near-verbatim
│       │           └── ScanRefiner.swift            # ported near-verbatim (FoundationModels, iOS 26+)
│       └── .gitignore                    # build/, Pods/ (if ever needed), xcuserdata/
├── lib/
│   ├── scan/                             # NEW: ported pure scan logic (was iOS-only Swift)
│   │   ├── scanModels.ts                 # ScanDocumentText/Line/Table/Page, ParsedCandidate, etc.
│   │   ├── scanHeuristics.ts             # ported from ScanHeuristics.swift
│   │   ├── scanParser.ts                 # ported from ScanParser.swift
│   │   └── scanInference.ts              # ported from ScanInference.swift
│   ├── auth/
│   │   └── keychainStorage.ts            # NEW: supabase-js auth.storage adapter (native only)
│   ├── supabase/
│   │   ├── client.ts                     # MODIFIED: native-aware storage option
│   │   └── server.ts                     # DELETED: confirmed dead code (research.md D2)
│   └── flags.ts                          # MODIFIED: drop BYPASS_AUTH_COOKIE, read localStorage directly
├── app/
│   ├── page.tsx                          # MODIFIED: client-side redirect (was Server Component)
│   ├── sign-in/page.tsx                  # MODIFIED: + redirect-away-if-already-signed-in
│   └── (app)/layout.tsx                  # MODIFIED: + client-side signed-out guard (replaces proxy.ts gate)
├── components/
│   └── scan/                             # NEW/MODIFIED: React port of ScanSession + interstitial/summary UI
├── scripts/
│   └── gen-vectors.ts                    # UNCHANGED — now a plain regression-fixture generator
└── test/
    ├── scan/                             # NEW: Vitest port of ScanParserTests.swift
    │   └── *.test.ts                     # against frozen fixtures under shared/scan-fixtures/
    └── i18n/catalog-parity.test.ts       # DELETED (research.md D9 — reads the frozen Localizable.xcstrings)

shared/
├── test-vectors/                         # UNCHANGED — kept as a regression suite, not deleted
└── scan-fixtures/                        # NEW: frozen ScanDocumentText JSON, one per ported fixture
                                            # (captured once from iOS/Ortho-iOS/Resources/ScanFixtures/
                                            # via the still-intact ScanTextExtractor before/alongside
                                            # the plugin port — see quickstart.md)

iOS/Ortho-iOS/                            # UNCHANGED — frozen, no edits in this feature

.github/workflows/
├── capacitor-ios-ci.yml                  # NEW: next build (export) -> cap sync -> xcodebuild build
└── ios-ci.yml                            # MODIFIED: workflow_dispatch-only trigger, build-only step

docs/
├── archive/PARITY-2026-07-08.md          # NEW: verbatim snapshot of the pre-021 PARITY.md
├── index.md, ios.md, web.md, shared.md   # MODIFIED: describe the single-implementation reality
PARITY.md                                 # REWRITTEN: web(+Capacitor iOS) vs CLI matrix
README.md                                 # MODIFIED: architecture blurb update
CLAUDE.md                                 # MODIFIED: point at this feature's plan, then whatever follows
```

**Structure Decision**: Everything lives inside the existing `web/` package — there is no new
top-level app directory. The Capacitor native project (`web/ios/App/`) is generated by the Capacitor
CLI and kept structurally and namespace-distinct from the frozen `iOS/Ortho-iOS/` at the repo root;
the two Xcode projects never reference each other. Ported scan logic lands in `web/lib/scan/`
alongside the existing `web/lib/*` business logic it already conceptually mirrors
(`web/scripts/import/engine/*`). `shared/` gains one new fixture directory
(`shared/scan-fixtures/`) but its existing `test-vectors/` directory and generator are untouched in
mechanism, only in framing.

## Complexity Tracking

*No entries — the Constitution Check above found no unresolved violations.*
