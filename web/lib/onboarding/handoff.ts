/**
 * spec 048 — where a user goes immediately after signing in.
 *
 * The onboarding funnel ends at sign-in; this decides what happens next. Someone
 * who read a landing page and took the tour is mid-journey, and dropping them on
 * an empty dashboard wastes the momentum — they continue into the financial-health
 * questionnaire instead. Everyone else keeps today's behavior exactly.
 *
 *   047 (tour)      markFunnelEntry()
 *         ↓
 *      sign-in      verify() → resolvePostSignInRoute()   ← here
 *         ↓
 *   048 (this)      marker present → clear it, suppress the duplicate
 *                                    announcement, hand off
 *                   marker absent  → /dashboard, writing nothing
 *
 * **This is a deliberate, SCOPED reversal of spec 042.** Spec 041 hard-redirected
 * every profile-less user into the questionnaire; 042 deleted that on purpose and
 * replaced it with a dismissible announcement. The hard hand-off returns for
 * funnel-walkers ONLY — hence the decision keys on the marker, never on profile
 * absence. Widening it would undo 042 for everyone.
 *
 * The profile check deliberately lives elsewhere: app/sign-in/page.tsx renders
 * outside AppStateProvider and cannot read `userFinancialProfile`, so a user who
 * already has one is turned away at the questionnaire's entry guard instead
 * (app/(app)/welcome/financial-profile/page.tsx). That split is why the spec
 * separates FR-004 from FR-001.
 */

import { markAnnouncementSeen } from '@/components/announcements/announcementsSeen'
import { FINANCIAL_HEALTH_ANNOUNCEMENT_ID } from '@/components/announcements/registry'
import { clearFunnelEntry, readFunnelEntry } from './funnel'

/** Where sign-in has always led, and still leads for everyone but a funnel newcomer. */
export const DEFAULT_POST_SIGN_IN_ROUTE = '/dashboard'

/** The financial-health questionnaire — the funnel's final step. */
export const HANDOFF_ROUTE = '/welcome/financial-profile'

/**
 * Decide where a just-signed-in user goes, consuming the funnel marker if present.
 * Call exactly once per successful sign-in, immediately before navigating.
 *
 * Never throws: every storage access sits behind an already-guarded helper, so a
 * browser with storage disabled simply takes the ordinary path. On that ordinary
 * path nothing at all is written — a user who did not walk the funnel must reach
 * the dashboard with their "what's new" announcement untouched.
 */
export function resolvePostSignInRoute(): string {
  if (!readFunnelEntry()) return DEFAULT_POST_SIGN_IN_ROUTE

  // Consume the marker before returning: the caller navigates on this value, and
  // a Back into /sign-in must not fire a second hand-off.
  clearFunnelEntry()
  // They are being handed the questionnaire right now, so the announcement
  // offering that same questionnaire must not greet them on the dashboard later —
  // whether they complete it, skip it, or close the tab midway.
  markAnnouncementSeen(FINANCIAL_HEALTH_ANNOUNCEMENT_ID)

  return HANDOFF_ROUTE
}
