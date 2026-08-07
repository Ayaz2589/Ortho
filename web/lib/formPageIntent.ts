// Pure parsers for the transient navigation intent the mobile new/edit pages
// carry in their query string (spec 025, data-model.md). Kept DOM-free so they
// are unit-tested in isolation; the pages read `window.location.search` in a
// mount effect and hand the string here (NOT useSearchParams — see research D2).

import type { PropertyKind } from './types'

export interface TxNewParams {
  /** Copy an existing transaction (by id) into a fresh add form. */
  copyFrom: string | null
}

/**
 * Parse the add-transaction page params. A missing/blank `copyFrom` degrades to a
 * blank add form (never throws).
 */
export function parseTxNewParams(search: string): TxNewParams {
  const p = new URLSearchParams(search)
  const copyFrom = p.get('copyFrom')
  return { copyFrom: copyFrom && copyFrom.length > 0 ? copyFrom : null }
}

/** The `id` of the entity an edit page targets, or null if absent/blank. */
export function parseIdParam(search: string): string | null {
  const id = new URLSearchParams(search).get('id')
  return id && id.trim().length > 0 ? id.trim() : null
}

const PROPERTY_KINDS: readonly PropertyKind[] = ['primary_home', 'multifamily', 'rental']

/** A valid `PropertyKind` from `?kind=`, or null (⇒ show the in-page picker). */
export function parseKindParam(search: string): PropertyKind | null {
  const k = new URLSearchParams(search).get('kind')
  return k && (PROPERTY_KINDS as readonly string[]).includes(k) ? (k as PropertyKind) : null
}
