// Opportunistic foreground visit capture (spec 044 US4) — the feasible replacement for true
// passive background dwell detection (research.md §1). A one-shot, foreground-only location read
// at natural app-open/view moments, throttled, silently no-op on denial/unavailability. Never
// blocks, never nags. Contract: specs/044-financial-routines/contracts/location-and-geocoding.md.

import type { LocationConsentLevel } from '../types'

export const CAPTURE_MIN_INTERVAL_MINUTES = 30

export interface GeolocationLike {
  getCurrentPosition(options?: { enableHighAccuracy?: boolean }): Promise<{
    coords: { latitude: number; longitude: number; accuracy: number | null }
  }>
}

export interface MaybeCaptureVisitArgs {
  level: LocationConsentLevel
  lastCaptureAt: Date | null
  now: Date
  onCapture: (latitude: number, longitude: number, accuracyMeters: number | null) => Promise<void>
  geolocation: GeolocationLike
  captureMinIntervalMinutes?: number
}

/** Capture one location reading if — and only if — the user has opted into
 *  `'foreground_capture'` and the throttle window has elapsed. Every failure mode (permission
 *  denied, API unavailable, timeout) is swallowed silently: a denied/unavailable capture must be
 *  functionally identical to never having opted in past `geocoding` (US4 AC1) — no error surfaced,
 *  no repeated prompting beyond whatever the platform itself does on the first ask. */
export async function maybeCaptureVisit(args: MaybeCaptureVisitArgs): Promise<void> {
  const { level, lastCaptureAt, now, onCapture, geolocation, captureMinIntervalMinutes = CAPTURE_MIN_INTERVAL_MINUTES } = args
  if (level !== 'foreground_capture') return
  if (lastCaptureAt) {
    const minutesSince = (now.getTime() - lastCaptureAt.getTime()) / 60_000
    if (minutesSince < captureMinIntervalMinutes) return
  }
  try {
    const position = await geolocation.getCurrentPosition({ enableHighAccuracy: false })
    await onCapture(position.coords.latitude, position.coords.longitude, position.coords.accuracy ?? null)
  } catch {
    // Permission denied, API unavailable (plain web without geolocation), timeout, etc. — all
    // silent. This function is called opportunistically; it must never throw into its caller.
  }
}
