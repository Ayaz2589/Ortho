# Quickstart: Validating Cross-Platform Parity Remediation

Prerequisites: Node ≥20.19 (`export PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH"`), Xcode + an iOS
Simulator, the linked Supabase project. Web commands run from `web/`; iOS from `iOS/`. Many CLI tools need
`dangerouslyDisableSandbox`.

## Automated gates (Principle VI)

```bash
# Web — golden vectors + behavior
cd web && export PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH"
npm run gen-vectors      # regenerate shared/test-vectors from web logic (income, custom-split, all insights)
npm test                 # vitest run — MUST be green

# iOS — the parity target must now actually run the SAME vectors
cd iOS
xcodebuild test -project Ortho-iOS.xcodeproj -scheme Ortho-iOS \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' CODE_SIGNING_ALLOWED=NO -quiet
# Expect: *ParityTests (split, insight, mortgage, filter) compile, run, and pass against shared vectors.
```

Drift check: temporarily change a pure function on iOS to diverge → `xcodebuild test` MUST fail (SC-005).

## Story 1 — Auth/session (iOS, manual on simulator)

1. Sign in; force-quit; relaunch → lands on real data, **no** sign-in flash, **no** empty-data flash (SC-001).
2. Wait past access-token expiry (or simulate), relaunch → stays signed in (refresh, not sign-out) (SC-002).
3. Sign out → app shows no prior data; sign in again → data re-loads fresh (FR-004).
4. OTP: confirm the production code length; verify web + iOS gate on that length and the copy matches (FR-005).
5. platform_locks: sign in on iOS, then web → the active-platform rule fires the same way on both (FR-006).

## Story 2 — Split + people correctness

1. On web, create a multi-owner **income** transaction with a custom split (e.g. $100.01, 70/30). Open it on
   iOS → per-owner amounts match to the cent (FR-008/010).
2. On iOS, open that custom-split transaction for edit and Save without changing the split → amounts
   unchanged to the cent (FR-009). Repeat via "copy".
3. On iOS, tap a household person → change name + color → persists; reload web → reflects the change (FR-011).

## Story 3 — Enforced harness

Covered by the iOS `xcodebuild test` above (FR-012/013) and the regenerated `insights.json` with canonical
IDs (FR-014). Confirm all insight rules appear in `insights.json`.

## Story 4 — Web desktop (≥1024px window)

1. Open a split/household transaction's detail → per-owner cents + percent shown (FR-015).
2. Open the dashboard → category breakdown with drill-down + per-member breakdown present (FR-016).
3. Settings → change language → money/number/date formatting re-renders; persists across reload (FR-017).

## Done

All automated gates green on **both** clients, and every Story's manual scenarios pass → SC-001..SC-008 met.
