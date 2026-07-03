// tx-list flag parsing (spec 013 US5): a thin mapping onto the apps' shared
// FilterCriteria. The CLI narrows by DATE WINDOW ONLY in SQL, then runs the
// shared `filterTransactions` in-process — one filtering brain, so the same
// criteria return the same set the apps show (free text, multi-select OR,
// owner filter). The month window reuses the shared `monthBounds`.
import { PICKABLE_CATEGORIES, type TransactionCategory } from '../../../lib/types'
import { emptyCriteria, monthBounds, type FilterCriteria } from '../../../lib/transactionFilters'

/** The shared pickable list (transfer stays unpickable — locked product
 *  decision). Re-exported under the CLI's historical name. */
export const CATEGORY_LIST: readonly TransactionCategory[] = PICKABLE_CATEGORIES

export interface RawListArgs {
  month?: string
  query?: string
  category?: string
  source?: string
  kind?: string
  owner?: string
  limit?: string
}

export interface ParsedList {
  /** SQL fetch bound (broadest criterion only — everything else is in-process). */
  window: { startISO?: string; endISO?: string }
  /** Apps' criteria, owners left empty until names resolve against the household. */
  criteria: FilterCriteria
  /** Raw --owner names; resolve with `resolveOwnerIds` once people are known. */
  ownerNames: string[]
  /** Fetch cap. Truncation must be reported to the operator, never silent. */
  limit: number
}

const splitMulti = (s: string): string[] =>
  s.split(',').map((x) => x.trim()).filter(Boolean)

/** Validate + assemble the list request from raw flag strings. Throws on bad values. */
export function parseListArgs(args: RawListArgs): ParsedList {
  const criteria = emptyCriteria()
  const window: ParsedList['window'] = {}
  if (args.month) {
    const b = monthBounds(args.month) // throws INVALID_MONTH
    window.startISO = b.dateFrom
    window.endISO = b.dateTo
    criteria.dateFrom = b.dateFrom
    criteria.dateTo = b.dateTo
  }
  if (args.query) criteria.query = args.query
  if (args.category) {
    for (const c of splitMulti(args.category)) {
      if (!CATEGORY_LIST.includes(c as TransactionCategory)) {
        throw new Error(`INVALID_CATEGORY: ${c} (one of: ${CATEGORY_LIST.join(', ')})`)
      }
      criteria.categories.push(c as TransactionCategory)
    }
  }
  if (args.source) criteria.sources.push(...splitMulti(args.source))
  if (args.kind) {
    if (args.kind !== 'expense' && args.kind !== 'income' && args.kind !== 'transfer') {
      throw new Error(`INVALID_KIND: ${args.kind} (expense|income|transfer)`)
    }
    criteria.kind = args.kind
  }
  let limit = 200
  if (args.limit) {
    const n = Number(args.limit)
    if (!Number.isInteger(n) || n <= 0) throw new Error(`INVALID_LIMIT: ${args.limit}`)
    limit = n
  }
  return { window, criteria, ownerNames: args.owner ? splitMulti(args.owner) : [], limit }
}

/** `--owner` names → household person ids, case-insensitively. Throws with the
 *  available names so the operator can self-correct. */
export function resolveOwnerIds(
  people: ReadonlyArray<{ id: string; name: string }>,
  names: string[]
): string[] {
  return names.map((name) => {
    const p = people.find((x) => x.name.toLowerCase() === name.toLowerCase())
    if (!p) {
      throw new Error(
        `UNKNOWN_OWNER: ${name} (household people: ${people.map((x) => x.name).join(', ')})`
      )
    }
    return p.id
  })
}
