// @vitest-environment jsdom
// spec 042 (Foundational) — the per-device seen-ledger. Guarded read/write that
// never throws, idempotent marking, and next-unseen-and-relevant selection.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  readSeenAnnouncements,
  hasSeenAnnouncement,
  markAnnouncementSeen,
  nextUnseenAnnouncement,
} from '@/components/announcements/announcementsSeen'
import type { Announcement } from '@/components/announcements/registry'

const KEY = 'ortho.announcementsSeen'

const A = (id: string, isRelevant?: Announcement['isRelevant']): Announcement => ({
  id,
  titleKey: `title-${id}`,
  descriptionKey: `desc-${id}`,
  cta: { labelKey: `cta-${id}`, route: `/${id}` },
  isRelevant,
})

beforeEach(() => localStorage.clear())
afterEach(() => vi.restoreAllMocks())

describe('announcements seen-ledger', () => {
  it('reads [] when the key is missing', () => {
    expect(readSeenAnnouncements()).toEqual([])
  })

  it('reads [] when the stored value is malformed JSON', () => {
    localStorage.setItem(KEY, 'not json{')
    expect(readSeenAnnouncements()).toEqual([])
  })

  it('reads [] when the stored value is not an array of strings', () => {
    localStorage.setItem(KEY, JSON.stringify({ a: 1 }))
    expect(readSeenAnnouncements()).toEqual([])
  })

  it('never throws when storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    expect(readSeenAnnouncements()).toEqual([])
    expect(hasSeenAnnouncement('x')).toBe(false)
    expect(() => markAnnouncementSeen('x')).not.toThrow()
  })

  it('marks an id seen and reflects it via hasSeenAnnouncement', () => {
    expect(hasSeenAnnouncement('financial-health')).toBe(false)
    markAnnouncementSeen('financial-health')
    expect(hasSeenAnnouncement('financial-health')).toBe(true)
    expect(readSeenAnnouncements()).toEqual(['financial-health'])
  })

  it('is idempotent — marking the same id twice does not duplicate', () => {
    markAnnouncementSeen('a')
    markAnnouncementSeen('a')
    expect(readSeenAnnouncements()).toEqual(['a'])
  })

  it('nextUnseenAnnouncement returns the first unseen entry in order', () => {
    const list = [A('a'), A('b'), A('c')]
    expect(nextUnseenAnnouncement(list, { userFinancialProfile: null })?.id).toBe('a')
    markAnnouncementSeen('a')
    expect(nextUnseenAnnouncement(list, { userFinancialProfile: null })?.id).toBe('b')
  })

  it('nextUnseenAnnouncement returns null when all are seen', () => {
    const list = [A('a'), A('b')]
    markAnnouncementSeen('a')
    markAnnouncementSeen('b')
    expect(nextUnseenAnnouncement(list, { userFinancialProfile: null })).toBeNull()
  })

  it('nextUnseenAnnouncement skips entries whose isRelevant returns false', () => {
    const list = [
      A('relevant-only-with-profile', (ctx) => ctx.userFinancialProfile != null),
      A('always'),
    ]
    // profile is null → first entry is not relevant → falls through to 'always'
    expect(nextUnseenAnnouncement(list, { userFinancialProfile: null })?.id).toBe('always')
    // profile present → first entry becomes relevant
    expect(nextUnseenAnnouncement(list, { userFinancialProfile: {} })?.id).toBe(
      'relevant-only-with-profile'
    )
  })

  it('treats a missing isRelevant as always relevant', () => {
    const list = [A('a')]
    expect(nextUnseenAnnouncement(list, { userFinancialProfile: {} })?.id).toBe('a')
  })
})
