import { describe, it, expect, vi, beforeEach } from 'vitest'
import { writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const { getDocumentProxy, unpdfExtract } = vi.hoisted(() => ({
  getDocumentProxy: vi.fn(),
  unpdfExtract: vi.fn(),
}))
vi.mock('unpdf', () => ({ getDocumentProxy, extractText: unpdfExtract }))

import { extractText } from '../../scripts/import/engine/extractText'

function tmpPdf(): string {
  const p = join(tmpdir(), `ortho-pdf-${process.pid}-${Date.now()}-${Math.floor(performance.now())}`)
  writeFileSync(p, 'dummy bytes')
  return p
}

beforeEach(() => {
  getDocumentProxy.mockReset()
  unpdfExtract.mockReset()
  getDocumentProxy.mockResolvedValue({})
})

describe('extractText', () => {
  it('returns one string per page', async () => {
    unpdfExtract.mockResolvedValue({ text: ['page one', 'page two'] })
    const p = tmpPdf()
    try {
      expect(await extractText(p)).toEqual(['page one', 'page two'])
    } finally {
      rmSync(p)
    }
  })

  it('normalizes a single merged string into a one-element array', async () => {
    unpdfExtract.mockResolvedValue({ text: 'just one' })
    const p = tmpPdf()
    try {
      expect(await extractText(p)).toEqual(['just one'])
    } finally {
      rmSync(p)
    }
  })

  it('throws on a PDF with no extractable text (scanned/image-only)', async () => {
    unpdfExtract.mockResolvedValue({ text: ['', ''] })
    const p = tmpPdf()
    try {
      await expect(extractText(p)).rejects.toThrow(/UNPARSEABLE_PDF/)
    } finally {
      rmSync(p)
    }
  })
})
