// @vitest-environment jsdom
// spec 045 US1 — the six landing entry points. One dynamic route with
// generateStaticParams (NOT six hand-written folders) so adding a seventh language
// stays a single registry edit (SC-006, research.md §4).
import { describe, it, expect } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach } from 'vitest'

import Page, {
  generateStaticParams,
  dynamicParams,
  generateMetadata,
} from '@/app/landing/[locale]/page'
import { landingUrl } from '@/lib/siteUrl'
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
      expect(screen.getByText(LANDING_CATALOGS[slug].landing.headline)).toBeTruthy()
      expect(screen.queryByText(LANDING_CATALOGS.en.landing.headline)).toBeNull()
    },
  )

  it('renders English on the en route', async () => {
    const ui = await Page({ params: Promise.resolve({ locale: 'en' }) })
    render(ui)
    expect(screen.getByText(LANDING_CATALOGS.en.landing.headline)).toBeTruthy()
  })
})

describe('landing route — the page the route renders (spec 046)', () => {
  // 045 shipped a deliberately inert placeholder and asserted here that it had no
  // controls, "CTAs arrive with 046". They have. The component's own contract lives in
  // landing-view.test.tsx; what this file still owns is that the ROUTE wires it up.
  it('renders the two actions through the route, with the locale-correct tour link', async () => {
    const ui = await Page({ params: Promise.resolve({ locale: 'ko' }) })
    render(ui)
    const links = screen.getAllByRole('link') as HTMLAnchorElement[]
    expect(links).toHaveLength(2)
    expect(links[0].getAttribute('href')).toBe('/tour/ko')
    expect(links[1].getAttribute('href')).toBe('/sign-in')
  })

  it('marks the content with the locale BCP-47 tag for assistive tech', async () => {
    // A per-locale document is only an accessibility gain if the language is
    // actually declared — the app otherwise ships one English-tagged document.
    const ui = await Page({ params: Promise.resolve({ locale: 'ja' }) })
    const { container } = render(ui)
    expect(container.querySelector('[lang="ja-JP"]')).toBeTruthy()
  })
})

describe('landing route — per-locale metadata (US4)', () => {
  it.each(landingSlugs())('titles and describes %s in its own language', async (slug) => {
    const meta = await generateMetadata({ params: Promise.resolve({ locale: slug }) })
    expect(meta.title).toBe(LANDING_CATALOGS[slug].metaTitle)
    expect(meta.description).toBe(LANDING_CATALOGS[slug].metaDescription)
    if (slug !== 'en') {
      // The whole point of US4: a Spanish search must not surface an English title.
      expect(meta.title).not.toBe(LANDING_CATALOGS.en.metaTitle)
    }
  })

  it.each(landingSlugs())('gives %s its own canonical URL', async (slug) => {
    const meta = await generateMetadata({ params: Promise.resolve({ locale: slug }) })
    expect(meta.alternates?.canonical).toBe(landingUrl(slug))
  })

  it.each(landingSlugs())('declares all six alternates plus x-default on %s', async (slug) => {
    const meta = await generateMetadata({ params: Promise.resolve({ locale: slug }) })
    const languages = (meta.alternates?.languages ?? {}) as Record<string, string>
    expect(Object.keys(languages)).toHaveLength(landingSlugs().length + 1)
    expect(languages['x-default']).toBe(landingUrl('en'))
    for (const other of landingSlugs()) {
      expect(languages[localeForSlug(other)!.locale]).toBe(landingUrl(other))
    }
  })

  it('sets the OpenGraph locale to the BCP-47 tag', async () => {
    const meta = await generateMetadata({ params: Promise.resolve({ locale: 'ja' }) })
    expect((meta.openGraph as { locale?: string })?.locale).toBe('ja-JP')
  })
})

describe('landing route — module graph guard', () => {
  // The first-paint constraint, and the entire reason the funnel has its own
  // catalogs. A landing page pulling lib/store (Supabase + the household data
  // layer) or a 32-55 KB app catalog is a defect, not a nit.
  const files = [
    'app/landing/[locale]/page.tsx',
    'app/landing/page.tsx',
    'components/landing/LandingView.tsx',
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

  it.each(files)('%s does not import components/ui', (rel) => {
    // Added on merge, matching the guard spec 047 wrote for the tour. `components/ui.tsx`
    // itself imports `@/lib/store`, so pulling `PrimaryButton` would drag Supabase and
    // the whole household data layer onto a signed-out page WITHOUT tripping the direct
    // `@/lib/store` check above. LandingView is clean today; this stops it regressing.
    const src = readFileSync(join(process.cwd(), rel), 'utf8')
    expect(src).not.toContain("from '@/components/ui'")
  })

  it('the components/ui guard is worth having — that file really does import the store', () => {
    // Pins the premise. If components/ui ever stops importing the store, the guard above
    // becomes cargo-cult and should be reconsidered rather than left in place.
    expect(readFileSync(join(process.cwd(), 'components/ui.tsx'), 'utf8')).toContain(
      '@/lib/store',
    )
  })
})
