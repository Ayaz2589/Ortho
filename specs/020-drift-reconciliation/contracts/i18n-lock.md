# Contract: i18n Catalog Parity & Lock Hardening (P5)

## Catalog reorganization
- In each of `web/lib/i18n/{bn,es,ja,zh,ko}.ts`, every key that also exists in iOS `Localizable.xcstrings` MUST sit **above** the `— web-only keys —` marker (shared block); only keys with no iOS counterpart go below.
- Move the ~34 iOS-shared keys currently below the marker (e.g. "Settle up", "Balances", "Paid by") back above it.
- `es.ts`: move `Color`/`Total` above the marker and add the missing `Euro`/`Local`/`Personal` seed keys so its shared-key set matches the other four catalogs.
- Values unchanged (English fallbacks preserved) — this is a structural/partition fix, not a translation change.

## Lock hardening — `web/test/i18n/catalog-parity.test.ts`
- **New assertion**: for each catalog, the below-marker (web-only) key set is **disjoint** from the iOS xcstrings key set. Fails if any iOS-shared key is placed below the marker (the current blind spot — the test only checked shared ⊆ xcstrings).
- Keep existing assertions (coverage, digit rules, call-site validity, shared-key identity).
- **Regression proof**: the test MUST fail if a shared key is deliberately mislabeled (demonstrated during implementation), then pass once catalogs are corrected.

## Coordination with P4
- The new "Occupied"/"Vacant"/"occupied unit rent" strings are shared keys (added to iOS xcstrings + above the marker in all 5 catalogs). They must land consistently so the hardened lock stays green.
