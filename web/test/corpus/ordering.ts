// Owner-ordering helpers (spec 026). Thin, read-only wrappers so the A4
// reproduction test derives orderings the SAME way the two code paths do — the
// app canonicalizes by lexical id (orderedOwnerIds), the import CLI orders by
// household_people.sort_order (import/db/lookups.ts `.order('sort_order')`). No
// new math lives here.

import { orderedOwnerIds } from '@/lib/splits'
import type { Person } from '@/lib/types'

/** App/iOS regime: owner ids in canonical lexical order. */
export function byCanonical(personIds: string[]): string[] {
  return orderedOwnerIds(personIds)
}

/**
 * Import-CLI regime: the given people ordered by `sort_order` ascending (ties
 * broken by id for stability), returned as ids. Mirrors the DB `.order(
 * 'sort_order')` the CLI relies on.
 */
export function bySortOrder(people: Person[]): string[] {
  return [...people]
    .sort((a, b) => a.sort_order - b.sort_order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((p) => p.id)
}
