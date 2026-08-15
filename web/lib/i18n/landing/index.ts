/**
 * spec 045 — funnel-only translation catalogs, deliberately separate from the app
 * catalogs in lib/i18n/*.ts.
 *
 * Why separate (research.md §3): a landing page's locale is fixed by its URL, so its
 * text must be correct on FIRST PAINT (FR-009). `useTranslate` resolves its catalog
 * after mount and returns English until then — fine for the app, wrong for a
 * locale-fixed marketing page. The fix is a static import, but the app catalogs are
 * 32–55 KB each (bn.ts alone is 54 KB), and a marketing page reached from an ad on
 * mobile is the worst place to pay that. These catalogs hold a few dozen strings.
 *
 * Consequence: funnel copy NEVER goes in lib/i18n/{bn,es,ja,zh,ko}.ts. Features 046
 * and 047 add their strings inside the reserved marker regions in each file here,
 * which are far enough apart that two branches merge without conflict (research §9).
 */

import type { LandingSlug } from '../../onboarding/locales'
import en from './en'
import es from './es'
import bn from './bn'
import ja from './ja'
import zh from './zh'
import ko from './ko'

/** spec 046 — one supporting idea beneath the proposition. */
export interface LandingPoint {
  /** Short label. A phrase, not a sentence. */
  title: string
  /** One or two plain sentences expanding the title. */
  body: string
}

/**
 * spec 046 — one locale's marketing positioning, and the only thing a market needs to
 * rewrite to speak differently. Editing a locale's block must touch no other locale
 * and no component (SC-005).
 */
export interface LandingCopy {
  /** The proposition. Largest text on the page, and the first thing read. */
  headline: string
  /** One sentence expanding the headline. */
  subhead: string
  /**
   * Supporting ideas, rendered in order.
   *
   * AN ARRAY, DELIBERATELY — do not "simplify" this to point1/point2/point3. US3
   * requires a market to be able to ship a different NUMBER of supporting ideas
   * without a per-locale branch in the component, and the map over this array is the
   * entire mechanism by which that holds. All six locales ship three today; that is a
   * content decision, not a structural one.
   */
  points: LandingPoint[]
  /** Label on the prominent action leading to /tour/{slug}. */
  primaryCta: string
  /** The quiet line before the sign-in link, e.g. "Already have an account?". */
  secondaryPrompt: string
  /** Label on the sign-in link. Matches the app catalogs' existing "Sign in" wording. */
  secondaryCta: string
}

export interface LandingCatalog {
  /** <title> for this locale's entry point. */
  metaTitle: string
  /** <meta name="description"> for this locale's entry point. */
  metaDescription: string
  /** not-found.tsx body. Pre-auth, so it cannot use the store's `t()`. */
  notFoundLine: string
  /** not-found.tsx back-affordance label. */
  notFoundCta: string
  /**
   * This locale's marketing page copy (spec 046). Required: a locale that reached the
   * registry without words would render an empty front door.
   */
  landing: LandingCopy
}

/**
 * Slug-keyed static map. Statically imported (not `import()`) so a landing route
 * renders its own language on the first frame with no post-mount swap.
 */
export const LANDING_CATALOGS: Record<LandingSlug, LandingCatalog> = {
  en,
  es,
  bn,
  ja,
  zh,
  ko,
}

/** The catalog for a slug, falling back to English for an unrecognized one. */
export function landingCatalog(slug: string): LandingCatalog {
  return LANDING_CATALOGS[slug as LandingSlug] ?? LANDING_CATALOGS.en
}
