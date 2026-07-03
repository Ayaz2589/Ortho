# Data Model: Post-Audit Closeout

**Feature**: `013-post-audit-closeout` | **Date**: 2026-07-02

No new database tables or columns. The feature manipulates four data shapes:

## 1. String catalog entry (iOS `.xcstrings` ↔ web `i18n/*.ts`)

**iOS side** (`iOS/Ortho-iOS/Localizable.xcstrings`, JSON):

| Field | Type | Rules |
|---|---|---|
| key | string (en source text) | Identity across catalogs. iOS placeholders: `%@`, `%lld`, `%1$@`… |
| `localizations.<lang>.stringUnit.state` | `"translated"` \| `"new"` | Goal state: `"translated"` for bn/es/ja/ko/zh-Hans on every translatable key |
| `localizations.<lang>.stringUnit.value` | string | Must equal web catalog value for shared keys after placeholder normalization |
| `shouldTranslate` | bool (optional) | Set `false` for symbol/numeral keys (`·`, `1Y`, `0.00`…) — excluded from coverage counts |
| `.variations.plural` | object (optional) | Plural keys (`Detected %lld recurring charges`) — every language needs each plural branch |

**Web side** (`web/lib/i18n/{bn,es,ja,ko,zh}.ts`): `Record<string, string>`, positional
placeholders `{0}`, `{1}`. File layout invariant: iOS-seeded block, then `— web-only keys —`
marker, then web-only block.

**Normalization relation (the parity contract)**: iOS value ≡ web value after mapping the en
key's specifier sequence (`%@`/`%lld`/`%n$@`) positionally onto `{0}…{n}`. Languages map
`bn↔বাংলা`, `es↔Español`, `ja↔日本語`, `zh-Hans↔简体中文`, `ko↔한국어`.

**States**: `missing` (no localizations entry) → `new` → `translated`. This feature moves all
87 missing / 6 new to `translated` or `shouldTranslate:false`.

## 2. Legacy transaction row (live `transactions` table)

| Field | Type | Role in repair |
|---|---|---|
| `id` | uuid | Row identity; only key echoed in the report |
| `date` | timestamptz | **Only column ever written.** Selector: UTC time-of-day ≠ 12:00:00 AND in `[00:00, 04:00)Z`. |
| all other columns | — | Read for the report (merchant, amount) but never modified |

**Derived (report-only) fields**:

| Field | Derivation |
|---|---|
| `inferredLocalDay` | `Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' })` of `date` (yields the NY calendar day, normally the UTC day − 1 for the window) |
| `proposedDate` | `${inferredLocalDay}T12:00:00.000Z` |
| `ambiguous` | true when NY wall-clock time ∈ [00:00, 01:00) — could be a genuine just-after-midnight entry; excluded from APPLY, listed for the operator |

**State transitions**: `legacy` → (dry-run: unchanged, reported) → (APPLY: `repaired`, date =
proposedDate) → selector no longer matches (idempotence). `ambiguous` rows only transition via
explicit operator per-row decision (out of automated scope).

## 3. Golden vector cases (extended files, both regenerated — never hand-edited)

**`dashboard-month-scope.json`** gains section `availableRanges`:

```jsonc
{
  "availableRanges": [
    {
      "input": { "name": "empty history", "dates": [], "now": "2026-07-02T12:00:00.000Z" },
      "expected": ["thisMonth"]
    },
    {
      "input": { "name": "13-month span", "dates": ["2025-06-15T12:00:00.000Z", "…"], "now": "…" },
      "expected": ["thisMonth", "last3Months", "last6Months", "last12Months"]
    }
    // cases: empty · single month · 2/5/11/12/13-month spans · gap months · year boundary · future-dated tx
  ]
}
```

`dates` are transaction date strings only (the function reads nothing else); `expected` is the
ordered range list (`DashboardRange` raw values shared by TS union and Swift enum).

**`insights.json`** `expected[]` entries gain one field:

| Field | Type | Rules |
|---|---|---|
| `preview_merchants` | `string[]` (0–3) | Present on recurring insights: merchants ordered by monthly amount desc, ties by case-insensitive name asc; casing from each merchant's most recent transaction. Empty array on non-recurring insights (or omitted — generator decides once, both suites assert the same shape). |

Existing pinned fields (`id`, `severity`, `category`, `magnitude_cents`) are unchanged (FR-008).

## 4. Deploy credential (GitHub Actions secrets — names only, values never in repo)

| Secret | Content | Source |
|---|---|---|
| `ASC_ISSUER_ID` | App Store Connect API issuer ID | ASC → Users and Access → Integrations |
| `ASC_KEY_ID` | API key ID | same page |
| `ASC_PRIVATE_KEY` | `.p8` contents | downloadable once at key creation |
| `DIST_CERT_P12` | base64 Apple Distribution cert | Keychain / developer.apple.com |
| `DIST_CERT_PASSWORD` | cert password | user-chosen |

**Presence contract**: the deploy workflow's `preflight` job evaluates each secret and fails
naming **every** missing one (not just the first). The public repo never receives values;
`docs/deploy.md` documents acquisition steps only.

## 5. CLI filter criteria (aligned shape — no schema change)

CLI `tx list` flags map onto the apps' `FilterCriteria`
(`web/lib/transactionFilters.ts:7-17`): `--query` → `query`; repeatable/comma `--category` →
`categories[]`; `--kind` → `kind`; repeatable `--source` → `sources[]`; `--owner` (name-resolved
via `db/lookups.ts`) → `owners[]`; `MONTH` → `dateFrom`/`dateTo` via shared `monthBounds`.
Server query keeps only the date window + household scope; everything else evaluates through
shared `filterTransactions`. `CATEGORY_LIST` derives from the new exported const in
`web/lib/types.ts` (`TransactionCategory` type derived `typeof CATEGORY_LIST[number]`).
