# Phase 1 Data Model: Onboarding Foundation (spec 045)

This feature adds **no database table, no column, and no migration**. Everything below is either a
build-time constant or a per-device browser value. Included for completeness because both shapes are
contracts that features 046/047/048 depend on.

---

## 1. `LandingLocale` — the registry entry (build-time constant)

The feature's central contract. Defined once in `web/lib/onboarding/locales.ts`; every other
consumer derives from it (FR-001, FR-002).

| Field | Type | Description |
|---|---|---|
| `slug` | `'en' \| 'es' \| 'bn' \| 'ja' \| 'zh' \| 'ko'` | Address segment. Appears in `/landing/{slug}`, in the sitemap, and as the `hreflang` value. ASCII, lowercase, stable — changing one breaks live ad links. |
| `language` | `Language` | The app's **existing** language option from `web/lib/language.ts` (`'English' \| 'Español' \| 'বাংলা' \| '日本語' \| '简体中文' \| '한국어'`). What language adoption writes to `localStorage`. |
| `locale` | `string` | BCP-47 tag for the document's `lang` attribute and `hreflang`. Taken from the existing `LOCALE_BY_LANGUAGE` map — never restated. |

### The six entries

| `slug` | `language` | `locale` |
|---|---|---|
| `en` | `English` | `en-US` |
| `es` | `Español` | `es-ES` |
| `bn` | `বাংলা` | `bn-BD-u-nu-latn` |
| `ja` | `日本語` | `ja-JP` |
| `zh` | `简体中文` | `zh-Hans` |
| `ko` | `한국어` | `ko-KR` |

> `bn`'s locale keeps the existing `-u-nu-latn` extension — a deliberate choice already made in
> `web/lib/language.ts` (matching iOS: Bengali uses Latin digits for money and dates). The registry
> reuses that value rather than inventing a plain `bn-BD`.

### Validation rules

- **Exhaustive over the app's languages.** Every `Language` except `System` MUST have exactly one
  registry entry. `System` is a *preference* meaning "follow the browser", not a destination — it has
  no address and MUST NOT appear. A test asserts this both ways, so adding a seventh app language
  without a landing page fails loudly.
- **Slugs unique**, lowercase ASCII, no percent-encoding required.
- **`locale` values MUST equal** `LOCALE_BY_LANGUAGE[language]` — asserted by test, so the two maps
  can never drift.
- `en` is the designated fallback for unsupported/absent browser languages and the `x-default`
  target.

### Derived operations

| Operation | Behavior |
|---|---|
| `landingSlugs()` | The six slugs, stable order (`en` first). Drives `generateStaticParams()` and the sitemap. |
| `localeForSlug(slug)` | Registry entry, or `undefined` for an unknown slug. |
| `detectLandingSlug(navigatorLanguage?)` | Browser tag → slug. Delegates to the existing `effectiveLanguage()` (which already lowercases, splits on `-`, and collapses regional variants), then maps `Language` → slug. Returns `'en'` for `System`-resolved-English, unsupported tags, and absent input. Never throws. |

---

## 2. Funnel marker (per-device browser value)

`web/lib/onboarding/funnel.ts`. Mirrors the shape of
`web/components/announcements/announcementsSeen.ts` and `web/components/settings/textSize.ts`.

| Property | Value |
|---|---|
| Storage | `localStorage` |
| Key | `ortho.onboardingFunnel` |
| Value | `'1'` when set; key absent when not |
| Scope | Per device, per browser profile. Never synced, never sent to a server. |
| Personal data | **None.** A single presence bit — no identifier, no timestamp, no locale, no path. |

### Operations

| Operation | Behavior |
|---|---|
| `markFunnelEntry()` | Set the key. Silently no-op when storage is unavailable. |
| `readFunnelEntry()` | `true` only when the key holds exactly `'1'`. `false` for absent, malformed, or unreadable. |
| `clearFunnelEntry()` | Remove the key. Silently no-op when storage is unavailable. |

### Lifecycle across features

```
047 (tour)        markFunnelEntry()   ← final slide CTA *and* Skip both set it
      ↓
    sign-in
      ↓
048 (hand-off)    readFunnelEntry()   → true: route to the questionnaire
                  clearFunnelEntry()  ← immediately after acting, so it fires once
```

**This feature ships the module and its tests only.** Per FR-019 it neither sets nor reads the
marker in any code path — 045 owns the contract, 047 owns setting it, 048 owns acting on it. A test
asserts no production module outside `lib/onboarding/` imports it yet.

### Validation rules

- Every operation MUST tolerate `localStorage` throwing (private browsing, storage disabled,
  quota) without propagating — routing and rendering continue unaffected (FR-015 for adoption; the
  same discipline applies here).
- `readFunnelEntry()` MUST be strict about the value, so an unrelated key collision or a truncated
  write reads as "not set" rather than triggering a hand-off the user never earned.

---

## 3. Language adoption (writes an existing value)

`web/lib/onboarding/adoptLanguage.ts`. Introduces **no new stored shape** — it writes the app's
existing `language` key, the same one `web/app/(app)/settings/language/page.tsx` and the store
already read.

| Property | Value |
|---|---|
| Key | `language` (existing) |
| Written value | The registry entry's `Language` — e.g. `'Español'`, not the slug |

| Operation | Behavior |
|---|---|
| `adoptLandingLanguage(slug)` | Look up the entry; write `entry.language` to the `language` key. Unknown slug → no write. Storage unavailable → silent no-op (FR-015). |

**Invoked only on an explicit continue action**, never on page view (FR-014) — so a returning user
who opens a shared link in another language keeps their stored preference unless they choose to go
on. This feature provides the function; 046 wires it to the real CTAs.

---

## 4. Site origin (build-time configuration)

`web/lib/siteUrl.ts`. Not stored data — resolved at build time and baked into the static export.

| Source | Precedence | Notes |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | 1 | The marketing domain. **Operator task** — not yet set anywhere. |
| `https://` + `NEXT_PUBLIC_VERCEL_URL` | 2 | Injected by Vercel; functional but deployment-specific. |
| `http://localhost:3000` | 3 | Documented development default. |

Returns an absolute origin with no trailing slash. Used by `metadataBase`, the per-locale
`alternates`, and the sitemap — one resolution point, so the three can never disagree (FR-002).

---

## Entity relationships

```
LandingLocale (×6, build-time)
   ├─ slug ──────► /landing/{slug} route      (generateStaticParams)
   ├─ slug ──────► sitemap entry + hreflang   (with siteUrl)
   ├─ locale ────► <html lang> + alternates
   └─ language ──► localStorage `language`    (adoptLandingLanguage, on continue only)

Funnel marker (per-device)   — written by 047, read+cleared by 048, defined here
```
