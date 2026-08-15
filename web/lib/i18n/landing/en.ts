import type { LandingCatalog } from './index'

// spec 045 — English landing copy. Small and statically imported: the app catalogs
// are 32–55 KB and resolve after mount, which would flash English on a locale-fixed
// page (research.md §3). Marketing copy proper arrives with feature 046.
const en: LandingCatalog = {
  metaTitle: 'Ortho — household finance, in order.',
  metaDescription:
    'A calm way to track spending, split costs and plan together. Built for households, in your language.',
  notFoundLine: 'We couldn\u2019t find that page.',
  notFoundCta: 'Go to Ortho',
  placeholderLine: 'Household finance, in order.',
}

// --- spec 046 landing copy — insert only between these markers ---
// --- end spec 046 ---

// --- spec 047 tour copy — insert only between these markers ---
// The English source the other five are translated from. Typed at ./tour.ts, not here,
// so this feature adds nothing outside the markers. Every screen names something that
// ships today (specs/047-learn-more-tour/data-model.md §3 lists the file backing each);
// no screen shows an example amount, which is the calmest way to satisfy the spec's
// money-formatting rule in six languages at once.
export const enTour = {
  screens: [
    {
      title: 'Everything you spend, in one place',
      body: 'Add what you spend and mark what’s shared. Ortho works out each person’s share, so nobody has to keep a running tally in their head.',
    },
    {
      title: 'Plan the month before it happens',
      body: 'Set a budget by category and put money aside for what’s coming. Ortho follows the pace and shows you what’s left to plan.',
    },
    {
      title: 'A steady read on where you stand',
      // Deliberately no dimension count: the engine went from five to six in spec 044,
      // so a number here would be a claim that rots.
      body: 'Answer a few questions and Ortho gives you one score covering cash flow, savings and what you’re committed to — with a next step, never a warning light.',
    },
    {
      title: 'Ortho notices what repeats',
      body: 'Subscriptions, rent, the same shop every week — recurring charges are found for you. Confirm the ones that are real and Ortho keeps track of them.',
    },
    {
      title: 'Yours, and your household’s',
      body: 'Ortho speaks six languages, and your numbers are visible only to the people you share a household with.',
    },
  ],
  next: 'Next',
  back: 'Back',
  skip: 'Skip',
  finish: 'Get started',
  position: '{0} of {1}',
  regionLabel: 'What Ortho does',
}
// --- end spec 047 ---

export default en
