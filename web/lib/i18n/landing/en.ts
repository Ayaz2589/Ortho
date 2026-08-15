import type { LandingCatalog, LandingCopy } from './index'

// spec 045 — English landing copy. Small and statically imported: the app catalogs
// are 32–55 KB and resolve after mount, which would flash English on a locale-fixed
// page (research.md §3).
const base = {
  metaTitle: 'Ortho — household finance, in order.',
  metaDescription:
    'See what your household spends, split what you share, and plan the month ahead. A calm, plainspoken money app — in your language.',
  notFoundLine: 'We couldn’t find that page.',
  notFoundCta: 'Go to Ortho',
}

// --- spec 046 landing copy — insert only between these markers ---
const landing: LandingCopy = {
  headline: 'Household finance, in order.',
  subhead:
    'A calm place for your household to see what it spends, split what it shares, and plan what comes next.',
  points: [
    {
      title: 'See where the money goes',
      body: 'Every expense in one place, grouped by day and by category — without a spreadsheet to keep up.',
    },
    {
      title: 'Split what you share',
      body: 'Rent, groceries, subscriptions. Divide shared costs between the people in your household and keep each person’s share clear.',
    },
    {
      title: 'Plan the month ahead',
      body: 'Budgets, savings goals and housing costs in one view, so you know what’s left before you spend it.',
    },
  ],
  primaryCta: 'See how it works',
  secondaryPrompt: 'Already have an account?',
  secondaryCta: 'Sign in',
}
// --- end spec 046 ---

// --- spec 047 tour copy — insert only between these markers ---
// --- end spec 047 ---

const en: LandingCatalog = { ...base, landing }

export default en
