/**
 * spec 045 — the one place an absolute site origin is resolved. `metadataBase`, the
 * per-locale canonical/alternate links and the sitemap all read it, so the three can
 * never disagree (FR-002).
 *
 * Resolution order mirrors the layered style of lib/app-env.ts:
 *   1. NEXT_PUBLIC_SITE_URL      — the marketing domain. NOT SET ANYWHERE YET (operator task).
 *   2. NEXT_PUBLIC_VERCEL_URL    — injected by Vercel; functional but deployment-specific,
 *                                  so canonicals would name a per-deploy host.
 *   3. http://localhost:3000     — documented development default.
 *
 * Read at CALL time rather than module scope so tests can vary the environment. Next
 * inlines `process.env.NEXT_PUBLIC_*` at build time either way, which is what a static
 * export needs.
 */

import type { LandingSlug } from './onboarding/locales'

const DEV_DEFAULT = 'http://localhost:3000'

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

/** Absolute origin, never with a trailing slash (so joined paths can't double up). */
export function siteUrl(): string {
  const explicit = clean(process.env.NEXT_PUBLIC_SITE_URL)
  if (explicit) return explicit.replace(/\/+$/, '')

  const vercel = clean(process.env.NEXT_PUBLIC_VERCEL_URL)
  // Vercel supplies a bare host with no scheme.
  if (vercel) return `https://${vercel.replace(/\/+$/, '')}`

  return DEV_DEFAULT
}

/** Absolute URL for a landing page. The only way landing URLs should be built. */
export function landingUrl(slug: LandingSlug): string {
  return `${siteUrl()}/landing/${slug}`
}
