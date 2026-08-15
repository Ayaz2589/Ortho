// @vitest-environment jsdom
// spec 048 — the post-sign-in hand-off decision, in isolation.
//
// This is the whole feature's logic: a funnel-walker is handed to the
// financial-health questionnaire, everyone else goes to the dashboard exactly as
// today. The decision keys on the funnel marker ALONE — app/sign-in/page.tsx
// renders outside AppStateProvider and cannot read the financial profile, so the
// "do they already have one?" check lives at the questionnaire's entry guard
// instead (see test/onboarding/financial-profile-guard.test.tsx).
//
// The no-marker path is the one that protects spec 042: it must produce a
// '/dashboard' route and write NOTHING.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { markFunnelEntry, readFunnelEntry } from '@/lib/onboarding/funnel'
import {
  hasSeenAnnouncement,
  markAnnouncementSeen,
  readSeenAnnouncements,
} from '@/components/announcements/announcementsSeen'
import { ANNOUNCEMENTS, FINANCIAL_HEALTH_ANNOUNCEMENT_ID } from '@/components/announcements/registry'
import {
  DEFAULT_POST_SIGN_IN_ROUTE,
  HANDOFF_ROUTE,
  resolvePostSignInRoute,
} from '@/lib/onboarding/handoff'

beforeEach(() => localStorage.clear())
afterEach(() => vi.restoreAllMocks())

describe('post-sign-in hand-off — a funnel walker (FR-001, FR-002, FR-006)', () => {
  it('routes to the financial-health questionnaire', () => {
    markFunnelEntry()
    expect(resolvePostSignInRoute()).toBe(HANDOFF_ROUTE)
  })

  it('consumes the marker, so the hand-off happens exactly once', () => {
    markFunnelEntry()
    resolvePostSignInRoute()
    expect(readFunnelEntry()).toBe(false)
  })

  it('returns the default on a second call — no re-fire on a Back into /sign-in', () => {
    markFunnelEntry()
    expect(resolvePostSignInRoute()).toBe(HANDOFF_ROUTE)
    expect(resolvePostSignInRoute()).toBe(DEFAULT_POST_SIGN_IN_ROUTE)
  })

  it("marks the financial-health announcement seen, so nobody is asked twice", () => {
    markFunnelEntry()
    resolvePostSignInRoute()
    expect(hasSeenAnnouncement(FINANCIAL_HEALTH_ANNOUNCEMENT_ID)).toBe(true)
  })

  it('clears the marker before the caller navigates', () => {
    // Both writes must land before resolvePostSignInRoute() returns — the caller
    // navigates on the return value, and a navigation can unmount the caller.
    markFunnelEntry()
    const route = resolvePostSignInRoute()
    expect(route).toBe(HANDOFF_ROUTE)
    expect(localStorage.getItem('ortho.onboardingFunnel')).toBeNull()
    expect(readSeenAnnouncements()).toContain(FINANCIAL_HEALTH_ANNOUNCEMENT_ID)
  })

  it('does not double-write an already-seen announcement', () => {
    markAnnouncementSeen(FINANCIAL_HEALTH_ANNOUNCEMENT_ID)
    markFunnelEntry()
    resolvePostSignInRoute()
    expect(readSeenAnnouncements()).toEqual([FINANCIAL_HEALTH_ANNOUNCEMENT_ID])
  })
})

describe('post-sign-in hand-off — everyone else (FR-003, FR-005, SC-002)', () => {
  it('routes to the dashboard when no marker was ever set', () => {
    expect(resolvePostSignInRoute()).toBe(DEFAULT_POST_SIGN_IN_ROUTE)
  })

  it('writes NOTHING without a marker — the announcement path is untouched', () => {
    // The load-bearing assertion of the whole feature. If this fails, a user who
    // never walked the funnel has had their "what's new" popup silently
    // suppressed, and spec 042 has been undone for them.
    resolvePostSignInRoute()
    expect(hasSeenAnnouncement(FINANCIAL_HEALTH_ANNOUNCEMENT_ID)).toBe(false)
    expect(localStorage.length).toBe(0)
  })

  it('leaves an unrelated seen-ledger entry alone', () => {
    markAnnouncementSeen('some-other-feature')
    resolvePostSignInRoute()
    expect(readSeenAnnouncements()).toEqual(['some-other-feature'])
  })

  it.each(['', '0', 'true', 'yes', '11', ' 1'])(
    'routes to the dashboard for the malformed marker value %o',
    (value) => {
      // Strictness is inherited from readFunnelEntry: a hand-off the visitor never
      // earned is worse than a missed one.
      localStorage.setItem('ortho.onboardingFunnel', value)
      expect(resolvePostSignInRoute()).toBe(DEFAULT_POST_SIGN_IN_ROUTE)
      expect(hasSeenAnnouncement(FINANCIAL_HEALTH_ANNOUNCEMENT_ID)).toBe(false)
    },
  )
})

describe('post-sign-in hand-off — storage unavailable (FR-003)', () => {
  it('returns the default and never throws when reads throw', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    expect(() => resolvePostSignInRoute()).not.toThrow()
    expect(resolvePostSignInRoute()).toBe(DEFAULT_POST_SIGN_IN_ROUTE)
  })

  it('never throws when a write throws mid-hand-off', () => {
    // Sign-in must not fail because storage is disabled. The visitor simply gets
    // the ordinary path — or, here, the hand-off with a best-effort clear.
    markFunnelEntry()
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    expect(() => resolvePostSignInRoute()).not.toThrow()
  })
})

describe('post-sign-in hand-off — route consistency', () => {
  it('hands off to exactly the route the financial-health announcement offers', () => {
    // These must be the same page. If they ever diverge, marking the announcement
    // seen would suppress an offer the user was never actually given (FR-006).
    const fh = ANNOUNCEMENTS.find((a) => a.id === FINANCIAL_HEALTH_ANNOUNCEMENT_ID)
    expect(fh).toBeDefined()
    expect(HANDOFF_ROUTE).toBe(fh!.cta.route)
  })

  it('keeps the dashboard as the default destination — today’s behavior', () => {
    expect(DEFAULT_POST_SIGN_IN_ROUTE).toBe('/dashboard')
  })
})
