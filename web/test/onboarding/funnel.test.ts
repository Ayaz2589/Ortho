// @vitest-environment jsdom
// spec 045 US3/US5 — the funnel marker. Defined here, SET by feature 047 (the tour)
// and READ by feature 048 (the new-user hand-off). Owning the contract in the
// foundation is what lets those two build in parallel.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { execSync } from 'node:child_process'
import { markFunnelEntry, readFunnelEntry, clearFunnelEntry } from '@/lib/onboarding/funnel'

const KEY = 'ortho.onboardingFunnel'

beforeEach(() => localStorage.clear())
afterEach(() => vi.restoreAllMocks())

describe('funnel marker — round trip', () => {
  it('reads false before anything is set', () => {
    expect(readFunnelEntry()).toBe(false)
  })

  it('reads true once marked', () => {
    markFunnelEntry()
    expect(readFunnelEntry()).toBe(true)
  })

  it('reads false after clearing', () => {
    markFunnelEntry()
    clearFunnelEntry()
    expect(readFunnelEntry()).toBe(false)
  })

  it('is idempotent', () => {
    markFunnelEntry()
    markFunnelEntry()
    expect(readFunnelEntry()).toBe(true)
    clearFunnelEntry()
    clearFunnelEntry()
    expect(readFunnelEntry()).toBe(false)
  })

  it('survives a reload — the value lives in storage, not memory', () => {
    markFunnelEntry()
    // A fresh read with no intervening call is exactly what a reload does.
    expect(localStorage.getItem(KEY)).toBe('1')
    expect(readFunnelEntry()).toBe(true)
  })
})

describe('funnel marker — strictness', () => {
  it.each(['', '0', 'true', 'yes', '11', ' 1', '{"v":1}'])(
    'reads false for the malformed value %o',
    (value) => {
      // A hand-off the visitor never earned is worse than missing one, so anything
      // other than exactly '1' is treated as absent.
      localStorage.setItem(KEY, value)
      expect(readFunnelEntry()).toBe(false)
    },
  )

  it('stores no personal data — a single presence bit (FR-018)', () => {
    markFunnelEntry()
    expect(localStorage.getItem(KEY)).toBe('1')
  })

  it('touches no other storage key', () => {
    localStorage.setItem('language', 'Español')
    markFunnelEntry()
    clearFunnelEntry()
    expect(localStorage.getItem('language')).toBe('Español')
  })
})

describe('funnel marker — storage unavailable', () => {
  it('mark is a silent no-op when storage throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    expect(() => markFunnelEntry()).not.toThrow()
  })

  it('read returns false when storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    expect(() => readFunnelEntry()).not.toThrow()
    expect(readFunnelEntry()).toBe(false)
  })

  it('clear is a silent no-op when storage throws', () => {
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    expect(() => clearFunnelEntry()).not.toThrow()
  })
})

describe('funnel marker — FR-019: defined here, used by 047/048', () => {
  /** Production modules importing the funnel module, excluding the module's own home. */
  function importers(): string[] {
    return execSync("grep -rl 'onboarding/funnel' app components lib 2>/dev/null || true", {
      cwd: process.cwd(),
      encoding: 'utf8',
    })
      .split('\n')
      .filter(Boolean)
      .filter((f) => !f.startsWith('lib/onboarding/'))
      .sort()
  }

  it('is set by the tour and by nothing else', () => {
    // Originally asserted NO production importer at all — correct while 045 stood
    // alone, since setting the marker belongs to the tour and acting on it to the
    // hand-off. Spec 047 is that tour, so the guard is narrowed rather than dropped:
    // it now names the one permitted caller. A second importer appearing here means a
    // feature has started writing the marker somewhere it should not.
    expect(importers()).toEqual(['components/tour/TourDeck.tsx'])
  })

  it('is READ only from within lib/onboarding — spec 048 owns that', () => {
    // Narrowed on merge. This said "still READ by nothing — that belongs to spec 048",
    // which was true while 048 was unbuilt but went quietly VACUOUS once it landed:
    // 048's reader is lib/onboarding/handoff.ts, which the filter below excludes, so
    // the test kept passing while its stated claim became false. The durable invariant
    // is the one it actually checks — the marker is read through handoff.ts and nowhere
    // else, so no page inlines the read and re-derives the hand-off rules.
    const src = execSync("grep -rn 'readFunnelEntry\\|clearFunnelEntry' app components lib 2>/dev/null || true", {
      cwd: process.cwd(),
      encoding: 'utf8',
    })
      .split('\n')
      .filter(Boolean)
      .filter((line) => !line.startsWith('lib/onboarding/'))
    expect(src).toEqual([])
  })
})
