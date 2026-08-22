import { describe, expect, it, vi } from 'vitest'
import { maybeCaptureVisit, CAPTURE_MIN_INTERVAL_MINUTES, type GeolocationLike } from '../../lib/location/captureVisit'

function fakeGeolocation(result: 'ok' | 'denied' | 'unavailable' = 'ok'): GeolocationLike {
  return {
    getCurrentPosition: vi.fn(async () => {
      if (result === 'denied') throw new Error('User denied Geolocation')
      if (result === 'unavailable') throw new Error('Geolocation unavailable')
      return { coords: { latitude: 40.7, longitude: -74.0, accuracy: 10 } }
    }),
  }
}

describe('maybeCaptureVisit', () => {
  it('is a no-op unless level is foreground_capture', async () => {
    const onCapture = vi.fn()
    for (const level of ['off', 'geocoding'] as const) {
      await maybeCaptureVisit({
        level,
        lastCaptureAt: null,
        now: new Date(),
        onCapture,
        geolocation: fakeGeolocation(),
      })
    }
    expect(onCapture).not.toHaveBeenCalled()
  })

  it('captures once when opted in and no prior capture exists', async () => {
    const onCapture = vi.fn()
    await maybeCaptureVisit({
      level: 'foreground_capture',
      lastCaptureAt: null,
      now: new Date('2026-08-11T12:00:00Z'),
      onCapture,
      geolocation: fakeGeolocation(),
    })
    expect(onCapture).toHaveBeenCalledWith(40.7, -74.0, 10)
  })

  it('is throttled — no second capture within the minimum interval', async () => {
    const onCapture = vi.fn()
    const now = new Date('2026-08-11T12:00:00Z')
    const lastCaptureAt = new Date(now.getTime() - (CAPTURE_MIN_INTERVAL_MINUTES - 1) * 60_000)
    await maybeCaptureVisit({ level: 'foreground_capture', lastCaptureAt, now, onCapture, geolocation: fakeGeolocation() })
    expect(onCapture).not.toHaveBeenCalled()
  })

  it('captures again once the throttle window has elapsed', async () => {
    const onCapture = vi.fn()
    const now = new Date('2026-08-11T12:00:00Z')
    const lastCaptureAt = new Date(now.getTime() - (CAPTURE_MIN_INTERVAL_MINUTES + 1) * 60_000)
    await maybeCaptureVisit({ level: 'foreground_capture', lastCaptureAt, now, onCapture, geolocation: fakeGeolocation() })
    expect(onCapture).toHaveBeenCalledTimes(1)
  })

  it('silently no-ops on permission denial — never throws, never calls onCapture', async () => {
    const onCapture = vi.fn()
    await expect(
      maybeCaptureVisit({
        level: 'foreground_capture',
        lastCaptureAt: null,
        now: new Date(),
        onCapture,
        geolocation: fakeGeolocation('denied'),
      })
    ).resolves.toBeUndefined()
    expect(onCapture).not.toHaveBeenCalled()
  })

  it('silently no-ops when the Geolocation API is unavailable', async () => {
    const onCapture = vi.fn()
    await expect(
      maybeCaptureVisit({
        level: 'foreground_capture',
        lastCaptureAt: null,
        now: new Date(),
        onCapture,
        geolocation: fakeGeolocation('unavailable'),
      })
    ).resolves.toBeUndefined()
    expect(onCapture).not.toHaveBeenCalled()
  })
})
