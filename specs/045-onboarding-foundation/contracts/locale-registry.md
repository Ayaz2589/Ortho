# Contract: Locale Registry & Onboarding Modules

**Module**: `web/lib/onboarding/locales.ts`, `funnel.ts`, `adoptLanguage.ts`; `web/lib/siteUrl.ts`

These are the interfaces features 046, 047 and 048 build against. Treat them as frozen once this
feature merges — three parallel branches consume them.

---

## `lib/onboarding/locales.ts`

```ts
export type LandingSlug = 'en' | 'es' | 'bn' | 'ja' | 'zh' | 'ko'

export interface LandingLocale {
  slug: LandingSlug
  language: Language      // from '@/lib/language' — NOT redefined here
  locale: string          // === LOCALE_BY_LANGUAGE[language]
}

/** The registry. Stable order, 'en' first. THE single source of truth (FR-001). */
export const LANDING_LOCALES: readonly LandingLocale[]

/** Just the slugs, same order. Drives generateStaticParams() and the sitemap. */
export function landingSlugs(): readonly LandingSlug[]

/** Registry lookup. `undefined` for an unrecognized slug — callers decide the fallback. */
export function localeForSlug(slug: string): LandingLocale | undefined

/**
 * Browser language tag → slug. Delegates to effectiveLanguage() from '@/lib/i18n'
 * so regional-variant collapsing is not reimplemented (research §7).
 * Returns 'en' for unsupported, unrecognized, or absent input. Never throws.
 */
export function detectLandingSlug(navigatorLanguage?: string | null): LandingSlug
```

### Behavioral guarantees

| Input to `detectLandingSlug` | Result | Why |
|---|---|---|
| `'es-ES'`, `'es-MX'`, `'es'` | `'es'` | Regional variants collapse to base |
| `'zh-TW'`, `'zh-Hans'`, `'zh'` | `'zh'` | Matches the app's existing single-Chinese behavior |
| `'pt-BR'`, `'fr-FR'`, `'de'` | `'en'` | Unsupported → English fallback |
| `''`, `null`, `undefined` | `'en'` | Absent → English fallback |
| `'EN-us'` (odd casing) | `'en'` | Case-insensitive, per `effectiveLanguage()` |

### Invariants (each pinned by a test)

1. `LANDING_LOCALES.length === 6`.
2. Exactly one entry per app `Language` except `System`; `System` never appears.
3. All slugs unique, lowercase ASCII.
4. For every entry, `locale === LOCALE_BY_LANGUAGE[language]` — the two maps cannot drift.
5. `landingSlugs()[0] === 'en'` — the fallback and `x-default` target is first.
6. `detectLandingSlug()` never throws for any string input.

> **Adding a seventh language** must require editing only `LANDING_LOCALES` (plus adding its app
> `Language` and catalog, which are pre-existing concerns). Route, sitemap entry, and alternates all
> follow. Invariant 2 makes forgetting one a test failure, not a silent gap (SC-006).

---

## `lib/onboarding/funnel.ts`

```ts
/** Record that this device travelled the onboarding journey. Called by 047. */
export function markFunnelEntry(): void

/** True only when the marker is present and well-formed. Called by 048. */
export function readFunnelEntry(): boolean

/** Remove the marker. Called by 048 immediately after acting on it. */
export function clearFunnelEntry(): void
```

- Key `ortho.onboardingFunnel`, value `'1'`. No personal data (FR-018).
- Every function tolerates `localStorage` throwing — no propagation, no crash (private browsing).
- `readFunnelEntry()` is strict: anything other than exactly `'1'` reads `false`.
- **This feature calls none of them in production code** (FR-019).

---

## `lib/onboarding/adoptLanguage.ts`

```ts
/**
 * Adopt a landing locale's language as the visitor's stored preference, so
 * sign-in and the app continue in it. Writes the app's EXISTING `language` key.
 * Unknown slug → no write. Storage unavailable → silent no-op (FR-015).
 * MUST be called only on an explicit continue action, never on page view (FR-014).
 */
export function adoptLandingLanguage(slug: string): void
```

Writes `LandingLocale.language` (e.g. `'Español'`), **not** the slug — the app's language machinery
reads `Language` values, and writing a slug would silently fall back to the default via
`asLanguage()`.

---

## `lib/siteUrl.ts`

```ts
/** Absolute origin, no trailing slash. Resolution order in research §8. */
export function siteUrl(): string

/** Absolute URL for a landing slug: `${siteUrl()}/landing/${slug}`. */
export function landingUrl(slug: LandingSlug): string
```

Single resolution point for `metadataBase`, per-route `alternates`, and the sitemap, so the three
cannot disagree (FR-002).

---

## Consumer map

| Consumer | Uses | Feature |
|---|---|---|
| `app/page.tsx` | `detectLandingSlug` | 045 |
| `app/landing/[locale]/page.tsx` | `landingSlugs`, `localeForSlug`, `landingUrl` | 045 |
| `app/landing/page.tsx` | `detectLandingSlug` | 045 |
| `app/not-found.tsx` | `detectLandingSlug` | 045 |
| `app/sitemap.ts` | `landingSlugs`, `landingUrl` | 045 |
| `app/layout.tsx` | `siteUrl` (metadataBase) | 045 |
| Landing CTAs | `adoptLandingLanguage` | **046** |
| Tour final slide + Skip | `markFunnelEntry` | **047** |
| Post-sign-in hand-off | `readFunnelEntry`, `clearFunnelEntry` | **048** |
