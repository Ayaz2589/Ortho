// spec 021 — thin native-aware haptic feedback helper (FR-012: "haptic
// feedback on key confirmation/deletion interactions, consistent with
// standard iOS conventions"). No-op on desktop/mobile web.
import { describe, it, expect, beforeEach, vi } from 'vitest'

const { impact, notification, isNativePlatform } = vi.hoisted(() => ({
  impact: vi.fn(() => Promise.resolve()),
  notification: vi.fn(() => Promise.resolve()),
  isNativePlatform: vi.fn(() => true),
}))

vi.mock('@capacitor/haptics', () => ({
  Haptics: { impact, notification },
  ImpactStyle: { Light: 'LIGHT', Medium: 'MEDIUM', Heavy: 'HEAVY' },
  NotificationType: { Success: 'SUCCESS', Warning: 'WARNING', Error: 'ERROR' },
}))
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform } }))

import { hapticConfirm, hapticDestructive } from '@/lib/haptics'

describe('haptics helper', () => {
  beforeEach(() => {
    impact.mockClear()
    notification.mockClear()
    isNativePlatform.mockReturnValue(true)
  })

  it('hapticConfirm triggers a light impact', () => {
    hapticConfirm()
    expect(impact).toHaveBeenCalledWith({ style: 'LIGHT' })
  })

  it('hapticDestructive triggers a warning notification', () => {
    hapticDestructive()
    expect(notification).toHaveBeenCalledWith({ type: 'WARNING' })
  })

  it('is a no-op on non-native platforms', () => {
    isNativePlatform.mockReturnValue(false)
    hapticConfirm()
    hapticDestructive()
    expect(impact).not.toHaveBeenCalled()
    expect(notification).not.toHaveBeenCalled()
  })
})
