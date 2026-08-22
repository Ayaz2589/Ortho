import type { MetadataRoute } from 'next'
import { siteUrl } from '@/lib/siteUrl'

/**
 * spec 045 US4 — the app's first crawl rules (FR-023). A static Route Handler,
 * rendered to robots.txt at build (research.md §1).
 *
 * The `disallow` list is a crawl-advertising decision, NOT a security control — every
 * route named here is already behind authentication. Listing them keeps crawl budget
 * on the six pages that are meant to be found, and stops a crawler indexing an empty
 * pre-auth shell as thin content under the product's name.
 */
/**
 * Required under `output: 'export'`. The metadata conventions compile to Route
 * Handlers, and Next refuses to collect one for a static export unless it is
 * explicitly declared static — the build fails with "export const dynamic =
 * force-static … not configured on route /robots.txt" otherwise. The static-exports
 * guide documents that Route Handlers render statically, but not that this opt-in is
 * needed; it was found by building.
 */
export const dynamic = 'force-static'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/landing/',
      disallow: [
        '/dashboard',
        '/transactions',
        '/planning',
        '/housing',
        '/settings',
        '/routines',
        '/welcome',
        '/sign-in',
      ],
    },
    sitemap: `${siteUrl()}/sitemap.xml`,
  }
}
