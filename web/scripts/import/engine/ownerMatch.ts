// Resolve a statement cardholder name to an Ortho user by FIRST NAME (case-
// insensitive), falling back to the operator. Used to default the owner on
// multi-cardholder statements (Amex). Pure.
import type { User } from '../../../lib/types'

const firstName = (name: string) => name.trim().split(/\s+/)[0]?.toLowerCase() ?? ''

export function matchOwnerByName(cardMember: string | undefined, users: User[], fallbackId: string): string {
  if (!cardMember) return fallbackId
  const first = firstName(cardMember)
  if (!first) return fallbackId
  const hit = users.find((u) => firstName(u.name) === first)
  return hit ? hit.id : fallbackId
}
