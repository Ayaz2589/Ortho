// Input validators for tx-add / tx-edit — mirror the web TxForm rules. Pure.
import type { TransactionCategory } from '../../../lib/types'
import { parseAmountToCents } from './money'
import { CATEGORY_LIST } from './filters'

/** Dollars string → positive integer cents. Throws on 0, negative, or garbage. */
export function validateAmount(input: string): number {
  const cents = parseAmountToCents(input) // throws on unparseable
  if (cents <= 0) throw new Error(`amount must be greater than 0 (got ${input})`)
  return cents
}

export function validateMerchant(input: string): string {
  const m = input.trim()
  if (!m) throw new Error('merchant must not be empty')
  return m
}

export function validateCategory(input: string): TransactionCategory {
  if (!CATEGORY_LIST.includes(input as TransactionCategory)) {
    throw new Error(`invalid category: ${input} (one of: ${CATEGORY_LIST.join(', ')})`)
  }
  return input as TransactionCategory
}

/** "YYYY-MM-DD" → noon-UTC ISO (timezone-stable day, matching 004). */
export function parseDay(input: string): string {
  const m = input.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) throw new Error(`invalid date: ${input} (expected YYYY-MM-DD)`)
  return `${m[1]}-${m[2]}-${m[3]}T12:00:00.000Z`
}

/** Noon-UTC ISO for *today's* America/New_York calendar day. `now` injected for
 *  deterministic tests. Uses the NY wall-clock day (not the UTC day) so an
 *  evening ET entry — e.g. 21:00 ET = 01:00Z the next day — lands on the correct
 *  date, matching the noon-UTC-of-the-NY-day convention the apps and
 *  repair-legacy-dates.ts enforce. Otherwise the CLI reintroduces the exact
 *  off-by-one that script exists to clean up. */
const NY_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})
export function todayISO(now: Date): string {
  return `${NY_DAY.format(now)}T12:00:00.000Z`
}
