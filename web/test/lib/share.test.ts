// spec 021 — FR-013: users can share exportable data via the standard iOS
// share sheet. @capacitor/share already falls back to the Web Share API on
// desktop/mobile web internally, so this wrapper stays a thin, uniform call —
// no platform branching needed. There is no existing export/share feature in
// the app on `main` to attach this to yet; it exists as tested,
// ready-to-consume infrastructure for whichever future export UI needs it.
import { describe, it, expect, beforeEach, vi } from 'vitest'

const { share, canShare } = vi.hoisted(() => ({
  share: vi.fn(() => Promise.resolve({ activityType: undefined })),
  canShare: vi.fn(() => Promise.resolve({ value: true })),
}))
vi.mock('@capacitor/share', () => ({ Share: { share, canShare } }))

import { shareData } from '@/lib/share'

describe('shareData', () => {
  beforeEach(() => {
    share.mockReset().mockResolvedValue({ activityType: undefined })
    canShare.mockClear()
  })

  it('delegates to Share.share with the given title/text/url', async () => {
    await shareData({ title: 'Ortho export', text: 'March transactions', url: 'file:///tmp/x.csv' })
    expect(share).toHaveBeenCalledWith({
      title: 'Ortho export',
      text: 'March transactions',
      url: 'file:///tmp/x.csv',
    })
  })

  it('resolves false (never throws) when sharing is unsupported or the user cancels', async () => {
    share.mockRejectedValue(new Error('Share canceled'))
    await expect(shareData({ text: 'x' })).resolves.toBe(false)
  })

  it('resolves true on a successful share', async () => {
    await expect(shareData({ text: 'x' })).resolves.toBe(true)
  })
})
