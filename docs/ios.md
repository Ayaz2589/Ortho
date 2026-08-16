# iOS (`iOS/`) — the FROZEN native app + TestFlight deploy lane

**Read this when:** doing archaeology on the frozen SwiftUI app (emergency rollback, or tracing a
product decision it pioneered), porting more of its Swift scan-pipeline source, or running the
TestFlight deploy lane. **How iOS ships today is NOT here** — the live iOS app is the `web/`
Next.js bundle in a Capacitor shell (`web/ios/App/`); see `./web.md`.

## 1. Status: frozen since spec 021 (2026-07-09)

`iOS/Ortho-iOS/` is the retired SwiftUI client. It stays in the repo unmodified as a rollback path:
no new feature work, excluded from constitution v2.0.0, its CI is manual-trigger build-only
(`.github/workflows/ios-ci.yml`). It predates spec 018 (subscription gate) entirely — run it
against the live backend and it will neither gate nor render subscription UI. Its 11 XCTest parity
suites still exist but are **no longer kept green**: since spec 021 only TypeScript updates the
golden vectors (`shared/test-vectors/`, 13 JSON — see `./shared.md` and root `PARITY.md`), so the
Swift mirrors drift by design.

Both the frozen app and the live Capacitor shell use bundle id `AyazUddin.Ortho-iOS` — deliberate
(the TestFlight/App Store Connect listing carries over), but it means the deploy lane below can
push the frozen app onto the live listing if run unmigrated.

## 2. Shape

```
iOS/
├── ARCHITECTURE.md              # self-marked ARCHIVED (pre-Supabase); rationale sections valid,
│                                # data-layer/feature-status sections wrong — do not trust those
├── Tasks.md                     # old kanban, historical
├── Ortho-iOS.xcodeproj/         # scheme Ortho-iOS; PBXFileSystemSynchronizedRootGroup —
│                                # files under Ortho-iOS/ auto-join the target, no pbxproj edits
├── Ortho-iOS/
│   ├── Ortho_iOSApp.swift       # @main; auth gate; -uiDemo / -uiDemoScan launch args
│   ├── App/                     # AppState.swift (@Observable root store), RootTabView,
│   │                            # SupabaseConfig.swift (GITIGNORED; copy the .template)
│   ├── Models/                  # value types mirroring Postgres rows (snake_case CodingKeys)
│   ├── Services/                # per-table Supabase APIs + pure engines; Scan/ (see §3)
│   ├── Features/                # Dashboard / Transactions (+Scan UI) / Housing / Budgets /
│   │                            # Insights / Settings / Auth
│   ├── DesignSystem/ Components/ Config/ Fonts/ Resources/
│   └── Localizable.xcstrings    # en/bn/es/ja/zh/ko string catalog
└── Ortho-iOSTests/              # 13 XCTest files: 11 golden-vector parity suites +
                                 # ScanParserTests + FeatureFlagsTests; vectors referenced from
                                 # ../shared/test-vectors/ via Copy Bundle Resources
```

Stack: Swift 5 / SwiftUI, `@Observable` (no ViewModels), deployment target iOS 26.2, single
third-party dep `supabase-swift` 2.46.0. Money is `Int64` USD cents ≥ 0, direction from
`kind: expense|income|transfer`; half-open month intervals `[start, end)`; loss is never red;
Lato with size-driven weight; U+2212 for negative money — the same invariants the web app carries
forward (see `./web.md`, `./finance.md`).

## 3. What is still useful in it

- **Scan pipeline Swift source** — `Services/Scan/*.swift` (ScanModels, ScanTextExtractor,
  ScanHeuristics, ScanParser, ScanInference, ScanRefiner) and
  `Features/Transactions/Scan/*.swift` (ScanSession state machine, the AVFoundation
  `ScanCameraView`) are the originals the live code was ported from: parsing/inference became
  TypeScript (`web/lib/scan/`), extraction/camera became the Capacitor Scan plugin
  (`web/ios/App/App/Plugins/Scan/`). When the plugin's camera gating or OCR behavior is in
  question, this is the reference implementation (e.g. the live-OCR orientation fix: interface
  orientation → `CGImagePropertyOrientation`, because gravity is ambiguous with the phone flat
  over a receipt).
- **Parity-mirror map** — for rollback archaeology, the vector-locked Swift mirrors of web logic:
  `DesignSystem/Money.swift`+`Models/Currency.swift` ↔ `web/lib/finance/{money,currency}.ts`;
  `Features/Transactions/TransactionSplits.swift` ↔ `lib/splits.ts`;
  `TransactionFilters.swift` ↔ `lib/transactionFilters.ts`; `Services/Balances.swift` ↔
  `lib/finance/balances.ts`; `Services/InsightEngine.swift` ↔ `lib/finance/insights.ts`;
  `Models/MortgageInfo.swift` ↔ `lib/finance/mortgage.ts`;
  `Features/Dashboard/DashboardRange.swift` ↔ `components/dashboard/range.ts`;
  `Models/Property.swift` (`HousingMath`) ↔ `lib/finance/housing.ts`;
  `Models/LeaseInfo.swift` ↔ `components/housing/lease.ts`. Vectors are generated from web only
  (`npm run gen:vectors` in `web/`); never hand-edit the JSON to make Swift pass.
- **Product/UX decisions** — dual-mode add/edit sheets, custom tab shell with
  `HideTabBarPreferenceKey`, the 6-tier scan detection order — all carried into the web app.

## 4. Building it (macOS only)

Linux sandboxes **cannot** build, run, or test any iOS target — no Xcode. Feedback is CI (§5).
On a Mac:

```sh
cp iOS/Ortho-iOS/App/SupabaseConfig.swift.template iOS/Ortho-iOS/App/SupabaseConfig.swift
# fill projectURL + publishableKey (Supabase → Project Settings → API); never the service-role key
cd iOS
xcodebuild -project Ortho-iOS.xcodeproj -scheme Ortho-iOS \
  -destination 'generic/platform=iOS Simulator' -configuration Debug build
```

The app won't compile without the gitignored `SupabaseConfig.swift`. DEBUG launch arg `-uiDemo`
boots the tab shell on sample data (no auth/server); `-uiDemoTab <tab>`, `-uiDemoLanguage <code>`,
and `-uiDemoScan <fixture>` (+`-uiDemoScanStep`) drive the CI screenshot matrix. No Makefile
targets exist for iOS (`./makefile.md` is web-CLI only).

## 5. CI — `ios-ci.yml` (rollback-readiness smoke check)

`.github/workflows/ios-ci.yml`: **`workflow_dispatch` only, build only, secretless** (a dummy
`SupabaseConfig.swift` is sed-generated from the template). It deliberately does NOT run
`xcodebuild test` — the 11 parity suites would be permanent misleading red now that only TS
updates the vectors. It also captures `-uiDemo` simulator screenshots (tabs × 6 languages, plus
`-uiDemoScan` fixture flows, files `<lang>-<tab>.png` / `<lang>-scan-<step>.png`) uploaded as the
`simulator-screenshots` artifact. Watch runs with `GH_TOKEN=placeholder gh run watch
--exit-status`. The live iOS loop is `capacitor-ios-ci.yml` + `web-ci.yml` (see `./web.md`).

## 6. TestFlight deploy — `ios-deploy.yml`

> ⚠️ **This lane ships the FROZEN app.** It archives `iOS/Ortho-iOS.xcodeproj` scheme
> `Ortho-iOS` — NOT the live Capacitor project (`web/ios/App/App.xcodeproj`, scheme `App`).
> Because both share bundle id `AyazUddin.Ortho-iOS`, running it uploads the retired SwiftUI app
> onto the live TestFlight listing. Migrate the archive step (or add a new lane targeting
> `web/ios/App/`) before using it to ship current features.

Status: pipeline in place, preflight verified; the full archive→upload lane is **unverified until
the secrets exist**. The repo is public — no secret values live in-repo.

**One-time Apple prerequisites**: (1) paid Apple Developer Program membership; (2) an App Store
Connect app record matching the project's bundle identifier — the first archive with
`-allowProvisioningUpdates` registers signing assets automatically.

**Required repo secrets** (`gh secret set <NAME> --repo Ayaz2589/Ortho`, or GitHub → Settings →
Secrets and variables → Actions):

| Secret | What it is | Where to get it |
|---|---|---|
| `ASC_ISSUER_ID` | App Store Connect API issuer id (UUID) | ASC → Users and Access → Integrations → App Store Connect API — "Issuer ID" |
| `ASC_KEY_ID` | API key id (10 chars) | Same page — create a key with **App Manager** role |
| `ASC_PRIVATE_KEY` | The `.p8` file **contents** (multi-line, keep BEGIN/END lines) | Downloadable **once** at key creation |
| `DIST_CERT_P12` | Apple Distribution cert + private key, `.p12`, **base64-encoded** | Keychain Access → export `.p12` with a password; `base64 -i dist.p12 \| pbcopy` |
| `DIST_CERT_PASSWORD` | The `.p12` export password | Chosen at export |
| `SUPABASE_URL` | Live project URL the shipped app talks to | Supabase → Project Settings → API (= `NEXT_PUBLIC_SUPABASE_URL`) |
| `SUPABASE_ANON_KEY` | Publishable/anon key | Same page (= `NEXT_PUBLIC_SUPABASE_ANON_KEY`) |

**Running a deploy**:

```bash
GH_TOKEN=placeholder gh workflow run ios-deploy.yml   # or GitHub → Actions → Run workflow
GH_TOKEN=placeholder gh run watch --exit-status
```

- Secrets missing → the `preflight` job (ubuntu, 2-min timeout) fails in seconds naming **every**
  missing secret; nothing builds.
- Secrets configured → ~15-30 min; the build lands in ASC → TestFlight. Every run uploads a
  `deploy-output` artifact (`.ipa` + archive/export/upload logs), success or failure.

**Safety properties**: `workflow_dispatch` only (no push/tag trigger until one manual success);
the deploy job is additionally gated `if: github.event_name == 'workflow_dispatch'` so
fork-originated runs never reach signing; the distribution cert is imported into a throwaway
runner keychain and the `.p12` deleted right after import; `SupabaseConfig.swift` is sed-injected
from the template with real values — this is the **only iOS** workflow touching real secrets
(`ios-ci.yml`, `capacitor-ios-ci.yml`, `web-ci.yml` are all secretless;
`supabase-migrations.yml` uses its own Supabase secrets). Concurrency group
`ios-deploy`, `cancel-in-progress: false`.

## 7. Gotchas

- `iOS/ARCHITECTURE.md` is stale (pre-Supabase prototype) — rationale sections only.
- Two Xcode projects share one bundle id: `iOS/Ortho-iOS.xcodeproj` (scheme `Ortho-iOS`, frozen,
  deploy lane) vs `web/ios/App/App.xcodeproj` (scheme `App`, live, `capacitor-ios-ci.yml`).
- Adding a source file needs no pbxproj edit (filesystem-synchronized groups), but adding a test
  vector requires the test target's Copy Bundle Resources.
- `iOS/build/`, `iOS/build-device/`, `iOS/temp/`, `Resources/legacy-import.json` are gitignored
  local artifacts / personal data — never commit or rely on them.
- If you ever revive the app: `SupabaseDateFormatters` wire formats must stay `en_US_POSIX`
  (date-only columns are local calendar days); wrap new wire enums in `Lenient` on decode
  (one unknown `kind` used to empty the whole transaction list); bootstrap is one-shot per auth
  ID; optimistic write + snapshot rollback + `dataError` is the mandatory mutator shape.

## 8. Cross-links

`./web.md` — how iOS ships today (Capacitor shell, Scan plugin, keychain auth, biometric gate).
`./supabase.md` — the schema both clients write to. `./shared.md` — the golden vectors.
Root `PARITY.md` — the parity system, now a web-only regression suite.
