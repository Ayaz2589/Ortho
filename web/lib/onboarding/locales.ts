/**
 * spec 045 — the landing-locale registry. THE single source of truth for the six
 * language entry points (FR-001/FR-002): the routes, the sitemap, the hreflang
 * alternates and the language hand-off all derive from `LANDING_LOCALES`, and
 * nothing else may restate the slug list.
 *
 * Adding a seventh language must be one edit here (SC-006). The route's
 * `generateStaticParams`, the sitemap entries and the alternate declarations all
 * follow automatically, and `test/onboarding/locales.test.ts` fails if the new
 * app `Language` has no entry — so the gap can't ship silently.
 *
 * This module deliberately does NOT reimplement browser-tag parsing. `effectiveLanguage()`
 * in lib/i18n already lowercases, splits on `-` and collapses regional variants
 * (es-MX → Español, zh-TW → 简体中文); duplicating that switch here would create a
 * second source of truth that drifts (research.md §7).
 */

import { localeForLanguage, type Language } from '../language'
// Imported from the leaf module, NOT from '../i18n': that barrel also exports
// `useTranslate` and so depends on React hooks, which a Server Component (the landing
// route) may not pull in. Same function either way.
import { effectiveLanguage } from '../i18n/effectiveLanguage'

/** Address segment for a landing page. ASCII, lowercase, stable — live ad links depend on it. */
export type LandingSlug = 'en' | 'es' | 'bn' | 'ja' | 'zh' | 'ko'

export interface LandingLocale {
  slug: LandingSlug
  /** The app's EXISTING language option — what language adoption writes to localStorage. */
  language: Exclude<Language, 'System'>
  /** BCP-47 tag for the document `lang` and `hreflang`. Always LOCALE_BY_LANGUAGE[language]. */
  locale: string
}

function entry(slug: LandingSlug, language: Exclude<Language, 'System'>): LandingLocale {
  // The locale is READ from lib/language.ts rather than written out again, so the two
  // can never disagree — including বাংলা's deliberate `-u-nu-latn` extension (Latin
  // digits for money and dates, matching iOS). `localeForLanguage` only consults the
  // browser for 'System', which the registry never contains.
  return { slug, language, locale: localeForLanguage(language) }
}

/**
 * The registry. `en` is first: it is the fallback for unsupported browser languages
 * and the `x-default` target, and several consumers rely on that position.
 */
export const LANDING_LOCALES: readonly LandingLocale[] = [
  entry('en', 'English'),
  entry('es', 'Español'),
  entry('bn', 'বাংলা'),
  entry('ja', '日本語'),
  entry('zh', '简体中文'),
  entry('ko', '한국어'),
] as const

/** Every slug, in registry order. Drives generateStaticParams() and the sitemap. */
export function landingSlugs(): readonly LandingSlug[] {
  return LANDING_LOCALES.map((e) => e.slug)
}

/** Registry lookup. `undefined` for an unrecognized slug — callers decide the fallback. */
export function localeForSlug(slug: string): LandingLocale | undefined {
  return LANDING_LOCALES.find((e) => e.slug === slug)
}

/**
 * Browser language tag → landing slug. Falls back to `en` for unsupported,
 * unrecognized or absent input, and never throws whatever it is handed — a visitor
 * must always reach a page (FR-006).
 *
 * Pass a tag explicitly in tests; omit it to read `navigator.language`.
 */
export function detectLandingSlug(navigatorLanguage?: string | null): LandingSlug {
  const language = effectiveLanguage('System', navigatorLanguage ?? undefined)
  return LANDING_LOCALES.find((e) => e.language === language)?.slug ?? 'en'
}
