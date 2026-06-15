// Duplicate detection. A row is a probable duplicate of an already-imported one
// when (creator, day, amount, bank/source) match — description is intentionally
// ignored (FR-024, per operator request). Matches are FLAGGED and excluded by
// default (so re-runs stay idempotent), but shown in review so the operator can
// re-include a genuine separate charge. We compare only against existing DB rows,
// never within the batch, so two legitimately-identical charges both import.
import type { ParsedTransaction } from './types'

export function dedupeKey(createdBy: string, dateISO: string, amountCents: number, source: string): string {
  return `${createdBy}|${dateISO.slice(0, 10)}|${amountCents}|${source.toLowerCase().trim()}`
}

export interface ExistingRow {
  created_by: string
  date: string
  amount_cents: number
  source: string
}

/**
 * Flag rows that duplicate an existing DB row (same day + amount + source).
 * Mutates each match: `duplicate = true`, `excluded = true`, reason `'duplicate'`
 * (unless the row is already excluded for another reason). Returns the count flagged.
 */
export function markDuplicates(
  rows: ParsedTransaction[],
  existing: ExistingRow[],
  createdBy: string,
  source: string
): number {
  const seen = new Set(existing.map((e) => dedupeKey(e.created_by, e.date, e.amount_cents, e.source)))
  let flagged = 0
  for (const r of rows) {
    if (r.excluded) continue // already excluded (non-spending) — won't import anyway
    if (seen.has(dedupeKey(createdBy, r.dateISO, r.amountCents, source))) {
      r.duplicate = true
      r.excluded = true
      r.excludeReason = 'duplicate'
      flagged++
    }
  }
  return flagged
}
