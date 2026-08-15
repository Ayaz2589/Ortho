import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { LandingPlaceholder } from '@/components/landing/LandingPlaceholder'
import { landingSlugs, localeForSlug } from '@/lib/onboarding/locales'
import { landingCatalog, LANDING_CATALOGS } from '@/lib/i18n/landing'
import { landingUrl } from '@/lib/siteUrl'

/**
 * spec 045 US1/US4 — the six language entry points.
 *
 * This is the codebase's FIRST server component: every other page under app/ is
 * 'use client'. It has to be, because Next only permits a `metadata` export from a
 * server component, and per-locale titles/descriptions/hreflang are the whole point
 * of US4. It stays deliberately thin — static params, metadata, and one client child.
 *
 * ONE dynamic route, not six hand-written folders: SC-006 requires that adding a
 * seventh language be a single edit to LANDING_LOCALES, and six folders would make it
 * a list edit plus a new directory (research.md §4). Static export supports dynamic
 * routes exactly when generateStaticParams() is present.
 */

/** One statically exported document per registry slug. Never a hand-written list. */
export function generateStaticParams() {
  return landingSlugs().map((locale) => ({ locale }))
}

/**
 * No server exists at runtime under output: 'export', so an unlisted slug can't be
 * resolved on demand — it is excluded at build instead. Recovery for a stale ad link
 * is handled by app/not-found.tsx, which is the only place that path can be caught.
 */
export const dynamicParams = false

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const entry = localeForSlug(locale)
  const copy = landingCatalog(locale)
  if (!entry) return { title: copy.metaTitle, description: copy.metaDescription }

  // hreflang alternates for all six languages plus x-default, so a search in one
  // language surfaces that language's page rather than the English one (FR-020).
  // x-default points at English: the same fallback the root router uses for an
  // unsupported browser language, so crawlers and visitors agree.
  const languages: Record<string, string> = { 'x-default': landingUrl('en') }
  for (const other of landingSlugs()) {
    languages[localeForSlug(other)!.locale] = landingUrl(other)
  }

  return {
    title: copy.metaTitle,
    description: copy.metaDescription,
    alternates: { canonical: landingUrl(entry.slug), languages },
    openGraph: {
      title: copy.metaTitle,
      description: copy.metaDescription,
      url: landingUrl(entry.slug),
      locale: entry.locale,
      type: 'website',
    },
  }
}

export default async function LandingPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  const entry = localeForSlug(locale)
  // Unreachable in a static export (dynamicParams: false already excluded it) — but
  // the type says `string`, and a silent English fallback would be worse than honest.
  if (!entry) notFound()

  // Statically resolved: the catalog is in the initial chunk, so the first painted
  // frame is already in the right language (FR-009). A dynamic import here would
  // reintroduce exactly the English flash this design exists to avoid.
  return <LandingPlaceholder locale={entry} copy={LANDING_CATALOGS[entry.slug]} />
}
