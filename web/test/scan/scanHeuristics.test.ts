// Direct 1:1 transliteration of the literal-string/date `ScanHeuristics` unit
// tests from iOS/Ortho-iOSTests/ScanParserTests.swift (spec 021 T035) — the
// subset that calls ScanHeuristics.* functions directly with no image/PDF
// fixture and no ScanParser/ScanInference dependency (those are ported
// separately in scanParser.test.ts / scanInference.test.ts, since scanParser.ts
// / scanInference.ts do not exist yet at this step).
import { describe, it, expect } from 'vitest'
import {
  resolveDay,
  statementRow,
  fullDate,
  stackedRows,
  bareDate,
  grandTotal,
} from '../../lib/scan/scanHeuristics'

describe('resolveDay', () => {
  // The CLI year-inference convention (engine/dates.ts): a December row in a
  // Dec→Jan statement period resolves to the PERIOD's earlier year.
  it('infers the year across a Dec→Jan statement period boundary', () => {
    const period = {
      start: { year: 2025, month: 12, day: 15 },
      end: { year: 2026, month: 1, day: 14 },
    }
    const december = resolveDay(12, 20, period, { year: 2026, month: 7, day: 3 })
    expect(december).toEqual({ year: 2025, month: 12, day: 20 })

    const january = resolveDay(1, 5, period, { year: 2026, month: 7, day: 3 })
    expect(january).toEqual({ year: 2026, month: 1, day: 5 })

    // No period: anchor on the injected reference day, never the future.
    const noPeriod = resolveDay(12, 20, null, { year: 2026, month: 7, day: 3 })
    expect(noPeriod).toEqual({ year: 2025, month: 12, day: 20 })
  })
})

describe('statementRow', () => {
  // "CR" suffix is the minus-less credit notation (Amex/Chase): the row must
  // come out negative → income prefill.
  it('treats a trailing CR suffix as the minus-less credit notation', () => {
    const row = statementRow('06/22  REFUND AMAZON MKTP  $25.00 CR')
    expect(row).not.toBeNull()
    expect(row?.amount.negative).toBe(true)
    expect(row?.amount.minorUnits).toBe(2500)

    // And the plain debit row still parses unchanged.
    const debit = statementRow('06/03  STARBUCKS  $6.45')
    expect(debit?.amount.negative).toBe(false)
  })

  // Month-name rows ("Jul 1  UBER  $24.51") are statement rows too — the
  // shape web banking UIs print. An optional year is swallowed; header lines
  // never match.
  it('parses month-name statement rows', () => {
    const row = statementRow('Jul 1  UBER TRIP HELP.UBER.COM  $24.51')
    expect(row?.month).toBe(7)
    expect(row?.day).toBe(1)
    expect(row?.description).toBe('UBER TRIP HELP.UBER.COM')
    expect(row?.amount.minorUnits).toBe(2451)

    const withYear = statementRow('Jun 30, 2026  STARBUCKS  $6.45')
    expect(withYear?.month).toBe(6)
    expect(withYear?.day).toBe(30)
    expect(withYear?.description).toBe('STARBUCKS')

    const credit = statementRow('Jun 25  ONLINE PAYMENT - THANK YOU  $500.00 CR')
    expect(credit?.amount.negative).toBe(true)

    expect(statementRow('Date   Description   Amount')).toBeNull()
    expect(statementRow('MAY SPECIAL OFFER DETAILS')).toBeNull()
  })

  // Structured OCR may join an app-list cell into one string with the
  // description first — that is a statement row too.
  it('parses an inline description-first statement row', () => {
    const row = statementRow('UBER TRIP HELP.UBER.COM  Jul 1  $24.51')
    expect(row?.month).toBe(7)
    expect(row?.day).toBe(1)
    expect(row?.description).toBe('UBER TRIP HELP.UBER.COM')
    expect(row?.amount.minorUnits).toBe(2451)
  })
})

describe('fullDate', () => {
  // Month-name full dates parse in both orders; the existing numeric forms
  // keep priority.
  it('parses month-name full dates in both orders', () => {
    expect(fullDate('Paid on Jul 1, 2026')).toEqual({ year: 2026, month: 7, day: 1 })
    expect(fullDate('1 July 2026')).toEqual({ year: 2026, month: 7, day: 1 })
    expect(fullDate('DECEMBER 31 2025')).toEqual({ year: 2025, month: 12, day: 31 })
    expect(fullDate('Jul 1')).toBeNull() // no year — never fabricate one here
  })
})

describe('stackedRows', () => {
  // Stacked app-list cells (post-T041): merchant+amount share a line, the
  // bare date sits on its own line — in either vertical order — and a
  // "Total balance" header must lose every date-claim to the real rows.
  it('reconstructs rows from stacked app-list cells, dates below or above', () => {
    // Date BELOW each cell (Amex/Chase app shape) + balance trap.
    const below = [
      'Activity',
      'Total balance  $612.45',
      'UBER TRIP HELP.UBER.COM  $24.51',
      'Jul 1',
      'STARBUCKS COFFEE #1234  $6.45',
      'Jun 30',
      'NETFLIX.COM  $22.99',
      'Jun 27',
    ]
    const rowsBelow = stackedRows(below)
    expect(rowsBelow).toHaveLength(3)
    expect(rowsBelow[0].description).toBe('UBER TRIP HELP.UBER.COM')
    expect(rowsBelow[0].month).toBe(7)
    expect(rowsBelow[0].day).toBe(1)
    expect(rowsBelow[0].amount.minorUnits).toBe(2451)
    expect(rowsBelow[1].amount.minorUnits).toBe(645)
    expect(rowsBelow.some((r) => r.amount.minorUnits === 61245)).toBe(false)

    // Fully stacked cells, date ABOVE (merchant / amount on separate lines).
    const above = [
      'Tue, Jul 1',
      'UBER TRIP',
      '$24.51',
      'Jun 30',
      'STARBUCKS',
      '$6.45',
      'Jun 28',
      'H MART',
      '$63.20',
    ]
    const rowsAbove = stackedRows(above)
    expect(rowsAbove).toHaveLength(3)
    expect(rowsAbove[0].description).toBe('UBER TRIP')
    expect(rowsAbove[0].month).toBe(7)
    expect(rowsAbove[2].description).toBe('H MART')
    expect(rowsAbove[2].amount.minorUnits).toBe(6320)
  })

  // GROUPED headers (the Amex-app shape from the T044 device pass): "Jul 3"
  // covers every cell until "Jul 2"; "Pending" status words are stripped;
  // the owner-name subtitle must lose to the merchant; the status bar and
  // page title are unreachable across the header bound.
  it('resolves grouped date headers', () => {
    const lines = [
      '10:24  5G  87',
      'ORTHO BANK GOLD CARD',
      'Jul 3',
      'ALPACADB  $99.00',
      'Pending',
      'UBER EATS  $25.14',
      'Pending',
      'AMAZON MARKETPLACE NA PA',
      'SAM PARKER',
      '$176.14',
      'Jul 2',
      'UBER EATS  $32.37',
      'Pending',
      'NYCT PAYGO  $3.00',
      'NYCT PAYGO  $3.00',
    ]
    const rows = stackedRows(lines)
    expect(rows).toHaveLength(6)
    expect(rows[0].description).toBe('ALPACADB')
    expect(rows[0].month).toBe(7)
    expect(rows[0].day).toBe(3)
    expect(rows[0].amount.minorUnits).toBe(9900)
    expect(rows[2].description).toBe('AMAZON MARKETPLACE NA PA')
    expect(rows[2].amount.minorUnits).toBe(17614)
    expect(rows[3].day).toBe(2) // cells after the second header take its date
    expect(rows[5].description).toBe('NYCT PAYGO')
    expect(rows.some((r) => r.description.includes('5G') || r.description.includes('CARD'))).toBe(false)
  })

  // "$99.00  Pending" style lines: the status word is stripped so the amount
  // still anchors a row.
  it('strips trailing status words so the amount still anchors a row', () => {
    const lines = [
      'Jul 3',
      'COFFEE SHOP',
      '$4.50  Pending',
      'Jul 2',
      'BAGEL PLACE',
      '$3.25  Posted',
      'TACO TRUCK',
      '$12.00  Pending',
    ]
    const rows = stackedRows(lines)
    expect(rows).toHaveLength(3)
    expect(rows[0].description).toBe('COFFEE SHOP')
    expect(rows[0].amount.minorUnits).toBe(450)
    expect(rows[2].description).toBe('TACO TRUCK')
    expect(rows[2].day).toBe(2)
  })

  // A receipt's price column can never become stacked rows: item lines carry
  // trailing amounts but there are no per-row bare-date lines.
  it('never produces rows from a receipt price column', () => {
    const receipt = [
      'BODEGA MARKET',
      '07/02/2026 11:18 AM',
      'COLD BREW  4.50',
      'BEC SANDWICH  6.75',
      'SELTZER  2.25',
      '$13.50',
    ]
    expect(stackedRows(receipt)).toEqual([])
  })
})

describe('bareDate', () => {
  // Bare-date lines: nothing but a posting date (optionally weekday-
  // prefixed); dates embedded in prose never qualify.
  it('recognizes a line that is nothing but a posting date', () => {
    expect(bareDate('Jul 1')?.month).toBe(7)
    expect(bareDate('Jul 1, 2026')?.day).toBe(1)
    expect(bareDate('Tue, Jul 1')?.month).toBe(7)
    expect(bareDate('07/01')?.month).toBe(7)
    expect(bareDate('07/01/2026')?.day).toBe(1)
    expect(bareDate('07/02/2026 11:18 AM')).toBeNull()
    expect(bareDate('DUE BY Jul 1')).toBeNull()
    expect(bareDate('Pending')).toBeNull()
  })
})

describe('grandTotal', () => {
  // TOTAL-labeled lines whose trailing number is not money-shaped ("TOTAL
  // ITEMS SOLD 12", "AMOUNT DUE BY 07/15/2026") must never override the real
  // labeled total.
  it('requires a money-shaped amount, never a bare labeled number', () => {
    const lines = ['CORNER PLACE', 'TOTAL  $14.25', 'TOTAL ITEMS SOLD 12', 'AMOUNT DUE BY 07/15/2026']
    const total = grandTotal(lines)
    expect(total?.minorUnits).toBe(1425)
    expect(grandTotal(['TOTAL ITEMS SOLD 12'])).toBeNull()
  })
})
