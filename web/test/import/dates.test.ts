import { describe, it, expect } from 'vitest'
import { parseStatementPeriod, resolveStatementDate } from '../../scripts/import/engine/dates'

describe('parseStatementPeriod', () => {
  it('parses the TD period header', () => {
    const p = parseStatementPeriod('Statement Period: Apr 26 2026-May 25 2026')
    expect(p.start.toISOString()).toBe('2026-04-26T00:00:00.000Z')
    expect(p.end.toISOString()).toBe('2026-05-25T00:00:00.000Z')
  })

  it('throws when the period is missing', () => {
    expect(() => parseStatementPeriod('no period here')).toThrow()
  })
  it('throws on an unrecognized month abbreviation', () => {
    expect(() => parseStatementPeriod('Statement Period: Xyz 26 2026-May 25 2026')).toThrow(/BAD_STATEMENT_PERIOD/)
  })
})

describe('resolveStatementDate', () => {
  const period = parseStatementPeriod('Statement Period: Apr 26 2026-May 25 2026')

  it('resolves MM/DD to noon UTC within a single-year period', () => {
    expect(resolveStatementDate('05/04', period)).toBe('2026-05-04T12:00:00.000Z')
    expect(resolveStatementDate('04/27', period)).toBe('2026-04-27T12:00:00.000Z')
  })

  it('infers the correct year across a Dec→Jan boundary', () => {
    const cross = parseStatementPeriod('Statement Period: Dec 26 2025-Jan 25 2026')
    expect(resolveStatementDate('12/31', cross)).toBe('2025-12-31T12:00:00.000Z')
    expect(resolveStatementDate('01/05', cross)).toBe('2026-01-05T12:00:00.000Z')
  })

  it('is timezone-independent (always noon UTC)', () => {
    expect(resolveStatementDate('05/04', period).endsWith('T12:00:00.000Z')).toBe(true)
  })

  it('throws on a malformed posting date', () => {
    expect(() => resolveStatementDate('5/4', period)).toThrow()
  })
})
