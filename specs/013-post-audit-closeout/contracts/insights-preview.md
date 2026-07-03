# Contract: Recurring-Preview Ordering & Outlier Date Locale

## Recurring preview (FR-007)

**Canonical behavior (iOS today, both after this feature)**:
1. Detected recurring merchants sort by monthly amount **descending**;
2. ties break by case-insensitive merchant name **ascending** (NEW on both surfaces — today iOS
   ties are unstable and web is unordered);
3. each merchant's display casing comes from its **most recent** transaction;
4. preview = first 3, joined `", "`, with the localized `+ %lld more` suffix beyond 3.

**Changes**: web `lib/finance/insights.ts:209-231` (adopt 1–3; currently Map-order + oldest
casing). iOS `Services/InsightEngine.swift:323` (add tie-break only; rest already canonical).

**Vector lock**: `insights.json` `expected[]` gains `preview_merchants: string[]` (ordered,
cased). Generator: `web/scripts/gen-vectors.ts:220-225` map extended. Asserted by
`web/test/insights.parity.test.ts` and `iOS/Ortho-iOSTests/InsightParityTests.swift`. Vector
scenarios must include: an amount tie between two merchants with distinct casings, and a
merchant whose casing changed across transactions. Existing fields
(`id`/`severity`/`category`/`magnitude_cents`) must be byte-identical after regeneration
(FR-008) — diff reviewed before commit.

## Outlier date locale (FR-008)

**Web change** (`lib/finance/insights.ts:267-269`): `generateInsights` gains a `locale: string`
input (threaded from the store's `localeForLanguage` value, the same source all other web
formatting uses); the outlier `Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' })`
replaces the `'en-US'` hardcode. iOS already uses pattern `MMM d` + `Localizer.currentLocale` —
unchanged.

**Determinism guard**: vector generation and parity tests pass `'en-US'` explicitly, so
`insights.json` stays language-neutral and unchanged by this parameter. A new web unit test
asserts a non-English locale yields that locale's month rendering (e.g. `es` → `may`/`jun`
forms) and that the store threads its locale through (jsdom render of InsightsCardStack under
Español shows no `en-US` month token).
