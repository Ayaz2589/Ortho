# Quickstart: validating Receipt & Statement Scanning (spec 014)

How to prove the feature works, per environment. Contracts: [contracts/](./contracts/),
types: [data-model.md](./data-model.md).

## Prerequisites

- **Linux sandbox**: web toolchain only (`cd web && npm install`); iOS verification is
  CI (`GH_TOKEN=placeholder gh …`). See `CI-SETUP.local.md` (gitignored) for the loop.
- **Mac (operator)**: Xcode + iPhone simulator; gitignored
  `iOS/Ortho-iOS/App/SupabaseConfig.swift` for live-app checks.

## 1. Fast local gate (runs on Linux)

```bash
cd web && npx tsc --noEmit && npm test
```

Expected: full suite green, including `test/i18n/catalog-parity.test.ts` with the new
`scan.*` keys present ×6 languages (US4 #4, SC-006's catalog half). This is the ONLY
web-side change surface — any other web diff is out of scope.

## 2. Parser correctness (CI, or Mac locally)

```bash
# Mac:
cd iOS && xcodebuild test -project Ortho-iOS.xcodeproj -scheme Ortho-iOS \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' CODE_SIGNING_ALLOWED=NO -quiet
# Sandbox: push and watch
GH_TOKEN=placeholder gh run watch --exit-status
```

Expected: `ScanParserTests` green — every fixture in
`iOS/Ortho-iOS/Resources/ScanFixtures/` matches its `.expected.json` field-by-field
(SC-001, SC-002 counts, SC-005 payment rows, FR-014 FX, FR-015 duplicates), and all 7
existing parity suites still green with **zero golden-vector diffs** (SC-007).

## 3. Flow verification via CI screenshots (US4)

Download the `simulator-screenshots` artifact
(`gh api repos/Ayaz2589/Ortho/actions/runs/<run>/artifacts` → `.../artifacts/<id>/zip`).

Checklist per [contracts/uidemo-scan.md](./contracts/uidemo-scan.md):

- [ ] `<lang>-scan-receipt.png` ×6: prefilled amount/merchant/date, `Guessed` markers,
      duplicate caption, "Filled from scan" caption — all translated, no overflow
- [ ] `en|bn|ja-scan-interstitial.png`: row/duplicate/payment counts, toggle ON
- [ ] `en|bn|ja-scan-row.png`: progress header "1 of N", Add and next / Skip / Stop
- [ ] `en|bn|ja-scan-summary.png`: added/skipped/left-out line
- [ ] বাংলা shots use Latin digits

## 4. Live checks (operator on Mac — the parts CI can't see)

1. Simulator or device, DEBUG, signed in: `+` → **Scan** → each source (Camera on
   device / Photo Library / Files PDF) → receipt prefills / statement wizard runs;
   accepted rows appear in the list and in Supabase; Stop mid-wizard keeps prior adds
   (US2 #3).
2. Cancel each picker → form untouched (US1 #5). Deny camera permission → Photos/Files
   still work (edge case).
3. Airplane-mode parse: scan works fully offline; only the save errors with the
   standard alert + rollback (SC-004's no-network-parse, FR-009 rollback path).
4. Timing: clear receipt, Scan-tap → saved < 30 s, parse < 5 s (SC-003).
5. Apple-Intelligence device: no-history merchant gets a cleaned name/category
   suggestion; non-AI device: identical flow minus refinement (FR-018).

## 5. Documentation gates

- [ ] PARITY.md: scan divergence row + duplicate-key note (FR-022, research R6)
- [ ] docs/ios.md: Scan pipeline section + `-uiDemoScan` in the demo-mode docs
- [ ] CI-SETUP.local.md: screenshot matrix additions noted

## Success = spec Success Criteria

SC-001/002/005 → step 2 · SC-003/004 → step 4 · SC-006 → steps 1+3 · SC-007 → step 2.
