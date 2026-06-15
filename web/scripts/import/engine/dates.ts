// Date resolution. Statements print MM/DD; the year comes from the statement
// period. Output is a deterministic noon-UTC ISO string (TZ-independent, and —
// for ET users — the same calendar day under the apps' local day-grouping).
import type { StatementPeriod } from './types'

const MONTHS: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
}

/** Parse "Statement Period: Apr 26 2026-May 25 2026" into UTC start/end dates. */
export function parseStatementPeriod(text: string): StatementPeriod {
  const m = text.match(
    /Statement Period:\s*([A-Za-z]{3})\s+(\d{1,2})\s+(\d{4})\s*-\s*([A-Za-z]{3})\s+(\d{1,2})\s+(\d{4})/
  )
  if (!m) throw new Error('NO_STATEMENT_PERIOD')
  const start = new Date(Date.UTC(Number(m[3]), MONTHS[m[1]], Number(m[2])))
  const end = new Date(Date.UTC(Number(m[6]), MONTHS[m[4]], Number(m[5])))
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new Error(`BAD_STATEMENT_PERIOD: ${m[0]}`)
  }
  return { start, end }
}

const pad = (n: number) => String(n).padStart(2, '0')

/**
 * Resolve a "MM/DD" posting date to a noon-UTC ISO string, choosing the year so
 * the date sits inside the statement period (handles a Dec→Jan period crossing).
 */
export function resolveStatementDate(mmdd: string, period: StatementPeriod): string {
  const m = mmdd.match(/^(\d{2})\/(\d{2})$/)
  if (!m) throw new Error(`BAD_POSTING_DATE: ${JSON.stringify(mmdd)}`)
  const month = Number(m[1])
  const day = Number(m[2])
  const startYear = period.start.getUTCFullYear()
  const endYear = period.end.getUTCFullYear()

  let year = startYear
  if (startYear !== endYear) {
    // Period crosses a year boundary: months >= the start month belong to the
    // start year, earlier months to the end year.
    year = month >= period.start.getUTCMonth() + 1 ? startYear : endYear
  }
  return `${year}-${pad(month)}-${pad(day)}T12:00:00.000Z`
}
