# Contract: TestFlight Deploy Workflow

**Files**: `.github/workflows/ios-deploy.yml` (NEW), `docs/deploy.md` (NEW, owner setup guide —
credential acquisition steps only, never values; repo is public).

## Triggers

`workflow_dispatch` only (no push/tag trigger until the lane has succeeded once). Deploy job
additionally gated `if: github.event_name == 'workflow_dispatch'` — fork PRs can never reach it
(CI-SETUP.local.md §4 requirement).

## Job 1 — `preflight` (FR-016, SC-007)

- Runs on `ubuntu-latest` (fast, free, no macOS queue) in seconds.
- Checks **all** required secrets — `ASC_ISSUER_ID`, `ASC_KEY_ID`, `ASC_PRIVATE_KEY`,
  `DIST_CERT_P12`, `DIST_CERT_PASSWORD` — accumulating every missing name, then fails with a
  single message listing them and pointing at `docs/deploy.md`. Passing preflight = all present.

## Job 2 — `deploy` (needs: preflight, `runs-on: macos-latest`)

1. Checkout; select newest Xcode; real `SupabaseConfig.swift` — **decision**: built from the
   committed template exactly like ios-ci.yml but with production values injected from two
   additional secrets (`SUPABASE_URL`, `SUPABASE_ANON_KEY`) added to the required set — the
   shipped app must talk to the live backend, and the anon key must not be committed.
2. Import distribution cert into a throwaway keychain (`DIST_CERT_P12`/`DIST_CERT_PASSWORD`);
   write the ASC API key `.p8` to a temp path.
3. `xcodebuild archive` (Release, generic iOS destination)
   → `xcodebuild -exportArchive` (app-store method, `-allowProvisioningUpdates` with the ASC
   API key so signing assets resolve without a logged-in Xcode)
   → upload via `xcrun altool --upload-app … --apiKey $ASC_KEY_ID --apiIssuer $ASC_ISSUER_ID`.
4. Upload the `.ipa` and export logs as a run artifact regardless of upload outcome.

## Verification available now (pre-credentials, FR-016/SC-007)

- `actionlint` on the workflow file (installable on the sandbox).
- One live `workflow_dispatch` run: preflight must fail in < 60 s naming all seven secrets.
- The macOS deploy job is unreachable in that run (needs preflight) — by design, nothing
  attempts to sign without credentials.

## `docs/deploy.md` contents (FR-017)

Per-secret table (name → what it is → exact click-path to obtain → how to store:
`gh secret set <NAME>` or repo Settings → Secrets → Actions), the manual trigger command
(`GH_TOKEN=placeholder gh workflow run ios-deploy.yml`), what a successful run produces
(TestFlight build visible in ASC), and the one-time Apple-side prerequisites (paid Apple
Developer Program membership, app record + bundle id registered in ASC). States plainly that
the final upload is unverified until credentials exist (spec US7 acceptance #3).
