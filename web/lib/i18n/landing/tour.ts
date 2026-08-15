/**
 * spec 047 — the learn-more tour's copy, and the ONLY place its shape is declared.
 *
 * Why the tour is a sibling export rather than a `LandingCatalog` field: FR-009 requires
 * all tour copy to live inside the `spec 047` reserved region of each locale file, and
 * that region sits *below* the `const en: LandingCatalog = { … }` literal. A field would
 * therefore have to be written outside the markers — the one thing the markers exist to
 * prevent. A named export per locale is the only shape that puts 100% of the copy inside
 * them (research.md §3).
 *
 * The knock-on benefit is that lib/i18n/landing/index.ts and the LandingCatalog
 * interface are untouched by this feature. Spec 046 edits those freely; the two branches
 * merge in either order with nothing to resolve.
 *
 * The per-locale files carry NO type annotation and NO import — the structural check
 * happens here, where TOUR_CATALOGS is declared as Record<LandingSlug, TourCopy>. A
 * missing or misspelled key in any locale is a compile error at this file.
 */

import type { LandingSlug } from '../../onboarding/locales'
import { enTour } from './en'
import { esTour } from './es'
import { bnTour } from './bn'
import { jaTour } from './ja'
import { zhTour } from './zh'
import { koTour } from './ko'

export interface TourScreen {
  /** One short line naming what this screen is about. */
  title: string
  /** Two sentences at most, second-person, describing a capability that ships today. */
  body: string
}

export interface TourCopy {
  /** Ordered; the array order is the tour order. Always TOUR_SCREEN_COUNT long. */
  screens: readonly TourScreen[]
  /** Advance control, on every screen but the last. */
  next: string
  /** Back control, on every screen but the first. */
  back: string
  /** Skip control — on EVERY screen (FR-004). */
  skip: string
  /** The last screen's advance control, which exits to sign-in. */
  finish: string
  /** Position template with positional placeholders: {0} current, {1} total. */
  position: string
  /** Accessible name for the deck region. */
  regionLabel: string
}

/**
 * Five is the cap FR-002 sets, and the deck is exactly at it. Exported so the guard test
 * asserts against the constant rather than a re-stated literal.
 */
export const TOUR_SCREEN_COUNT = 5

/**
 * Slug-keyed static map. Statically imported (never `import()`) so the deck's first
 * painted frame is already in the visitor's language — the same first-paint rule that
 * gave the funnel its own catalogs in the first place (FR-008).
 */
export const TOUR_CATALOGS: Record<LandingSlug, TourCopy> = {
  en: enTour,
  es: esTour,
  bn: bnTour,
  ja: jaTour,
  zh: zhTour,
  ko: koTour,
}

/** The tour copy for a slug, falling back to English for an unrecognized one. */
export function tourCatalog(slug: string): TourCopy {
  return TOUR_CATALOGS[slug as LandingSlug] ?? TOUR_CATALOGS.en
}
