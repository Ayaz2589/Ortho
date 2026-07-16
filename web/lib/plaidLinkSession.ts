/**
 * The client's pending-connection record (spec 024,
 * contracts/link-session-lifecycle.md). While a Plaid Link attempt is in
 * flight, exactly one small record lives in localStorage so the web OAuth
 * return route and the iOS hand-back/foreground-poll paths can resume it.
 * It stores the short-lived link token and ids — NEVER a public token, an
 * access token, or anything from an exchange response (SC-002).
 */
import type { LinkMode } from './aggregation'

export type PendingLinkSession = {
  sessionId: string
  linkToken: string
  mode: LinkMode
  expiresAt: string
}

export const PENDING_LINK_SESSION_KEY = 'ortho.plaid.pendingLinkSession'

/** Plaid keeps a finished hosted session's results retrievable for ~6h AFTER
 *  the link token expires (research.md D3) — a hosted record must survive
 *  that long so a member who finished in the browser last night still lands
 *  their bank this morning (review 024). Embedded records die with the token:
 *  the token IS the session there. */
const HOSTED_RESULTS_GRACE_MS = 6 * 60 * 60 * 1000

export function savePendingLinkSession(session: PendingLinkSession): void {
  try {
    window.localStorage.setItem(PENDING_LINK_SESSION_KEY, JSON.stringify(session))
  } catch {
    // Storage unavailable (private mode quota etc.) — the flow still works,
    // it just cannot resume after a redirect; calm degradation.
  }
}

export function clearPendingLinkSession(): void {
  try {
    window.localStorage.removeItem(PENDING_LINK_SESSION_KEY)
  } catch {
    // Nothing to clean if storage itself is unavailable.
  }
}

/** Read the pending record, if any. `now` is injected by callers (foreground
 *  checks pass the current time; tests pass a fixed one — never the real
 *  clock inside here). Expired or malformed records are cleared and read as
 *  null: the member simply starts over (calm reset, spec edge cases). */
export function readPendingLinkSession(now: Date): PendingLinkSession | null {
  let raw: string | null = null
  try {
    raw = window.localStorage.getItem(PENDING_LINK_SESSION_KEY)
  } catch {
    return null
  }
  if (raw === null) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    clearPendingLinkSession()
    return null
  }

  const r = parsed as PendingLinkSession | null
  const shapeOk =
    typeof r === 'object' &&
    r !== null &&
    typeof r.sessionId === 'string' &&
    typeof r.linkToken === 'string' &&
    (r.mode === 'embedded' || r.mode === 'hosted') &&
    typeof r.expiresAt === 'string'
  if (!shapeOk) {
    clearPendingLinkSession()
    return null
  }

  const expiresAtMs = new Date(r.expiresAt).getTime()
  const effectiveExpiryMs =
    r.mode === 'hosted' ? expiresAtMs + HOSTED_RESULTS_GRACE_MS : expiresAtMs
  if (effectiveExpiryMs <= now.getTime()) {
    clearPendingLinkSession()
    return null
  }

  return { sessionId: r.sessionId, linkToken: r.linkToken, mode: r.mode, expiresAt: r.expiresAt }
}
