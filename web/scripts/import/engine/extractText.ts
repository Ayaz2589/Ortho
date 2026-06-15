// Deterministic PDF → text extraction (the only IO in the parse path).
// Uses `unpdf`, a Node/serverless-friendly pdfjs build (no canvas/DOM deps).
import { readFile } from 'node:fs/promises'

/**
 * Extract the text layer of a PDF, one string per page. Throws if the document
 * has no extractable text (e.g. a scanned/image PDF).
 */
export async function extractText(pdfPath: string): Promise<string[]> {
  // Dynamic import keeps the PDF lib out of the module graph for pure-logic tests.
  const { getDocumentProxy, extractText: unpdfExtract } = await import('unpdf')
  const data = new Uint8Array(await readFile(pdfPath))
  const pdf = await getDocumentProxy(data)
  const { text } = await unpdfExtract(pdf, { mergePages: false })
  const pages = (Array.isArray(text) ? text : [text]).map((p) => p ?? '')

  if (pages.join('').length === 0) {
    throw new Error('UNPARSEABLE_PDF: no extractable text (scanned/image-only?)')
  }
  return pages
}
