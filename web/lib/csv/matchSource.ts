// Pick a household payment source (card) that matches the imported bank, so an
// imported statement seeds its "Paid with" from an existing card automatically
// (e.g. a "Chase (Credit Card CSV)" import → a card named "Chase Sapphire").
// Returns '' when nothing matches — the row is then flagged "No source" for the
// user to set. Heuristic and forgiving: a miss just means the user picks it.

// Short/alternate spellings that a card name might use, keyed by profile id.
// The bank's display name (from the profile label) is always tried first.
const ALIASES: Record<string, string[]> = {
  'amex-csv': ['american express'],
  bofa: ['bofa', 'boa'],
  'td-bank-csv': ['td'],
  'capital-one': ['capitalone'],
  'wells-fargo': ['wells'],
}

/** The bank's plain name from a profile label: "Chase (Credit Card CSV)" → "Chase". */
export function bankNameFromLabel(label: string): string {
  return label.replace(/\(.*\)/, '').trim()
}

/**
 * First card name that looks like it belongs to `bankId`, else '' (no match).
 * Case-insensitive substring match against the bank name + its aliases.
 */
export function matchSourceForBank(bankId: string, label: string, cardNames: string[]): string {
  const base = bankNameFromLabel(label).toLowerCase()
  const keywords = [base, ...(ALIASES[bankId] ?? [])].filter(Boolean)
  for (const name of cardNames) {
    const low = name.toLowerCase()
    if (keywords.some((k) => low.includes(k))) return name
  }
  return ''
}
