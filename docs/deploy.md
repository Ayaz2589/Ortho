# Deploying Ortho-iOS to TestFlight

> ⚠️ **This lane ships the FROZEN native app, not the current app.**
> `ios-deploy.yml` archives `iOS/Ortho-iOS.xcodeproj` (scheme `Ortho-iOS`) — the
> historical SwiftUI implementation retired in spec 021. The app Ortho actually
> ships today is the `web/` Next.js bundle wrapped by **Capacitor**
> (`web/capacitor.config.ts`, appId `AyazUddin.Ortho-iOS`, project
> `web/ios/App/App.xcodeproj`, scheme `App`; build-verified by
> `.github/workflows/capacitor-ios-ci.yml`). This deploy workflow has **not** been
> migrated to the Capacitor project — running it uploads the frozen native app.
> Migrate the archive step (or add a new lane targeting `web/ios/App/`) before
> using this to ship current features.

`.github/workflows/ios-deploy.yml` archives the app on a macOS runner, signs it
with your Apple distribution credentials, and uploads the build to TestFlight.
It runs **only on manual trigger** and fails fast — before any macOS minute is
spent — naming every repo secret that is missing.

> **Status**: the pipeline is in place and its preflight is verified, but the
> full archive → upload lane is **unverified until the credentials below
> exist**. Nothing in this repo contains secret values (the repo is public);
> everything lives in GitHub Actions repo secrets.

## One-time Apple prerequisites

1. A paid **Apple Developer Program** membership (developer.apple.com).
2. An **app record** in App Store Connect (appstoreconnect.apple.com → My Apps
   → “+” → New App) with the bundle identifier the Xcode project uses — check
   `iOS/Ortho-iOS.xcodeproj` → target → General → Bundle Identifier. The first
   archive with `-allowProvisioningUpdates` registers signing assets
   automatically against that app id.

## Required repo secrets

Store each one at GitHub → repo → Settings → Secrets and variables → Actions →
“New repository secret”, or from a terminal:

```bash
gh secret set <NAME> --repo Ayaz2589/Ortho    # prompts for the value
```

| Secret | What it is | Where to get it |
|---|---|---|
| `ASC_ISSUER_ID` | App Store Connect API issuer id (UUID) | App Store Connect → Users and Access → **Integrations** → App Store Connect API — “Issuer ID” at the top |
| `ASC_KEY_ID` | The API key's id (10 chars) | Same page — create a key with **App Manager** role; its “Key ID” column |
| `ASC_PRIVATE_KEY` | The key's `.p8` file **contents** (multi-line, keep the BEGIN/END lines) | Downloadable **once** when the key is created — keep a copy in your password manager |
| `DIST_CERT_P12` | Apple Distribution certificate + private key, `.p12`, **base64-encoded** | Keychain Access on your Mac: My Certificates → “Apple Distribution: …” → right-click → Export as `.p12` with a password (create the cert first at developer.apple.com → Certificates if you don't have one). Then `base64 -i dist.p12 | pbcopy` |
| `DIST_CERT_PASSWORD` | The password you chose exporting the `.p12` | You just chose it |
| `SUPABASE_URL` | The live project URL the shipped app talks to | Supabase Dashboard → Project Settings → API (same value as `NEXT_PUBLIC_SUPABASE_URL` in `web/.env.local`) |
| `SUPABASE_ANON_KEY` | The publishable/anon key | Same page (same value as `NEXT_PUBLIC_SUPABASE_ANON_KEY`) |

## Running a deploy

```bash
GH_TOKEN=placeholder gh workflow run ios-deploy.yml   # from a sandbox
# or GitHub → Actions → "iOS Deploy (TestFlight)" → Run workflow
GH_TOKEN=placeholder gh run watch --exit-status
```

- **With secrets missing**: the `preflight` job fails in seconds with one
  message listing every missing secret name. Nothing is built.
- **With secrets configured**: expect ~15–30 min. A successful run ends with
  the build visible in App Store Connect → TestFlight (processing can add a
  few minutes). Every run uploads a `deploy-output` artifact with the `.ipa`
  and the archive/export/upload logs, success or failure.

## Safety properties

- `workflow_dispatch` only — no push/tag trigger until the lane has succeeded
  manually at least once (add one deliberately later if wanted).
- The deploy job is additionally gated on the dispatch event, so
  fork-originated runs can never reach the signing steps (GitHub also withholds
  secrets from fork PRs).
- The distribution cert lives in a throwaway keychain on the runner; the `.p12`
  file is deleted right after import.
- The frozen-app smoke workflow (`ios-ci.yml`, now manual-trigger / build-only)
  stays **secretless** — it builds with placeholder Supabase values; only this
  deploy workflow touches real ones. (The live CI loop is
  `capacitor-ios-ci.yml` + `web-ci.yml`, also secretless.)
