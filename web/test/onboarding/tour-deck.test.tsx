// @vitest-environment jsdom
// spec 047 US1 + US2 — the tour deck.
//
// The assertion this file exists for is FR-006: **Skip must also record the funnel
// marker**. The intuitive reading ("skipping means they opted out") is wrong — a visitor
// who skips is still a funnel visitor, and forfeiting the marker would silently cost
// them the guided hand-off spec 048 provides. It is asserted for both exits, from more
// than one screen, because it is the one requirement in this feature that can be wrong
// while everything looks right.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const h = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  isNativePlatform: vi.fn(() => false),
  markFunnelEntry: vi.fn(),
  adoptLandingLanguage: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: h.push, replace: h.replace }),
}))
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: h.isNativePlatform } }))
vi.mock('@/lib/onboarding/funnel', () => ({ markFunnelEntry: h.markFunnelEntry }))
vi.mock('@/lib/onboarding/adoptLanguage', () => ({
  adoptLandingLanguage: h.adoptLandingLanguage,
}))

import { TourDeck } from '@/components/tour/TourDeck'
import { TOUR_CATALOGS, TOUR_SCREEN_COUNT } from '@/lib/i18n/landing/tour'
import { localeForSlug, landingSlugs, type LandingSlug } from '@/lib/onboarding/locales'
import { formatPosition } from '@/lib/onboarding/tour'

const en = TOUR_CATALOGS.en

function renderDeck(slug: LandingSlug = 'en') {
  return render(<TourDeck locale={localeForSlug(slug)!} copy={TOUR_CATALOGS[slug]} />)
}

/** Click through to the given zero-based screen using the Next control. */
function advanceTo(index: number, copy = en) {
  for (let i = 0; i < index; i++) fireEvent.click(screen.getByRole('button', { name: copy.next }))
}

/** A completed touch gesture across the deck. */
function swipe(dx: number, dy = 0) {
  const deck = screen.getByRole('region')
  fireEvent.touchStart(deck, { touches: [{ clientX: 200, clientY: 200 }] })
  fireEvent.touchEnd(deck, { changedTouches: [{ clientX: 200 + dx, clientY: 200 + dy }] })
}

beforeEach(() => {
  h.push.mockClear()
  h.replace.mockClear()
  h.markFunnelEntry.mockClear()
  h.markFunnelEntry.mockImplementation(() => {})
  h.adoptLandingLanguage.mockClear()
  h.adoptLandingLanguage.mockImplementation(() => {})
  h.isNativePlatform.mockReturnValue(false)
})
afterEach(cleanup)

// ── US1: what a visitor sees ──────────────────────────────────────────────────

describe('tour deck — the first screen (US1)', () => {
  it('opens on the first screen, titled as a heading', () => {
    renderDeck()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(en.screens[0].title)
    expect(screen.getByText(en.screens[0].body)).toBeTruthy()
  })

  it('names the deck region for assistive tech', () => {
    renderDeck()
    expect(screen.getByRole('region', { name: en.regionLabel })).toBeTruthy()
  })

  it('marks the content with the locale BCP-47 tag', () => {
    // The root layout ships one English-tagged document for the whole app, so the
    // subtree tag is what a screen reader actually resolves against here.
    const { container } = renderDeck('ja')
    expect(container.querySelector('[lang="ja-JP"]')).toBeTruthy()
  })

  it('renders exactly one screen at a time', () => {
    renderDeck()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.queryByText(en.screens[1].body)).toBeNull()
  })
})

describe('tour deck — skip is available everywhere (FR-004)', () => {
  it('shows a skip control on every screen', () => {
    renderDeck()
    for (let i = 0; i < TOUR_SCREEN_COUNT; i++) {
      expect(screen.getByRole('button', { name: en.skip }), `screen ${i + 1}`).toBeTruthy()
      if (i < TOUR_SCREEN_COUNT - 1) {
        fireEvent.click(screen.getByRole('button', { name: en.next }))
      }
    }
  })
})

describe('tour deck — advancing to the end (US1)', () => {
  it('moves forward one screen per click, through all five', () => {
    renderDeck()
    for (let i = 0; i < TOUR_SCREEN_COUNT - 1; i++) {
      expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(en.screens[i].title)
      fireEvent.click(screen.getByRole('button', { name: en.next }))
    }
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      en.screens[TOUR_SCREEN_COUNT - 1].title,
    )
  })

  it('offers finish instead of next on the last screen', () => {
    renderDeck()
    advanceTo(TOUR_SCREEN_COUNT - 1)
    expect(screen.getByRole('button', { name: en.finish })).toBeTruthy()
    expect(screen.queryByRole('button', { name: en.next })).toBeNull()
  })

  it('does not offer finish before the last screen', () => {
    renderDeck()
    expect(screen.queryByRole('button', { name: en.finish })).toBeNull()
    advanceTo(TOUR_SCREEN_COUNT - 2)
    expect(screen.queryByRole('button', { name: en.finish })).toBeNull()
  })

  it('arrives at sign-in when the visitor finishes', () => {
    renderDeck()
    advanceTo(TOUR_SCREEN_COUNT - 1)
    fireEvent.click(screen.getByRole('button', { name: en.finish }))
    expect(h.push).toHaveBeenCalledWith('/sign-in')
  })
})

// ── FR-006 — the requirement most likely to be inverted ───────────────────────

describe('tour deck — the funnel marker (FR-006 / SC-002)', () => {
  it('records the marker when the visitor FINISHES', () => {
    renderDeck()
    advanceTo(TOUR_SCREEN_COUNT - 1)
    fireEvent.click(screen.getByRole('button', { name: en.finish }))
    expect(h.markFunnelEntry).toHaveBeenCalledTimes(1)
  })

  it('records the marker when the visitor SKIPS from the first screen', () => {
    // The whole point: skipping the tour must not forfeit the guided hand-off.
    renderDeck()
    fireEvent.click(screen.getByRole('button', { name: en.skip }))
    expect(h.markFunnelEntry).toHaveBeenCalledTimes(1)
    expect(h.push).toHaveBeenCalledWith('/sign-in')
  })

  it('records the marker when the visitor SKIPS from a middle screen', () => {
    renderDeck()
    advanceTo(2)
    fireEvent.click(screen.getByRole('button', { name: en.skip }))
    expect(h.markFunnelEntry).toHaveBeenCalledTimes(1)
    expect(h.push).toHaveBeenCalledWith('/sign-in')
  })

  it('records the marker when the visitor SKIPS from the last screen', () => {
    renderDeck()
    advanceTo(TOUR_SCREEN_COUNT - 1)
    fireEvent.click(screen.getByRole('button', { name: en.skip }))
    expect(h.markFunnelEntry).toHaveBeenCalledTimes(1)
  })

  it('adopts the page language on both exits, since both are an explicit continue', () => {
    const { unmount } = renderDeck('es')
    fireEvent.click(screen.getByRole('button', { name: TOUR_CATALOGS.es.skip }))
    expect(h.adoptLandingLanguage).toHaveBeenCalledWith('es')
    unmount()
    h.adoptLandingLanguage.mockClear()

    renderDeck('es')
    advanceTo(TOUR_SCREEN_COUNT - 1, TOUR_CATALOGS.es)
    fireEvent.click(screen.getByRole('button', { name: TOUR_CATALOGS.es.finish }))
    expect(h.adoptLandingLanguage).toHaveBeenCalledWith('es')
  })

  it('adopts the language BEFORE navigating, so sign-in renders translated', () => {
    renderDeck('ko')
    fireEvent.click(screen.getByRole('button', { name: TOUR_CATALOGS.ko.skip }))
    expect(h.adoptLandingLanguage.mock.invocationCallOrder[0]).toBeLessThan(
      h.push.mock.invocationCallOrder[0],
    )
  })

  it('still reaches sign-in when storage is unavailable', () => {
    // The spec's edge case: "the tour still completes and still navigates; only the
    // marker is skipped." 045's funnel module swallows storage errors internally, so
    // this pins the deck against a future where it does not.
    h.markFunnelEntry.mockImplementation(() => {
      throw new Error('SecurityError: storage disabled')
    })
    renderDeck()
    fireEvent.click(screen.getByRole('button', { name: en.skip }))
    expect(h.push).toHaveBeenCalledWith('/sign-in')
  })

  it('lets no storage failure escape the click handler', () => {
    // Swallowed, not rethrown. An error leaving the handler would surface as a dev
    // error overlay on top of a tour that actually worked.
    h.adoptLandingLanguage.mockImplementation(() => {
      throw new Error('SecurityError: storage disabled')
    })
    renderDeck()
    expect(() => fireEvent.click(screen.getByRole('button', { name: en.skip }))).not.toThrow()
    expect(h.push).toHaveBeenCalledWith('/sign-in')
    h.adoptLandingLanguage.mockImplementation(() => {})
  })
})

// ── FR-011 — never inside the installed app ───────────────────────────────────

describe('tour deck — the installed mobile app (FR-011 / SC-006)', () => {
  it('renders nothing and leaves for the dashboard', async () => {
    h.isNativePlatform.mockReturnValue(true)
    renderDeck()
    await waitFor(() => expect(h.replace).toHaveBeenCalledWith('/dashboard'))
    // Not one frame of marketing inside the App Store build — destination alone is not
    // enough, so assert the content never appeared.
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull()
    expect(screen.queryByText(en.screens[0].body)).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('never records a funnel entry from inside the app', () => {
    h.isNativePlatform.mockReturnValue(true)
    renderDeck()
    expect(h.markFunnelEntry).not.toHaveBeenCalled()
  })
})

// ── FR-008 — own language on first paint ──────────────────────────────────────

describe('tour deck — language (FR-008 / SC-004)', () => {
  it.each(landingSlugs().filter((s) => s !== 'en'))(
    'renders %s copy and never the English string',
    (slug) => {
      renderDeck(slug)
      expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
        TOUR_CATALOGS[slug].screens[0].title,
      )
      expect(screen.queryByText(en.screens[0].title)).toBeNull()
      expect(screen.queryByText(en.screens[0].body)).toBeNull()
    },
  )

  it.each(landingSlugs())('labels the controls in %s', (slug) => {
    renderDeck(slug)
    expect(screen.getByRole('button', { name: TOUR_CATALOGS[slug].next })).toBeTruthy()
    expect(screen.getByRole('button', { name: TOUR_CATALOGS[slug].skip })).toBeTruthy()
  })
})

// ── US2: moving through the tour ──────────────────────────────────────────────

describe('tour deck — keyboard (US2)', () => {
  it('advances on ArrowRight', () => {
    renderDeck()
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(en.screens[1].title)
  })

  it('goes back on ArrowLeft', () => {
    renderDeck()
    advanceTo(2)
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(en.screens[1].title)
  })

  it('does nothing on ArrowLeft at the first screen', () => {
    renderDeck()
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(en.screens[0].title)
  })

  it('does not wrap or exit on ArrowRight at the last screen', () => {
    // Wrapping would carry someone past the finish action and hide the way out.
    renderDeck()
    advanceTo(TOUR_SCREEN_COUNT - 1)
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      en.screens[TOUR_SCREEN_COUNT - 1].title,
    )
    expect(h.push).not.toHaveBeenCalled()
  })

  it('stops listening once the deck is gone', () => {
    const view = renderDeck()
    view.unmount()
    // No throw, and nothing to assert against — the point is that the listener was
    // removed, which a leaked handler would turn into an error on a detached tree.
    expect(() => fireEvent.keyDown(window, { key: 'ArrowRight' })).not.toThrow()
  })
})

describe('tour deck — swipe (US2)', () => {
  it('advances on a leftward swipe', () => {
    renderDeck()
    swipe(-120)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(en.screens[1].title)
  })

  it('goes back on a rightward swipe', () => {
    renderDeck()
    advanceTo(2)
    swipe(120)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(en.screens[1].title)
  })

  it('ignores a drag shorter than the threshold', () => {
    renderDeck()
    swipe(-20)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(en.screens[0].title)
  })

  it('ignores a vertically dominant diagonal, so page scrolling is not stolen', () => {
    renderDeck()
    swipe(-60, 140)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(en.screens[0].title)
  })

  it('does not carry a stale start point into the next gesture', () => {
    renderDeck()
    swipe(-120)
    const deck = screen.getByRole('region')
    // A touchEnd with no preceding touchStart must be inert, not replay the last one.
    fireEvent.touchEnd(deck, { changedTouches: [{ clientX: 0, clientY: 200 }] })
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(en.screens[1].title)
  })
})

describe('tour deck — position and going back (US2)', () => {
  it('shows the position as text on every screen', () => {
    // Text, not dots alone: meaning is never carried by color or shape alone.
    renderDeck()
    for (let i = 0; i < TOUR_SCREEN_COUNT; i++) {
      expect(
        screen.getByText(formatPosition(en.position, i + 1, TOUR_SCREEN_COUNT)),
        `screen ${i + 1}`,
      ).toBeTruthy()
      if (i < TOUR_SCREEN_COUNT - 1) {
        fireEvent.click(screen.getByRole('button', { name: en.next }))
      }
    }
  })

  it('hides the back control on the first screen', () => {
    renderDeck()
    expect(screen.queryByRole('button', { name: en.back })).toBeNull()
  })

  it('offers back from the second screen onward', () => {
    renderDeck()
    advanceTo(1)
    expect(screen.getByRole('button', { name: en.back })).toBeTruthy()
  })

  it('returns to the previous screen with no loss of position', () => {
    renderDeck()
    advanceTo(3)
    fireEvent.click(screen.getByRole('button', { name: en.back }))
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(en.screens[2].title)
    expect(screen.getByText(formatPosition(en.position, 3, TOUR_SCREEN_COUNT))).toBeTruthy()
  })
})

describe('tour deck — accessibility and motion (US2)', () => {
  it('makes every control a real button', () => {
    renderDeck()
    advanceTo(1)
    const labels = [en.next, en.back, en.skip]
    for (const label of labels) {
      expect(screen.getByRole('button', { name: label }).tagName).toBe('BUTTON')
    }
  })

  it('orders the controls advance → back → skip in the DOM', () => {
    // Keyboard traversal follows DOM order. Advance comes first because it is what most
    // people came to do; back and skip are secondary and share the row beneath it.
    renderDeck()
    advanceTo(1)
    const buttons = [...screen.getAllByRole('button')].map((b) => b.textContent)
    expect(buttons).toEqual([en.next, en.back, en.skip])
  })

  it('puts the finish action first on the last screen too', () => {
    renderDeck()
    advanceTo(TOUR_SCREEN_COUNT - 1)
    const buttons = [...screen.getAllByRole('button')].map((b) => b.textContent)
    expect(buttons).toEqual([en.finish, en.back, en.skip])
  })

  it('gives the screen content no motion to suppress', () => {
    // The screens swap instantly — no slide, no fade. Reduced motion is then correct by
    // construction rather than by a rule that has to keep working. Asserted directly so
    // nobody "improves" the tour with an animation that escapes the reduced-motion
    // contract; if motion is ever added here, this test is the conversation.
    renderDeck()
    const heading = screen.getByRole('heading', { level: 1 })
    const wrapper = heading.parentElement!
    expect(wrapper.className).not.toMatch(/transition|animate/)
  })

  it('opts every real transition out under prefers-reduced-motion', () => {
    // The controls DO transition (press feedback). globals.css already resets
    // transitions globally under reduced motion; this pins the deck's own opt-out so
    // the behavior survives a change to that global rule.
    renderDeck()
    advanceTo(1)
    for (const button of screen.getAllByRole('button')) {
      expect(button.className, button.textContent ?? '').toContain('motion-reduce:transition-none')
    }
  })

  it('still ships the global reduced-motion reset the tour relies on', () => {
    const css = readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8')
    expect(css).toContain('prefers-reduced-motion: reduce')
  })

  it('hides the decorative position dots from assistive tech', () => {
    const { container } = renderDeck()
    expect(container.querySelector('[aria-hidden="true"]')).toBeTruthy()
  })
})
