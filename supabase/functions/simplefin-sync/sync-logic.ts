// Spec 028 — pure decision helpers for simplefin-sync, extracted so they can be
// unit-tested under Deno without a network or database (mirrors the pattern in
// plaid-exchange/completion.ts). No I/O here.

/** Manual-refresh cooldown: refuse a manual sync within this window (research D5). */
export const MANUAL_REFRESH_COOLDOWN_MS = 60 * 60 * 1000 // 1 hour

/** True when a manual refresh is still inside its cooldown and must be refused. */
export function isManualRefreshBlocked(
  lastManualRefreshAt: string | null,
  nowMs: number,
  cooldownMs: number = MANUAL_REFRESH_COOLDOWN_MS
): boolean {
  if (!lastManualRefreshAt) return false
  const last = Date.parse(lastManualRefreshAt)
  if (!Number.isFinite(last)) return false
  return nowMs - last < cooldownMs
}

export interface HouseholdPerson {
  id: string
  linked_user_id: string | null
  sort_order: number
  removed_at: string | null
}

/**
 * Pick the household_people id that receives a synced transaction's default 100%
 * split (research D7): the person linked to the connecting member, else the
 * lowest sort_order non-removed person. Returns null if the household has no
 * usable person (sync then cannot write and reports sync_failed).
 */
export function pickDefaultPerson(
  people: HouseholdPerson[],
  createdBy: string
): string | null {
  const active = people.filter((p) => !p.removed_at)
  const linked = active.find((p) => p.linked_user_id === createdBy)
  if (linked) return linked.id
  const byOrder = [...active].sort((a, b) => a.sort_order - b.sort_order)
  return byOrder[0]?.id ?? null
}
