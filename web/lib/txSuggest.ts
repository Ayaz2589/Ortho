// Spec 032 — pure suggestion logic for the add/edit transaction form.
//
// Two views derived from the household's own ledger, both reusing the tested
// merchant primitives from lib/csv/merchantSuggest.ts (they operate on plain
// `{ merchant }` rows and are not actually CSV-specific):
//   1. mostCommonTransactions — powers the "Copy from most common" shortcut.
//   2. knownNamesForKind      — the kind-aware vocabulary for name suggestions.
//
// No I/O, no clock: pure and deterministic so the ordering can be locked by unit
// tests (Constitution VI). See specs/032-common-copy-name-suggest/.
import type { Transaction, TransactionKind } from '@/lib/types'
import { rankedMerchants } from '@/lib/csv/merchantSuggest'
import { normalizeMerchant } from '@/lib/csv/duplicateMatch'

const DEFAULT_LIMIT = 40

function txTime(tx: Transaction): number {
  const t = new Date(tx.date).getTime()
  // Guard an unparseable date so it can't poison the sort comparator with NaN
  // (unreachable with DB-sourced ISO dates, but keeps ordering total & stable).
  return Number.isNaN(t) ? 0 : t
}

/**
 * The household's MOST COMMON transactions: distinct merchants, each represented
 * by that merchant's most-recent entry (so a picked row prefills a real amount /
 * category / source / splits). Entries with no merchant (transfers, blanks) are
 * excluded.
 *
 * Two-stage and deterministic:
 *   1. SELECT which merchants make the list, by frequency (count desc → most-recent
 *      representative date desc → normalized merchant asc), truncated to `limit`.
 *   2. PRESENT the survivors grouped by category (slug asc), then alphabetically
 *      by merchant name (case-insensitive) within each category.
 */
export function mostCommonTransactions(
  transactions: Transaction[],
  limit: number = DEFAULT_LIMIT,
): Transaction[] {
  const groups = new Map<string, { rep: Transaction; count: number }>()
  for (const tx of transactions) {
    const key = normalizeMerchant(tx.merchant)
    if (!key) continue // transfers / blank merchants drop out here
    const group = groups.get(key)
    if (!group) {
      groups.set(key, { rep: tx, count: 1 })
    } else {
      group.count++
      if (txTime(tx) > txTime(group.rep)) group.rep = tx
    }
  }
  // Stage 1 — frequency decides membership (which merchants make the list).
  const selected = [...groups.entries()]
    .sort(([keyA, a], [keyB, b]) => {
      if (b.count !== a.count) return b.count - a.count
      const byDate = txTime(b.rep) - txTime(a.rep)
      if (byDate !== 0) return byDate
      return keyA < keyB ? -1 : keyA > keyB ? 1 : 0
    })
    .slice(0, Math.max(0, limit))
    .map(([, group]) => group.rep)
  // Stage 2 — present grouped by category, alphabetical by merchant within each.
  return selected.sort(byCategoryThenName)
}

/** Category slug asc, then merchant name asc (case-insensitive; stable final tiebreak). */
function byCategoryThenName(a: Transaction, b: Transaction): number {
  if (a.category !== b.category) return a.category < b.category ? -1 : 1
  const an = a.merchant.toLowerCase()
  const bn = b.merchant.toLowerCase()
  if (an !== bn) return an < bn ? -1 : 1
  return a.merchant < b.merchant ? -1 : a.merchant > b.merchant ? 1 : 0
}

/**
 * Distinct known names for a given kind — expense merchants vs income payers —
 * most-frequent first. The suggestion vocabulary for the form's name input:
 * keeping the pools separate means a payroll payer never leaks into shopping
 * suggestions (and vice-versa). Blank names are excluded (via rankedMerchants).
 */
export function knownNamesForKind(
  transactions: Transaction[],
  kind: Extract<TransactionKind, 'expense' | 'income'>,
): string[] {
  return rankedMerchants(transactions.filter((tx) => tx.kind === kind))
}
