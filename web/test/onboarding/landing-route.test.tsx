// @vitest-environment jsdom
// spec 045 US1 — the six landing entry points. One dynamic route with
// generateStaticParams (NOT six hand-written folders) so adding a seventh language
// stays a single registry edit (SC-006, research.md §4).
import { describe, it, expect } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach } from 'vitest'

import Page, { generateStaticParams, dynamicParams } from '@/app/landing/[locale]/page'
import { LandingPlaceholder } from '@/components/landing/LandingPlaceholder'
import { landingSlugs, localeForSlug } from '@/lib/onboarding/locales'
import { LANDING_CATALOGS } from '@/lib/i18n/landing'

afterEach(cleanup)

describe('landing route — static generation', () => {
  it('generates exactly one param per registry slug', () => {
    expect(generateStaticParams()).toEqual(landingSlugs().map((locale) => ({ locale })))
  })

  it('disables dynamic params so unknown slugs are excluded at build', () => {
    // With output: 'export' there is no server to resolve an unlisted slug; recovery
    // for a stale link is handled by not-found.tsx instead.
    expect(dynamicParams).toBe(false)
  })

  it('covers every locale in the registry', () => {
    expect(generateStaticParams()).toHaveLength(6)
  })
})

describe('landing route — renders in its own language', () => {
  it.each(['es', 'ja', 'bn', 'zh', 'ko'] as const)(
    'renders %s copy, not English',
    async (slug) => {
      const ui = await Page({ params: Promise.resolve({ locale: slug }) })
      render(ui)
      expect(screen.getByText(LANDING_CATALOGS[slug].placeholderLine)).toBeTruthy()
      expect(screen.queryByText(LANDING_CATALOGS.en.placeholderLine)).toBeNull()
    },
  )

  it('renders English on the en route', async () => {
    const ui = await Page({ params: Promise.resolve({ locale: 'en' }) })
    render(ui)
    expect(screen.getByText(LANDING_CATALOGS.en.placeholderLine)).toBeTruthy()
  })
})

describe('LandingPlaceholder — the surface feature 046 replaces', () => {
  it('marks the content with the locale BCP-47 tag for assistive tech', () => {
    // A per-locale document is only an accessibility gain if the language is
    // actually declared — today the app ships one English-tagged document.
    const locale = localeForSlug('ja')!
    const { container } = render(
      <LandingPlaceholder locale={locale} copy={LANDING_CATALOGS.ja} />,
    )
    expect(container.querySelector('[lang="ja-JP"]')).toBeTruthy()
  })

  it('ships no interactive controls yet — CTAs arrive with 046', () => {
    const locale = localeForSlug('en')!
    const { container } = render(
      <LandingPlaceholder locale={locale} copy={LANDING_CATALOGS.en} />,
    )
    expect(container.querySelectorAll('button, a, input')).toHaveLength(0)
  })
})

describe('landing route — module graph guard', () => {
  // The first-paint constraint, and the entire reason the funnel has its own
  // catalogs. A landing page pulling lib/store (Supabase + the household data
  // layer) or a 32-55 KB app catalog is a defect, not a nit.
  const files = [
    'app/landing/[locale]/page.tsx',
    'app/landing/page.tsx',
    'components/landing/LandingPlaceholder.tsx',
    'app/not-found.tsx',
  ]

  it.each(files)('%s imports neither lib/store nor an app catalog', (rel) => {
    const src = readFileSync(join(process.cwd(), rel), 'utf8')
    expect(src).not.toContain('@/lib/store')
    // The app catalogs — importable only as @/lib/i18n/{bn,es,ja,zh,ko}. The
    // funnel's own catalogs live under @/lib/i18n/landing and are fine.
    expect(src).not.toMatch(/from ['"]@\/lib\/i18n\/(bn|es|ja|zh|ko)['"]/)
  })

  it.each(files)('%s does not pull the Supabase client', (rel) => {
    const src = readFileSync(join(process.cwd(), rel), 'utf8')
    expect(src).not.toContain('@/lib/supabase/client')
  })
})
