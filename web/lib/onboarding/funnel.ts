/**
 * spec 045 — the onboarding funnel marker. Records, per device, that a visitor
 * travelled the guided journey rather than arriving cold.
 *
 * Defined here but deliberately unused by this feature (FR-019). The lifecycle spans
 * three features, which is exactly why the contract lives in the foundation:
 *
 *   047 (tour)      markFunnelEntry()    ← the final slide's CTA *and* Skip
 *         ↓
 *      sign-in
 *         ↓
 *   048 (hand-off)  readFunnelEntry()    → true: route into the financial-health
 *                   clearFunnelEntry()          questionnaire, then clear so it
 *                                               fires exactly once
 *
 * Per-device localStorage, mirroring components/announcements/announcementsSeen.ts and
 * components/settings/textSize.ts: fully guarded access that never throws (no
 * localStorage during SSR; SecurityError in Safari private mode / with storage
 * disabled). No account, no server, no schema change.
 *
 * A single presence bit — no identifier, no timestamp, no locale, no path (FR-018).
 */

const STORAGE_KEY = 'ortho.onboardingFunnel'
const MARKED = '1'

/** Record that this device came through the onboarding journey. Best-effort. */
export function markFunnelEntry(): void {
  try {
    localStorage.setItem(STORAGE_KEY, MARKED)
  } catch {
    // Storage unavailable — the visitor simply gets the ordinary post-sign-in path.
  }
}

/**
 * Whether this device travelled the journey. Strict: anything other than exactly '1'
 * reads false, so a key collision or a truncated write can never trigger a hand-off
 * the visitor did not earn.
 */
export function readFunnelEntry(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === MARKED
  } catch {
    return false
  }
}

/** Clear the marker. Called once it has been acted on, so the hand-off fires once. */
export function clearFunnelEntry(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Storage unavailable — nothing was persisted to remove.
  }
}
