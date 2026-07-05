import {
  DUNNING_GRACE_DAYS,
  LEEWAY_HOURS,
  type EntitlementSnapshot,
  type GateState,
} from './states.ts'

const HOUR_MS = 3_600_000
const DAY_MS = 86_400_000

/**
 * The cross-surface gate derivation. Mirrored BY HAND in web/lib/entitlements.ts and
 * iOS Shared/EntitlementLogic.swift; all three are locked by the identical literal
 * vectors (V01–V19 + digest) — see contracts/entitlement-state.md. Rules evaluate
 * top-down, first match wins; every expiry comparison is STRICT `<` (an instant
 * exactly on a window boundary is outside it).
 */
export function deriveGateState(row: EntitlementSnapshot, nowIso: string): GateState {
  if (row.status === 'admin') return 'admin'
  if (row.accessExpiresAt === null) return 'lapsed'

  const now = Date.parse(nowIso)
  const expires = Date.parse(row.accessExpiresAt)

  switch (row.status) {
    case 'trialing':
      return now < expires + LEEWAY_HOURS * HOUR_MS ? 'trialing' : 'lapsed'
    case 'active':
      return now < expires + LEEWAY_HOURS * HOUR_MS ? 'active' : 'lapsed'
    case 'past_due':
      return now < expires + LEEWAY_HOURS * HOUR_MS + DUNNING_GRACE_DAYS * DAY_MS
        ? 'grace'
        : 'lapsed'
    case 'canceled':
      // Paid-through: access until the period end, deliberately with NO leeway.
      return now < expires ? 'active' : 'lapsed'
    case 'paused':
    case 'unpaid':
      return 'lapsed'
  }
}
