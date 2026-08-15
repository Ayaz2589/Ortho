import type { MetadataRoute } from 'next'
import { landingSlugs, localeForSlug } from '@/lib/onboarding/locales'
import { landingUrl } from '@/lib/siteUrl'

/**
 * spec 045 US4 — the site's machine-readable index (FR-022).
 *
 * A static Route Handler: `next build` renders it to sitemap.xml, which is supported
 * under output: 'export' (research.md §1).
 *
 * Only the six landing pages are listed. Every signed-in destination is deliberately
 * absent — indexing an empty pre-auth shell would be thin content, and the pages behind
 * authentication have nothing to offer a crawler.
 */
/** Required under `output: 'export'` — see the note in app/robots.ts. */
export const dynamic = 'force-static'

export default function sitemap(): MetadataRoute.Sitemap {
  // Alternates are identical for every entry: each landing page is the same page in a
  // different language, so all six point at each other, and x-default points at
  // English — the same fallback the root router uses for an unsupported browser
  // language, so crawlers and visitors agree.
  const languages: Record<string, string> = { 'x-default': landingUrl('en') }
  for (const slug of landingSlugs()) {
    languages[localeForSlug(slug)!.locale] = landingUrl(slug)
  }

  // Mapped from the registry, never hand-listed — adding a seventh language must not
  // require an edit here (SC-006).
  return landingSlugs().map((slug) => ({
    url: landingUrl(slug),
    alternates: { languages },
    // `lastModified` is intentionally omitted. A build-time `new Date()` would change
    // on every deploy without the content changing — churning the sitemap and making
    // the build non-deterministic.
  }))
}
