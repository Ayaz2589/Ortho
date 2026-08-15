// @vitest-environment jsdom
// spec 046 US1 — the real marketing page behind every /landing/{locale} route.
//
// The contract this file pins is specs/046-landing-pages/contracts/landing-page.md §1.
// Two of these tests carry more weight than the rest: "adopts the page's language" and
// "writes nothing on view". Together they are the difference between a language
// PREFERENCE and a language PAGE — a visitor who opens a shared Japanese link keeps
// their own language unless they choose to go on (FR-003/FR-004).
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { LandingView } from '@/components/landing/LandingView'
import { localeForSlug, landingSlugs, type LandingSlug } from '@/lib/onboarding/locales'
import { LANDING_CATALOGS } from '@/lib/i18n/landing'

/**
 * Clicking a real <a href> makes jsdom attempt a document navigation, which it cannot
 * do and reports as an unhandled error. Swallowing the default at the document level
 * still lets React's onClick run first — which is exactly the ordering under test.
 */
const swallowNavigation = (e: Event) => e.preventDefault()

beforeEach(() => {
  localStorage.clear()
  document.addEventListener('click', swallowNavigation)
})

afterEach(() => {
  document.removeEventListener('click', swallowNavigation)
  cleanup()
  localStorage.clear()
})

function renderLocale(slug: LandingSlug) {
  return render(<LandingView locale={localeForSlug(slug)!} copy={LANDING_CATALOGS[slug]} />)
}

/** [primary, secondary] — asserted to be exactly two by the test below. */
function actions() {
  return screen.getAllByRole('link') as HTMLAnchorElement[]
}

describe('LandingView — the proposition (US1)', () => {
  it.each(landingSlugs())('renders %s headline, subhead and every supporting point', (slug) => {
    const copy = LANDING_CATALOGS[slug]
    renderLocale(slug)
    expect(screen.getByText(copy.landing.headline)).toBeTruthy()
    expect(screen.getByText(copy.landing.subhead)).toBeTruthy()
    for (const point of copy.landing.points) {
      expect(screen.getByText(point.title)).toBeTruthy()
      expect(screen.getByText(point.body)).toBeTruthy()
    }
  })

  it('renders the supporting points in catalog order', () => {
    const { container } = renderLocale('en')
    const text = container.textContent ?? ''
    const positions = LANDING_CATALOGS.en.landing.points.map((p) => text.indexOf(p.title))
    expect(positions.every((p) => p >= 0)).toBe(true)
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)
  })

  it('leads with the proposition — the headline precedes the first point', () => {
    const { container } = renderLocale('en')
    const text = container.textContent ?? ''
    expect(text.indexOf(LANDING_CATALOGS.en.landing.headline)).toBeLessThan(
      text.indexOf(LANDING_CATALOGS.en.landing.points[0].title),
    )
  })

  it('renders only this locale, with no English leaking into it', () => {
    renderLocale('ja')
    expect(screen.getByText(LANDING_CATALOGS.ja.landing.headline)).toBeTruthy()
    expect(screen.queryByText(LANDING_CATALOGS.en.landing.headline)).toBeNull()
    expect(screen.queryByText(LANDING_CATALOGS.en.landing.primaryCta)).toBeNull()
  })
})

describe('LandingView — the two actions (US1)', () => {
  it('offers exactly two interactive elements — one prominent, one quiet', () => {
    // "One prominent action and one quieter link" is a real constraint, not a
    // description: a third control would make the page a menu instead of an invitation.
    const { container } = renderLocale('en')
    expect(actions()).toHaveLength(2)
    expect(container.querySelectorAll('button, input, select, textarea')).toHaveLength(0)
  })

  it.each(landingSlugs())('points %s at its own tour', (slug) => {
    renderLocale(slug)
    const [primary] = actions()
    expect(primary.getAttribute('href')).toBe(`/tour/${slug}`)
    expect(primary.textContent).toContain(LANDING_CATALOGS[slug].landing.primaryCta)
  })

  it('points the quiet link at sign-in', () => {
    renderLocale('en')
    const [, secondary] = actions()
    expect(secondary.getAttribute('href')).toBe('/sign-in')
    expect(secondary.textContent).toContain(LANDING_CATALOGS.en.landing.secondaryCta)
  })

  it('puts the primary action before the sign-in link in DOM order', () => {
    // Keyboard order must match visual weight (FR-009): the prominent action is
    // reached first by Tab, not last. Asserted structurally rather than by index, so
    // it still holds if the two ever stop being siblings.
    renderLocale('en')
    const [primary, secondary] = actions()
    expect(primary.compareDocumentPosition(secondary) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    )
  })

  it('renders both actions as real anchors carrying an href', () => {
    // Not buttons with router.push: the link from a landing page to its tour is the
    // funnel's SEO purpose, and a button carries nothing a crawler can follow.
    renderLocale('es')
    for (const action of actions()) {
      expect(action.tagName).toBe('A')
      expect(action.getAttribute('href')).toBeTruthy()
    }
  })

  it('shows the prompt that explains the quiet link', () => {
    renderLocale('es')
    expect(screen.getByText(LANDING_CATALOGS.es.landing.secondaryPrompt)).toBeTruthy()
  })
})

describe('LandingView — language adoption (US1, FR-003/FR-004)', () => {
  it('writes nothing on view — looking at a page is not choosing it', () => {
    // The edge case that makes the funnel safe to share: someone with a stored
    // language who opens a link in another one must keep their own.
    renderLocale('ja')
    expect(localStorage.getItem('language')).toBeNull()
  })

  it.each(landingSlugs())('adopts %s when the primary action is taken', (slug) => {
    renderLocale(slug)
    fireEvent.click(actions()[0])
    expect(localStorage.getItem('language')).toBe(localeForSlug(slug)!.language)
  })

  it.each(landingSlugs())('adopts %s when the sign-in link is taken', (slug) => {
    // Both actions, not just the CTA: someone who already has an account should still
    // land on a sign-in screen in the language they were just reading.
    renderLocale(slug)
    fireEvent.click(actions()[1])
    expect(localStorage.getItem('language')).toBe(localeForSlug(slug)!.language)
  })

  it('stores the Language, never the slug', () => {
    renderLocale('ko')
    fireEvent.click(actions()[0])
    expect(localStorage.getItem('language')).toBe('한국어')
    expect(localStorage.getItem('language')).not.toBe('ko')
  })
})

describe('LandingView — one component, many markets (US3)', () => {
  /**
   * US3 acceptance scenario 2, and the test that fails the day someone "simplifies"
   * `points` into point1/point2/point3. The whole reason the funnel is per-language is
   * that a market can be spoken to differently — including at a different length.
   */
  function withPoints(count: number) {
    const points = Array.from({ length: count }, (_, i) => ({
      title: `Point ${i + 1}`,
      body: `Body ${i + 1}`,
    }))
    return {
      ...LANDING_CATALOGS.en,
      landing: { ...LANDING_CATALOGS.en.landing, points },
    }
  }

  it.each([1, 2, 4, 5])('renders a locale carrying %i supporting points', (count) => {
    const { container } = render(
      <LandingView locale={localeForSlug('en')!} copy={withPoints(count)} />,
    )
    expect(container.querySelectorAll('h2')).toHaveLength(count)
    for (let i = 1; i <= count; i += 1) {
      expect(screen.getByText(`Point ${i}`)).toBeTruthy()
      expect(screen.getByText(`Body ${i}`)).toBeTruthy()
    }
  })

  it('still renders the proposition and both actions whatever the point count', () => {
    render(<LandingView locale={localeForSlug('en')!} copy={withPoints(1)} />)
    expect(screen.getByText(LANDING_CATALOGS.en.landing.headline)).toBeTruthy()
    expect(screen.getAllByRole('link')).toHaveLength(2)
  })
})

describe('LandingView — semantics and interaction (US2)', () => {
  it('gives the page exactly one h1, and it is the proposition', () => {
    const { container } = renderLocale('en')
    const h1s = container.querySelectorAll('h1')
    expect(h1s).toHaveLength(1)
    expect(h1s[0].textContent).toBe(LANDING_CATALOGS.en.landing.headline)
  })

  it('ranks the supporting points below the proposition, never beside it', () => {
    const { container } = renderLocale('en')
    const headings = container.querySelectorAll('h2')
    expect(headings).toHaveLength(LANDING_CATALOGS.en.landing.points.length)
    expect(container.querySelectorAll('h1, h2')).toHaveLength(
      1 + LANDING_CATALOGS.en.landing.points.length,
    )
  })

  it('gives the primary action a real touch target that can still grow', () => {
    // A class-name proxy for a size the browser decides: jsdom loads no CSS, so
    // computed height is meaningless here. The honest check is quickstart §4 step 10.
    //
    // `min-h-12` (48px floor), NOT `h-12`: a fixed height cannot wrap, and the spec's
    // edge cases call out long translated strings explicitly. A locale whose call to
    // action runs long must wrap to a second line rather than overflow its own pill.
    renderLocale('en')
    expect(actions()[0].className).toContain('min-h-12')
  })

  it('leaves the global focus ring alone on both actions', () => {
    // globals.css gives every <a> a sand focus-visible ring. The only way to lose it
    // is to suppress it here, so that is what this guards (Constitution V).
    renderLocale('en')
    for (const action of actions()) {
      expect(action.className).not.toContain('outline-none')
      expect(action.className).not.toContain('focus:outline-none')
    }
  })

  it('sizes the page to the ZOOM-CORRECTED viewport, never a static 100vh', () => {
    // The exact defect PRs #104/#105 fixed in the app shell, which this page would
    // otherwise reintroduce on the pre-auth side. `zoom: Z` on <html> (spec 040's
    // text size, default 1.06 — so this bites EVERY user, not just those who opted
    // into a larger size) scales the whole root, so a `min-h-screen` box resolves to
    // viewport×Z and overflows, adding a spurious scrollbar on any screen tall enough
    // for the min to bind. Dividing by `--ui-zoom` cancels it.
    //
    // Asserted against the source, like test/appearance/mobile-scroll-nav-guard.test.ts
    // does for the shell: jsdom has no layout engine and its CSS parser drops a
    // `calc()` over a custom property, so a computed-style assertion here would be
    // theatre. That guard only scans app/(app)/layout.tsx, which is why this one
    // has to exist separately.
    const src = readFileSync(join(process.cwd(), 'components/landing/LandingView.tsx'), 'utf8')
    // Comments stripped first: the file explains this trap by name, and a guard that
    // fires on its own documentation would push the explanation out of the code.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    expect(/calc\(\s*100dvh\s*\/\s*var\(--ui-zoom/.test(code)).toBe(true)
    expect(code).not.toMatch(/\b(min-h-screen|h-screen|min-h-\[100vh\]|h-\[100vh\])\b/)
  })

  it('adds no tabindex, so keyboard order is DOM order', () => {
    renderLocale('en')
    for (const action of actions()) {
      expect(action.getAttribute('tabindex')).toBeNull()
    }
  })
})

describe('LandingView — document language (inherited from spec 045)', () => {
  it('marks the content subtree with the locale BCP-47 tag', () => {
    const { container } = renderLocale('ja')
    expect(container.querySelector('[lang="ja-JP"]')).toBeTruthy()
  })

  it('corrects the document language, which the shared root layout hardcodes to en', () => {
    document.documentElement.lang = 'en'
    renderLocale('es')
    expect(document.documentElement.lang).toBe('es-ES')
  })

  it('restores the document language on unmount, so it never leaks into the app', () => {
    document.documentElement.lang = 'en'
    const view = renderLocale('ko')
    expect(document.documentElement.lang).toBe('ko-KR')
    view.unmount()
    expect(document.documentElement.lang).toBe('en')
  })
})
