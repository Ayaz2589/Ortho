// fix/web-scan-fallback — the browser PDF → ScanDocumentText extractor that
// replaces the native Scan.extractPDF() on the web build. Mirrors the import
// CLI's per-page `split('\n').map(trim)` line shaping (scripts/import/profiles/*),
// so the SAME scanParser pipeline runs on both platforms. `unpdf` is mocked so
// these assertions cover the shaping/empty-guard logic, not pdfjs itself.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { getDocumentProxy, extractText } = vi.hoisted(() => ({
  getDocumentProxy: vi.fn(),
  extractText: vi.fn(),
}))
vi.mock('unpdf', () => ({ getDocumentProxy, extractText }))

import { extractPdfToDocument, UnreadablePdfError } from '@/lib/scan/webPdf'

function fakePdf(text: string[] | string) {
  getDocumentProxy.mockResolvedValue({})
  extractText.mockResolvedValue({ text })
}

// jsdom's File lacks arrayBuffer() in some environments — provide a Blob-like
// stub carrying the one method the extractor uses.
function blob(): Blob {
  return { arrayBuffer: async () => new ArrayBuffer(8) } as unknown as Blob
}

beforeEach(() => {
  getDocumentProxy.mockReset()
  extractText.mockReset()
})

describe('extractPdfToDocument', () => {
  it('splits each page into trimmed, non-empty lines with zeroed frames', async () => {
    fakePdf(['STATEMENT PERIOD 06/01/2026 - 06/30/2026\n\n  06/05  UBER TRIP  $18.50  \n06/08  BLUE BOTTLE  $6.25'])
    const doc = await extractPdfToDocument(blob())

    expect(doc.pages).toHaveLength(1)
    expect(doc.pages[0].lines.map((l) => l.text)).toEqual([
      'STATEMENT PERIOD 06/01/2026 - 06/30/2026',
      '06/05  UBER TRIP  $18.50',
      '06/08  BLUE BOTTLE  $6.25',
    ])
    expect(doc.pages[0].tables).toEqual([])
    expect(doc.pages[0].lines[0].frame).toEqual({ x: 0, y: 0, width: 0, height: 0 })
  })

  it('keeps one ScanDocumentTextPage per PDF page (mergePages:false)', async () => {
    fakePdf(['06/05  UBER TRIP  $18.50', '06/08  BLUE BOTTLE  $6.25'])
    const doc = await extractPdfToDocument(blob())
    expect(doc.pages).toHaveLength(2)
    expect(doc.pages[1].lines[0].text).toBe('06/08  BLUE BOTTLE  $6.25')
  })

  it('tolerates a single (non-array) page string', async () => {
    fakePdf('TOTAL  $12.00')
    const doc = await extractPdfToDocument(blob())
    expect(doc.pages).toHaveLength(1)
    expect(doc.pages[0].lines[0].text).toBe('TOTAL  $12.00')
  })

  it('throws UnreadablePdfError for a scanned/image-only PDF (no text layer)', async () => {
    fakePdf(['', '   \n  '])
    await expect(extractPdfToDocument(blob())).rejects.toBeInstanceOf(UnreadablePdfError)
  })
})
