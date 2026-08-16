// Inference tiers for parsed candidates (spec 021, ported from
// iOS/Ortho-iOS/Services/Scan/ScanInference.swift): 1) the household's own
// history with the merchant, 2) the CLI-ported category rule table
// (scanHeuristics.ruleCategory), 3) nothing — the form default stands.
// (The optional on-device refiner, tier 2.5 for merchant cleanup only, has
// no web equivalent and NEVER runs inside parse — determinism contract.)
//
// Per research.md Decision 4, this port is MORE correct than the Swift
// original: the merchant/transaction history it needs already lives
// client-side in web/lib/store.tsx's in-memory state, so `buildScanContext`
// below reads it directly — no bridge round-trip, unlike the native
// AppState -> ScanContext snapshot it mirrors.
//
// Pure: everything arrives via ScanContext (or, for buildScanContext, via
// its own explicit `transactions`/`now` arguments) — no clock, no live
// collections, no hidden globals.

import { normalizeMerchant, ruleCategory } from './scanHeuristics'
import { orderedOwnerIds } from '../splits'
import type {
  CurrencyCode,
  ExistingTransactionDay,
  MerchantHistory,
  ParsedCandidate,
  PartialDate,
  ScanContext,
} from './scanModels'
import type { Transaction, TransactionCategory } from '../types'

// ---------------------------------------------------------------------------
// enrich — history/category/owners guesses + duplicate claiming
// ---------------------------------------------------------------------------

/** Enrich one candidate: history/category/owners guesses plus greedy
 *  one-to-one duplicate claiming against `claimed` (FR-015). Returns a new
 *  candidate (the input is never mutated); `claimed` IS mutated in place —
 *  pass the same `Set` across every candidate parsed in one session so an
 *  existing transaction is claimed by at most one candidate. */
export function enrichCandidate(
  candidate: ParsedCandidate,
  context: ScanContext,
  claimed: Set<string>
): ParsedCandidate {
  const c: ParsedCandidate = { ...candidate, guesses: new Set(candidate.guesses) }

  // Payment rows are default-skipped wholesale — no guesses (FR-012).
  // Credits prefill as income, whose category the form locks — no guess.
  if (!c.isPaymentRow && c.direction === 'debit') {
    const match = historyMatch(c.merchantRaw, context.merchantHistory)
    if (match) {
      // Adopt the household's own spelling — their data, not a guess.
      c.merchant = match.displayMerchant
      c.categoryGuess = match.category
      c.guesses.add('category')
      if (match.owners.length > 0) {
        c.ownersGuess = match.owners
        c.guesses.add('owners')
      }
      // spec 053 — carry the payer forward with the owners, so a scanned receipt for a
      // known merchant records who usually fronts it rather than nobody.
      if (match.paidBy) c.paidByGuess = match.paidBy
    } else {
      const rule = ruleCategory(c.merchantRaw)
      if (rule) {
        c.categoryGuess = rule
        c.guesses.add('category')
      }
    }
  }

  // Duplicate: same calendar day + same amount, USD candidates only
  // (foreign totals aren't comparable to stored USD cents without a rate).
  // Each existing transaction is claimable once per session.
  if (c.currency === 'usd' && c.date !== null) {
    const day = c.date
    const hit = context.existingTransactionDays.find(
      (existing) => !claimed.has(existing.id) && existing.amountCents === c.amountCents && sameDay(existing.day, day)
    )
    if (hit) {
      c.duplicateOf = hit.id
      claimed.add(hit.id)
    }
  }

  return c
}

/** History lookup: normalized-key equality or prefix containment either way
 *  ("TRADERJOES" <-> "TRADERJOESNEWYORK"), minimum 4 chars so junk prefixes
 *  can't match. Ranking: dominant count, then recency; ties keep whichever
 *  entry was encountered first (matches Swift's `max(by:)`, which only
 *  replaces the running max on a STRICT improvement). */
function historyMatch(merchant: string, history: MerchantHistory[]): MerchantHistory | null {
  const key = normalizeMerchant(merchant)
  if (key.length < 4) return null
  const hits = history.filter((entry) => {
    const h = entry.normalizedMerchant
    if (h.length < 4) return false
    return h === key || key.startsWith(h) || h.startsWith(key)
  })
  let best: MerchantHistory | null = null
  for (const entry of hits) {
    if (
      !best ||
      entry.count > best.count ||
      (entry.count === best.count && dayOrdinal(entry.lastDay) > dayOrdinal(best.lastDay))
    ) {
      best = entry
    }
  }
  return best
}

function sameDay(a: PartialDate, b: PartialDate): boolean {
  return a.year === b.year && a.month === b.month && a.day === b.day
}

function dayOrdinal(d: PartialDate | null): number {
  if (!d) return 0
  return d.year * 10000 + d.month * 100 + d.day
}

// ---------------------------------------------------------------------------
// Context building (app side — the only non-test caller)
// ---------------------------------------------------------------------------

/** Local calendar day (year/month/day) of a Date, mirroring the rest of
 *  web/lib's Date-arithmetic convention (e.g. finance/insights.ts) — the
 *  device's local timezone, never UTC. */
function dayOf(d: Date): PartialDate {
  return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() }
}

interface CategoryStat {
  count: number
  lastDate: Date
}

interface Group {
  byCategory: Map<TransactionCategory, CategoryStat>
  /** The most recent transaction seen so far for this merchant — supplies
   *  the group's display spelling, owners, and lastDay. */
  latest: Transaction
  latestDate: Date
}

/** Snapshot the app's in-memory transactions into a pure ScanContext. `now`
 *  is the injected reference day (fixed under -uiDemoScan-equivalent demo
 *  modes, the real clock otherwise) — injected here at the boundary so
 *  everything downstream of `enrichCandidate` stays deterministic. */
export function buildScanContext(
  transactions: Transaction[],
  defaultCurrency: CurrencyCode,
  now: Date
): ScanContext {
  const existingTransactionDays: ExistingTransactionDay[] = transactions.map((tx) => ({
    id: tx.id,
    day: dayOf(new Date(tx.date)),
    amountCents: tx.amount_cents,
  }))

  // History: expenses only, grouped by normalized merchant; the dominant
  // category wins (ties -> most recent); display spelling and owners come
  // from the group's most recent transaction. (Grouping via a Map keeps
  // iteration order deterministic — an improvement over Swift's Dictionary,
  // whose iteration order is unspecified; see research.md Decision 4.)
  const groups = new Map<string, Group>()
  for (const tx of transactions) {
    if (tx.kind !== 'expense') continue
    const key = normalizeMerchant(tx.merchant)
    if (key.length < 4) continue
    const txDate = new Date(tx.date)
    let group = groups.get(key)
    if (!group) {
      group = { byCategory: new Map(), latest: tx, latestDate: txDate }
      groups.set(key, group)
    }
    const prior = group.byCategory.get(tx.category)
    group.byCategory.set(tx.category, {
      count: (prior?.count ?? 0) + 1,
      lastDate: prior && prior.lastDate > txDate ? prior.lastDate : txDate,
    })
    if (txDate > group.latestDate) {
      group.latest = tx
      group.latestDate = txDate
    }
  }

  const merchantHistory: MerchantHistory[] = Array.from(groups.entries()).map(([key, group]) => {
    let dominant: TransactionCategory | null = null
    let dominantStat: CategoryStat | null = null
    for (const [category, stat] of group.byCategory) {
      if (
        !dominantStat ||
        stat.count > dominantStat.count ||
        (stat.count === dominantStat.count && stat.lastDate > dominantStat.lastDate)
      ) {
        dominant = category
        dominantStat = stat
      }
    }
    let totalCount = 0
    for (const stat of group.byCategory.values()) totalCount += stat.count
    return {
      normalizedMerchant: key,
      displayMerchant: group.latest.merchant,
      category: dominant ?? group.latest.category,
      count: totalCount,
      lastDay: dayOf(group.latestDate),
      owners: orderedOwnerIds(group.latest.owner_ids),
      // spec 053 — carry the payer forward with the owners. A scanned receipt for a merchant
      // the household already knows should record who usually fronts it, not nobody.
      paidBy: group.latest.paid_by ?? null,
    }
  })

  return {
    referenceDay: dayOf(now),
    defaultCurrency,
    merchantHistory,
    existingTransactionDays,
  }
}
