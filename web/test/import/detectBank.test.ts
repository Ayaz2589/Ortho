import { describe, it, expect } from 'vitest'
import { detectBank } from '../../scripts/import/engine/detectBank'

const TD_TEXT =
  'Bank Deposits FDIC Insured | TD Bank, N.A. | Equal Housing Lender\n' +
  'TD Premier Checking\nconnect to www.tdbank.com'

describe('detectBank', () => {
  it('detects TD from statement markers', () => {
    const r = detectBank(TD_TEXT)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.profile.id).toBe('td')
  })

  it('reports unknown when nothing matches (never guesses)', () => {
    const r = detectBank('Some Other Bank monthly statement')
    expect(r).toMatchObject({ ok: false, code: 'unknown' })
  })

  it('honors a valid override even without markers', () => {
    const r = detectBank('no markers at all', 'td')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.profile.id).toBe('td')
  })

  it('rejects an unknown override id', () => {
    const r = detectBank(TD_TEXT, 'nope')
    expect(r).toMatchObject({ ok: false, code: 'bad-override' })
  })

  it('detects Chase from its CSV header (registry dispatch)', () => {
    const r = detectBank('Transaction Date,Post Date,Description,Category,Type,Amount,Memo\n06/01/2026,06/02/2026,X,Shopping,Sale,-1.00,')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.profile.id).toBe('chase')
  })

  it('detects Apple Card from the Goldman Sachs footer (registry dispatch)', () => {
    const r = detectBank('… Apple Card is issued by Goldman Sachs Bank USA, Salt Lake City Branch. …')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.profile.id).toBe('apple')
  })

  it('reports ambiguity when more than one profile matches', () => {
    const fake = (id: string) => ({ id, label: id, source: id, detect: () => true, parse: () => ({}) as never })
    const r = detectBank('anything', null, [fake('a'), fake('b')])
    expect(r).toMatchObject({ ok: false, code: 'ambiguous' })
  })
})
