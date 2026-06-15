// Codified merchant → category rules (no LLM). First match wins; income rows are
// always 'income'; unmatched expenses fall back to 'entertainment'. The operator
// can override any suggestion during review.
import type { TransactionCategory, TransactionKind } from '../../../lib/types'

interface Rule {
  pattern: RegExp
  category: TransactionCategory
}

// Ordered most-specific-first. Patterns are tested against the UPPERCASED merchant.
const RULES: Rule[] = [
  { pattern: /UBER\s*EATS|UBEREATS|GRUBHUB|DOORDASH|SEAMLESS/, category: 'dining' },
  { pattern: /INSTACART|H\s*MART|HMART|GROCER|SUPERMARKET|TRADER JOE|WHOLE FOODS|KEY FOOD/, category: 'groceries' },
  { pattern: /UBER\s*ONE|UBERONE/, category: 'subs' },
  { pattern: /PLAYSTATION|COURSERA|SUBSCRIPTION|TMNA|NETFLIX|SPOTIFY|HULU|DISNEY|PATREON|ICLOUD|APPLE\.COM|APPLE ONE|OPENAI|CHATGPT|CLAUDE|ANTHROPIC|\bWISPR\b|AMAZON WEB SERVICES|\bAWS\b|PEACOCK|HBO|\bMAX\b|PARAMOUNT|YOUTUBE PREMIUM|MIDJOURNEY|GITHUB/, category: 'subs' },
  { pattern: /STARBUCKS|DUNKIN|\bCOFFEE\b|JOE\s*AND\s*THE\s*JUIC/, category: 'coffee' },
  { pattern: /\bUBER\b|CURB|TAXI|NYCT|PAYGO|\bPATH\b|\bMTA\b|LYFT|TRANSIT|\bCLEAR\b/, category: 'transit' },
  { pattern: /EXXON|MOBIL|SHELL|\bBP\b|CHEVRON|GULF|SUNOCO|\bFUEL\b|GAS STATION/, category: 'fuel' },
  { pattern: /CON\s*ED|CONED|NATIONAL GRID|VERIZON|T-?MOBILE|SPECTRUM|PSEG|\bWATER\b|UTILITY|MAINTENANCE FEE|BANK FEE|PLUMBING/, category: 'utilities' },
  { pattern: /\bCVS\b|PHARMACY|WALGREENS|\bHIMS\b|\bHERS\b|HEALTH|DENTAL|DOCTOR|CLINIC|HOSPITAL|FITNESS|\bGYM\b|EQUINOX|PELOTON/, category: 'health' },
  { pattern: /\bRENT\b|MORTGAGE|\bLEASE\b/, category: 'rent' },
  { pattern: /RESTAURANT|\bCAFE\b|\bDELI\b|BAKERY|GRILL|KITCHEN|PIZZA|SUSHI|EATERY|DINER|TST\*|BRASIL|SAKAGURA|BANGLAD|EXOTIQ|HABIT|DONER/, category: 'dining' },
]

/** Suggest a category from a (cleaned) merchant name and the row's kind. */
export function categorize(merchant: string, kind: TransactionKind): TransactionCategory {
  if (kind === 'income') return 'income'
  const upper = merchant.toUpperCase()
  for (const rule of RULES) {
    if (rule.pattern.test(upper)) return rule.category
  }
  return 'entertainment'
}
