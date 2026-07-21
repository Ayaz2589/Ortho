// Fuzzy duplicate detection for CSV import against the existing ledger.
//
// A parsed row is a probable duplicate of an existing transaction when they fall
// on the same day, for the same amount, AND their merchant names look like the
// same merchant. Merchant text reaches us three ways — hand-typed by the user,
// pulled from a bank's CSV descriptor, or (later) fetched from a bank API — so
// the same shop can read as "Amazon", "Amazon Prime", or "AMZN Mktp US*". We
// therefore normalize aggressively and treat names as equal when one contains
// the other or they share a significant word, rather than requiring an exact
// string match.
//
// Deliberately does NOT key on `source` (unlike the CLI's engine/dedupe.ts): a
// manually-added transaction's source is a card name while an import stamps the
// bank label, so a source-sensitive match would never catch a hand-entered
// duplicate — the case this is here to catch. Matches are flagged (excluded by
// default, shown in review with "Include anyway"), never silently dropped.

export interface DuplicateCandidate {
  id: string
  date: string // YYYY-MM-DD (local calendar day)
  amountCents: number
  merchant: string
}

// Generic words that carry no merchant identity — ignored when comparing tokens
// so "Acme Inc" and "Acme LLC" still match on "acme".
const STOPWORDS = new Set([
  'the', 'inc', 'llc', 'ltd', 'co', 'com', 'corp', 'usa', 'us',
  'payment', 'purchase', 'pos', 'debit', 'card', 'online',
])

/** Lowercase, strip punctuation, and drop long digit runs (store #s, ref codes). */
export function normalizeMerchant(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ') // punctuation → space
    .replace(/\b\d{2,}\b/g, ' ') // store numbers / reference codes
    .replace(/\s+/g, ' ')
    .trim()
}

function significantTokens(name: string): Set<string> {
  return new Set(
    normalizeMerchant(name)
      .split(' ')
      .filter((w) => w.length >= 3 && !STOPWORDS.has(w))
  )
}

/** True when two merchant strings probably name the same merchant. */
export function merchantsSimilar(a: string, b: string): boolean {
  const na = normalizeMerchant(a)
  const nb = normalizeMerchant(b)
  if (!na || !nb) return false
  if (na === nb) return true
  // One normalized name contained in the other ("amazon" ⊂ "amazon prime").
  // Guard on length so a 1–2 char fragment can't match half the ledger.
  const shorter = na.length <= nb.length ? na : nb
  if (shorter.length >= 3 && (na.includes(nb) || nb.includes(na))) return true
  // Otherwise, a shared significant word is enough ("Amazon Prime" vs
  // "Amazon Payments" both keep "amazon").
  const ta = significantTokens(a)
  for (const w of significantTokens(b)) {
    if (ta.has(w)) return true
  }
  return false
}

// Days of slack allowed between the two dates. A card's transaction date and
// its post date differ by a day or three, and a hand-entered charge is often
// dated the day the user noticed it rather than the day it cleared — so an
// exact-day match misses real duplicates. Kept small so a monthly subscription
// (same merchant + amount, ~30 days apart) is NOT flagged against last month's.
const DEFAULT_DAY_WINDOW = 3

/** Absolute whole-day difference between two YYYY-MM-DD strings. */
function dayDiff(a: string, b: string): number {
  const da = Date.parse(a.slice(0, 10) + 'T12:00:00Z')
  const db = Date.parse(b.slice(0, 10) + 'T12:00:00Z')
  if (Number.isNaN(da) || Number.isNaN(db)) return Infinity
  return Math.abs(Math.round((da - db) / 86_400_000))
}

/**
 * The id of an existing transaction this row probably duplicates, or null.
 * Same amount + similar merchant + dates within `windowDays`. Household-wide
 * (any owner); the closest-dated match wins.
 */
export function findDuplicateId(
  row: { dateISO: string; amountCents: number; merchant: string },
  existing: DuplicateCandidate[],
  windowDays: number = DEFAULT_DAY_WINDOW
): string | null {
  let best: { id: string; diff: number } | null = null
  for (const e of existing) {
    if (e.amountCents !== row.amountCents) continue
    const diff = dayDiff(e.date, row.dateISO)
    if (diff > windowDays) continue
    if (!merchantsSimilar(row.merchant, e.merchant)) continue
    if (!best || diff < best.diff) best = { id: e.id, diff }
  }
  return best?.id ?? null
}
