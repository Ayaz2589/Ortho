// The default owner/payer for a new or imported transaction: the current
// person, else the first household member, else the auth user. Shared by the
// transaction form (TxForm) and CSV import (useCsvImport) so hand-entered and
// imported rows resolve their owner the same way.
export function resolveDefaultOwnerId(
  currentPersonId: string | null | undefined,
  householdMembers: { id: string }[],
  currentUserId: string | null | undefined
): string {
  return currentPersonId || householdMembers[0]?.id || currentUserId || ''
}

/**
 * The owner set a NEW expense/income transaction starts with (spec 050).
 *
 * Before this, every entry path defaulted to a single owner — the logged-in person — so a
 * multi-adult household produced a ledger indistinguishable from a solo one unless someone
 * opened the owner picker on every entry. Under the handler pattern (one person entering for
 * several who have no account) that default is not merely ambiguous, it is systematically
 * wrong: everything lands on the handler and nobody is there to notice.
 *
 * Returns EVERY active person when the household has more than one and the preference is on;
 * otherwise the single-owner result, byte-identical to `resolveDefaultOwnerId`.
 *
 * Callers must pass ACTIVE people only (soft-removed people must never be defaulted into
 * ownership, FR-004), and must NOT call this when editing an existing transaction — a default
 * may never silently re-attribute money a user already recorded (FR-005).
 */
export function resolveDefaultOwnerIds(
  currentPersonId: string | null | undefined,
  activePeople: { id: string }[],
  currentUserId: string | null | undefined,
  sharedByDefault: boolean
): string[] {
  const solo = resolveDefaultOwnerId(currentPersonId, activePeople, currentUserId)
  if (!sharedByDefault || activePeople.length < 2) return [solo]
  return activePeople.map((p) => p.id)
}
