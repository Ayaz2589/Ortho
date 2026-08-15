import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { TourDeck } from '@/components/tour/TourDeck'
import { landingSlugs, localeForSlug } from '@/lib/onboarding/locales'
import { TOUR_CATALOGS, tourCatalog } from '@/lib/i18n/landing/tour'

/**
 * spec 047 — the learn-more tour, one address per language.
 *
 * The codebase's SECOND server component, and for the same reason as the first: Next only
 * permits a `metadata` export from a server component. It stays as thin as
 * app/landing/[locale]/page.tsx — static params, metadata, and one client child that
 * holds all the behavior.
 *
 * ONE dynamic route, not six folders: adding a seventh language must remain a single edit
 * to LANDING_LOCALES. And one document per LANGUAGE, not per screen — the five screens
 * live in client state, so the static export stays at six documents rather than thirty
 * (research.md §2).
 */

/** One statically exported document per registry slug. Never a hand-written list. */
export function generateStaticParams() {
  return landingSlugs().map((locale) => ({ locale }))
}

/**
 * No server exists at runtime under output: 'export', so an unlisted slug is excluded at
 * build rather than resolved on demand — the static host serves the 404 document, and
 * app/not-found.tsx renders it. Its redirect is deliberately scoped to /landing/, so an
 * unknown tour slug lands on the calm not-found page rather than being thrown out to
 * marketing.
 */
export const dynamicParams = false

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const copy = tourCatalog(locale)

  return {
    // The first screen's title is the page's title: it is already the one-line answer to
    // "what is this", written and translated, and a second string would be a second
    // thing to keep true.
    title: copy.screens[0].title,
    // Not indexed (research.md §7). The tour is step two of a journey — a searcher
    // dropped into screen 1 has skipped the page that explains what Ortho is, and six
    // more indexable documents would compete with the six landing pages for the same
    // queries. `follow` stays on so crawlers still traverse onward. Correspondingly, no
    // canonical/hreflang alternates: those exist to help a search engine choose between
    // languages, and a noindex page has no result to choose.
    robots: { index: false, follow: true },
  }
}

export default async function TourPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  const entry = localeForSlug(locale)
  // Unreachable in a static export (dynamicParams: false already excluded it) — but the
  // type says `string`, and a silent English fallback would be worse than honest.
  if (!entry) notFound()

  // Statically resolved, so the first painted frame is already in the right language
  // (FR-008). A dynamic import here would reintroduce the English flash the funnel's
  // separate catalogs exist to prevent.
  return <TourDeck locale={entry} copy={TOUR_CATALOGS[entry.slug]} />
}
