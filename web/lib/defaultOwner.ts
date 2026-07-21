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
