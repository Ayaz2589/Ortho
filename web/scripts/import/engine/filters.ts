// List filters for tx-list. Pure: parse + validate flag values into a TxFilter,
// and translate MONTH into a half-open [start, end) date window.
import type { TransactionCategory, TransactionKind } from '../../../lib/types'

export const CATEGORY_LIST: TransactionCategory[] = [
  'coffee', 'groceries', 'dining', 'subs', 'fuel', 'rent',
  'health', 'income', 'transit', 'utilities', 'entertainment',
]

export interface TxFilter {
  startISO?: string
  endISO?: string
  category?: TransactionCategory
  source?: string
  kind?: TransactionKind
  limit?: number
}

const pad = (n: number) => String(n).padStart(2, '0')

/** "2026-05" → half-open month window `[2026-05-01, 2026-06-01)` (UTC). */
export function monthRange(month: string): { startISO: string; endISO: string } {
  const m = month.match(/^(\d{4})-(\d{2})$/)
  if (!m) throw new Error(`INVALID_MONTH: ${JSON.stringify(month)} (expected YYYY-MM)`)
  const year = Number(m[1])
  const mo = Number(m[2])
  if (mo < 1 || mo > 12) throw new Error(`INVALID_MONTH: ${month}`)
  const endYear = mo === 12 ? year + 1 : year
  const endMo = mo === 12 ? 1 : mo + 1
  return {
    startISO: `${year}-${pad(mo)}-01T00:00:00.000Z`,
    endISO: `${endYear}-${pad(endMo)}-01T00:00:00.000Z`,
  }
}

export interface FilterArgs {
  month?: string
  category?: string
  source?: string
  kind?: string
  limit?: string
}

/** Validate + assemble a TxFilter from raw flag strings. Throws on bad values. */
export function parseFilters(args: FilterArgs): TxFilter {
  const f: TxFilter = {}
  if (args.month) {
    const r = monthRange(args.month)
    f.startISO = r.startISO
    f.endISO = r.endISO
  }
  if (args.category) {
    if (!CATEGORY_LIST.includes(args.category as TransactionCategory)) throw new Error(`INVALID_CATEGORY: ${args.category}`)
    f.category = args.category as TransactionCategory
  }
  if (args.source) f.source = args.source
  if (args.kind) {
    if (args.kind !== 'expense' && args.kind !== 'income') throw new Error(`INVALID_KIND: ${args.kind}`)
    f.kind = args.kind
  }
  if (args.limit) {
    const n = Number(args.limit)
    if (!Number.isInteger(n) || n <= 0) throw new Error(`INVALID_LIMIT: ${args.limit}`)
    f.limit = n
  }
  return f
}
