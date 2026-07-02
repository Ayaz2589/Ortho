# Contract: Cross-Catalog Translation Parity

**Locked by**: `web/test/i18n/catalog-parity.test.ts` (NEW, Vitest — runs on-sandbox)

The suite reads `iOS/Ortho-iOS/Localizable.xcstrings` (plain JSON on disk) and the five web
catalogs, and asserts:

## C1. iOS coverage (FR-001, SC-001)

For every key in the xcstrings where `shouldTranslate !== false`:
- a `localizations` entry exists for each of `bn`, `es`, `ja`, `ko`, `zh-Hans`;
- its `stringUnit.state === 'translated'` (plural variations: every branch translated);
- its value is non-empty and differs from bare placeholder-only content when the en value has
  translatable words (guards against copy-through "translations").

## C2. Shared-key identity (FR-002)

For every web catalog key that also exists in the xcstrings: the iOS value for the mapped
language equals the web value after placeholder normalization (en key's `%@`/`%lld`/`%n$@`
sequence ↔ `{0}…{n}` positionally). Reported per-language with the offending key on failure.

## C3. Latin digits under বাংলা (FR-003)

- Web: `localeForLanguage('বাংলা') === 'bn-BD-u-nu-latn'` (already tested in
  desktop-parity.test.tsx — kept there, referenced here).
- iOS: `AppLanguage.swift` bn locale string contains `@numbers=latn` — asserted by reading the
  Swift source as text from the catalog-parity suite (cheap, honest lock: the file is the
  contract) AND translated bn values must not contain Bengali digit codepoints (U+09E6–U+09EF).

## C4. Web catalog structure (US6 guard)

- Every catalog contains the `— web-only keys —` marker; iOS-seeded block keys ⊆ xcstrings keys.
- Every `t('…')` literal key used in `web/` source resolves in every catalog (no English
  fallback in non-English languages) — extracted by scanning `t(` call sites with literal
  first args.

## Failure mode

Each assertion failure names: language, key, both values. The suite is the *definition* of
"translated" for this feature — the iOS CI build compiling the catalog plus per-language
screenshots are the rendering evidence, not the coverage gate.
