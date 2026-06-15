import { describe, it, expect } from 'vitest'
import { dedupeKey, markDuplicates } from '../../scripts/import/engine/dedupe'
import type { ParsedTransaction } from '../../scripts/import/engine/types'

const row = (over: Partial<ParsedTransaction>): ParsedTransaction => ({
  dateISO: '2026-05-04T12:00:00.000Z',
  rawDescription: '',
  merchant: 'Verizon',
  amountCents: 8999,
  kind: 'expense',
  section: 'x',
  category: 'utilities',
  excluded: false,
  excludeReason: null,
  duplicate: false,
  ownerIds: [],
  splits: null,
  ...over,
})

describe('dedupeKey', () => {
  it('keys by creator | day | amount | source — NOT description', () => {
    expect(dedupeKey('u1', '2026-05-04T12:00:00.000Z', 8999, 'TD Bank')).toBe('u1|2026-05-04|8999|td bank')
  })
  it('ignores time-of-day and merchant differences', () => {
    expect(dedupeKey('u1', '2026-05-04T23:00:00.000Z', 8999, 'TD Bank')).toBe(
      dedupeKey('u1', '2026-05-04T06:00:00.000Z', 8999, 'TD Bank')
    )
  })
  it('treats different banks as distinct', () => {
    expect(dedupeKey('u1', '2026-05-04T12:00:00.000Z', 300, 'TD Bank')).not.toBe(
      dedupeKey('u1', '2026-05-04T12:00:00.000Z', 300, 'Amex Gold')
    )
  })
})

describe('markDuplicates', () => {
  it('flags + excludes a row already imported from the same bank that day', () => {
    const rows = [row({}), row({ merchant: 'Con Edison', amountCents: 12989 })]
    const existing = [{ created_by: 'u1', date: '2026-05-04T16:00:00.000Z', amount_cents: 8999, source: 'TD Bank' }]
    const flagged = markDuplicates(rows, existing, 'u1', 'TD Bank')
    expect(flagged).toBe(1)
    expect(rows[0]).toMatchObject({ duplicate: true, excluded: true, excludeReason: 'duplicate' })
    expect(rows[1].duplicate).toBe(false)
  })

  it('matches on amount+day+bank only, ignoring a changed description', () => {
    const rows = [row({ merchant: 'TOTALLY DIFFERENT NAME' })]
    const existing = [{ created_by: 'u1', date: '2026-05-04T00:00:00.000Z', amount_cents: 8999, source: 'TD Bank' }]
    expect(markDuplicates(rows, existing, 'u1', 'TD Bank')).toBe(1)
  })

  it('does not flag the same amount/day from a different bank', () => {
    const rows = [row({})]
    const existing = [{ created_by: 'u1', date: '2026-05-04T12:00:00.000Z', amount_cents: 8999, source: 'Amex Gold' }]
    expect(markDuplicates(rows, existing, 'u1', 'TD Bank')).toBe(0)
    expect(rows[0].duplicate).toBe(false)
  })

  it('keeps two identical charges in one batch (no within-batch dedupe)', () => {
    const rows = [row({ amountCents: 300 }), row({ amountCents: 300 })]
    expect(markDuplicates(rows, [], 'u1', 'TD Bank')).toBe(0)
    expect(rows.every((r) => !r.excluded)).toBe(true)
  })

  it('leaves an already-excluded (non-spending) row alone', () => {
    const rows = [row({ excluded: true, excludeReason: 'cc-payment' })]
    const existing = [{ created_by: 'u1', date: '2026-05-04T12:00:00.000Z', amount_cents: 8999, source: 'TD Bank' }]
    expect(markDuplicates(rows, existing, 'u1', 'TD Bank')).toBe(0)
    expect(rows[0].excludeReason).toBe('cc-payment')
    expect(rows[0].duplicate).toBe(false)
  })
})
