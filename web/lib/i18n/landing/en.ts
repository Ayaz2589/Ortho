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
// --- end spec 047 ---

export default en
