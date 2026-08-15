// @vitest-environment jsdom
// spec 047 US1 — the /tour/{locale} route. One dynamic route with generateStaticParams,
// mirroring the landing route 045 established: adding a seventh language must stay a
// single edit to LANDING_LOCALES, and the six slugs are never restated here.
//
// The screens deliberately do NOT appear in the address. Six locales x five screens
// would be thirty static documents under output: 'export' for no benefit, and
// useSearchParams would fail the production build without a Suspense boundary
// (research.md §2).
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  notFound: () => {
    throw new Error('notFound')
  },
}))
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }))

import Page, { generateStaticParams, dynamicParams, generateMetadata } from '@/app/tour/[locale]/page'
import { landingSlugs } from '@/lib/onboarding/locales'
import { TOUR_CATALOGS } from '@/lib/i18n/landing/tour'

afterEach(cleanup)

describe('tour route — static generation', () => {
  it('generates exactly one param per registry slug', () => {
    expect(generateStaticParams()).toEqual(landingSlugs().map((locale) => ({ locale })))
  })

  it('generates six documents, not thirty', () => {
    // The assumption the whole client-state design rests on: screen count must never
    // multiply the document count.
    expect(generateStaticParams()).toHaveLength(6)
  })

  it('disables dynamic params so unknown slugs are excluded at build', () => {
    expect(dynamicParams).toBe(false)
  })
})

describe('tour route — renders in its own language', () => {
  it.each(landingSlugs())('renders the first %s screen', async (slug) => {
    const ui = await Page({ params: Promise.resolve({ locale: slug }) })
    render(ui)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      TOUR_CATALOGS[slug].screens[0].title,
    )
  })

  it.each(landingSlugs().filter((s) => s !== 'en'))('shows no English on the %s route', async (slug) => {
    const ui = await Page({ params: Promise.resolve({ locale: slug }) })
    render(ui)
    expect(screen.queryByText(TOUR_CATALOGS.en.screens[0].title)).toBeNull()
  })
})

describe('tour route — metadata', () => {
  it.each(landingSlugs())('titles %s in its own language', async (slug) => {
    const meta = await generateMetadata({ params: Promise.resolve({ locale: slug }) })
    expect(typeof meta.title).toBe('string')
    expect((meta.title as string).length).toBeGreaterThan(0)
    if (slug !== 'en') {
      const enMeta = await generateMetadata({ params: Promise.resolve({ locale: 'en' }) })
      expect(meta.title).not.toBe(enMeta.title)
    }
  })

  it('gives every locale a distinct title, so a shared link previews correctly', async () => {
    const titles = await Promise.all(
      landingSlugs().map(async (slug) =>
        (await generateMetadata({ params: Promise.resolve({ locale: slug }) })).title,
      ),
    )
    expect(new Set(titles).size).toBe(titles.length)
  })

  it.each(landingSlugs())('keeps %s out of the search index', async (slug) => {
    // The tour is step two of a journey. A searcher dropped into screen 1 has skipped
    // the page that explains what the product is, and six more indexable documents
    // would compete with the six landing pages for the same queries (research §7).
    const meta = await generateMetadata({ params: Promise.resolve({ locale: slug }) })
    const robots = meta.robots as { index?: boolean; follow?: boolean }
    expect(robots?.index).toBe(false)
    expect(robots?.follow).toBe(true)
  })
})

describe('tour route — the sitemap is unchanged', () => {
  it('lists only the landing pages', async () => {
    // 045's sitemap is the funnel's indexed surface. A noindex page has no business
    // in it, and this pins that 047 did not quietly add one.
    const { default: sitemap } = await import('@/app/sitemap')
    const urls = sitemap().map((e) => e.url)
    expect(urls).toHaveLength(landingSlugs().length)
    for (const url of urls) expect(url).toContain('/landing/')
    expect(urls.some((u) => u.includes('/tour/'))).toBe(false)
  })
})

describe('tour route — module graph guard', () => {
  // A pre-auth page pulling lib/store (Supabase + the household data layer) or a
  // 32-55 KB app catalog is a defect, not a nit (FR-010).
  const files = [
    'app/tour/[locale]/page.tsx',
    'components/tour/TourDeck.tsx',
    'lib/onboarding/tour.ts',
    'lib/i18n/landing/tour.ts',
  ]

  function source(rel: string): string {
    return readFileSync(join(process.cwd(), rel), 'utf8')
  }

  it.each(files)('%s imports neither lib/store nor an app catalog', (rel) => {
    const src = source(rel)
    expect(src).not.toContain('@/lib/store')
    expect(src).not.toMatch(/from ['"]@\/lib\/i18n\/(bn|es|ja|zh|ko)['"]/)
  })

  it.each(files)('%s does not pull the Supabase client', (rel) => {
    expect(source(rel)).not.toContain('@/lib/supabase/client')
  })

  it.each(files)('%s does not import components/ui', (rel) => {
    // components/ui.tsx itself imports @/lib/store, so PrimaryButton would drag the
    // whole data layer onto a signed-out page by the back door (research §8).
    expect(source(rel)).not.toMatch(/from ['"]@\/components\/ui['"]/)
  })

  it('the components/ui guard is worth having — that file really does import the store', () => {
    // Pins the reason the rule exists, so a future reader does not delete it as paranoia.
    expect(source('components/ui.tsx')).toContain('@/lib/store')
  })
})
