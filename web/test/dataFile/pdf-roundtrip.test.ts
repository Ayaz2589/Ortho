import { describe, expect, it } from 'vitest'
import { buildPdf } from '../../lib/dataFile/pdf/generate'
import { readEnvelope } from '../../lib/dataFile/readPdf'
import { ATTACHMENT_NAME, type ExportEnvelope } from '../../lib/dataFile/envelope'

function envelope(over: Partial<ExportEnvelope> = {}): ExportEnvelope {
  return {
    formatVersion: 1,
    generatedAt: '2026-07-27T00:00:00.000Z',
    app: { name: 'ortho', version: '1' },
    household: { id: 'hh1', name: 'Our Home' },
    display: { language: 'English', currency: 'usd' },
    sections: [
      { key: 'transactions', sectionVersion: 1, records: [{ id: 't1', amount_cents: 1234, merchant: 'Netflix' }] },
      { key: 'housing', sectionVersion: 1, records: [] },
    ],
    ...over,
  }
}

const doc = {
  title: 'Your Ortho data',
  subtitle: 'Our Home · 2026-07-27 · USD',
  sections: [
    { title: 'Transactions', columns: ['Date', 'Merchant', 'Amount'], rows: [['2026-05-01', 'Netflix', 'USD 12.34']], emptyLabel: 'No transactions yet' },
    { title: 'Housing', columns: ['Property'], rows: [], emptyLabel: 'No housing yet' },
  ],
}

describe('pdf payload round-trip (headless)', () => {
  it('embeds the envelope and reads it back byte-identical via unpdf', async () => {
    const env = envelope()
    const bytes = await buildPdf({ envelope: env, doc, font: { kind: 'standard' } })
    expect(bytes.length).toBeGreaterThan(0)

    const read = await readEnvelope(bytes)
    expect(read.ok).toBe(true)
    if (read.ok) expect(read.envelope).toEqual(env)
  })

  it('produces a valid PDF for an empty household', async () => {
    const env = envelope({ sections: [{ key: 'transactions', sectionVersion: 1, records: [] }, { key: 'housing', sectionVersion: 1, records: [] }] })
    const emptyDoc = { ...doc, sections: doc.sections.map((s) => ({ ...s, rows: [] })) }
    const bytes = await buildPdf({ envelope: env, doc: emptyDoc, font: { kind: 'standard' } })
    const read = await readEnvelope(bytes)
    expect(read.ok).toBe(true)
    if (read.ok) expect(read.envelope.sections.every((s) => s.records.length === 0)).toBe(true)
  })

  it('does not crash on cells with control/undefined-WinAnsi characters', async () => {
    // A merchant name carrying a C1 control char (<=0xFF but undefined in
    // WinAnsi) must not abort generation via a double-throw in the fallback.
    const env = envelope()
    const nastyDoc = {
      ...doc,
      sections: [
        { title: 'Transactions', columns: ['Merchant'], rows: [['Caf \u{1F600}']], emptyLabel: 'x' },
      ],
    }
    const bytes = await buildPdf({ envelope: env, doc: nastyDoc, font: { kind: 'standard' } })
    const read = await readEnvelope(bytes)
    expect(read.ok).toBe(true)
  })

  it('rejects a random PDF (no ortho attachment) as not-ortho-file', async () => {
    const { PDFDocument } = await import('pdf-lib')
    const pdf = await PDFDocument.create()
    pdf.addPage([200, 200])
    const bytes = await pdf.save()
    const read = await readEnvelope(bytes)
    expect(read).toEqual({ ok: false, reason: 'not-ortho-file' })
  })

  it('the attachment is named ortho-export.json', async () => {
    // sanity on the constant used by both writer and reader
    expect(ATTACHMENT_NAME).toBe('ortho-export.json')
  })
})
