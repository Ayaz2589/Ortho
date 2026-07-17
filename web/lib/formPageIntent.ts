// Pure parsers for the transient navigation intent the mobile new/edit pages
// carry in their query string (spec 025, data-model.md). Kept DOM-free so they
// are unit-tested in isolation; the pages read `window.location.search` in a
// mount effect and hand the string here (NOT useSearchParams — see research D2).

import type { PropertyKind } from './types'

export interface TxNewParams {
  /** Copy an existing transaction (by id) into a fresh add form. */
  copyFrom: string | null
  /** Open the add form directly in "Settle up" transfer mode, pre-filled. */
  transfer: { from: string; to: string; amountCents: number } | null
}

/**
 * Parse the add-transaction page params. A valid settle-up transfer
 * (`from`+`to`+non-negative-integer `amount`) takes precedence over `copyFrom`;
 * anything missing/malformed degrades to a blank add form (never throws).
 */
export function parseTxNewParams(search: string): TxNewParams {
  const p = new URLSearchParams(search)
  const from = p.get('from')
  const to = p.get('to')
  const amountRaw = p.get('amount')
  if (from && to && amountRaw !== null && amountRaw.trim() !== '') {
    const amountCents = Number(amountRaw)
    if (Number.isInteger(amountCents) && amountCents >= 0) {
      return { copyFrom: null, transfer: { from, to, amountCents } }
    }
  }
  const copyFrom = p.get('copyFrom')
  return { copyFrom: copyFrom && copyFrom.length > 0 ? copyFrom : null, transfer: null }
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
