// spec 042 — the reusable feature-announcement registry. Each entry declares a
// stable id, i18n keys for its title/description/CTA label, and the in-app route
// the CTA opens. Announcements are authored in code (part of the feature's PR) —
// there is no admin UI, scheduling, or targeting. The host shows the FIRST entry
// that is both unseen (per the localStorage ledger) and still relevant.
//
// This module is feature-agnostic; the only feature-specific coupling lives in a
// single entry's optional `isRelevant` predicate.

/** The minimal slice of app state a relevance predicate may read. */
export interface AnnouncementContext {
  /** The user's Financial Health profile row, or null when they have none. */
  userFinancialProfile: unknown | null
}

export interface Announcement {
  /** Stable, unique key; also the seen-ledger id. Never reuse an id. */
  id: string
  /** i18n key (English identity string) for the feature title. */
  titleKey: string
  /** i18n key for the one/two-sentence description. */
  descriptionKey: string
  cta: {
    /** i18n key for the CTA button label. */
    labelKey: string
    /** In-app route the CTA navigates to. */
    route: string
  }
  /**
   * Optional gate. Absent ⇒ always relevant. Lets a feature suppress its own
   * announcement once the feature has been engaged (e.g. Financial Health hides
   * its announcement once a profile exists).
   */
  isRelevant?: (ctx: AnnouncementContext) => boolean
}

/**
 * Ordered list of announcements. The first entry that is unseen AND relevant is
 * the one shown. Add a new feature's announcement by appending an entry here plus
 * its catalog strings — no changes to the host or the seen-ledger are needed.
 */
export const ANNOUNCEMENTS: Announcement[] = [
  {
    // spec 041 Financial Health — the first adopter of the pattern.
    id: 'financial-health',
    titleKey: 'Financial health',
    descriptionKey:
      "See how your money's doing with a calm 0–100 score — answer a few questions to start.",
    cta: { labelKey: 'Set up financial health', route: '/welcome/financial-profile' },
    // Only announce it to users who haven't set up their profile yet.
    isRelevant: (ctx) => ctx.userFinancialProfile == null,
  },
]
