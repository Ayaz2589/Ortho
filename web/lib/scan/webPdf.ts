// Browser PDF → ScanDocumentText for the web scan fallback (fix/web-scan-fallback).
//
// The native path gets its text/tables from the Swift Scan plugin's
// extractPDF() (PDFKit + Vision). On the web/Vercel build that plugin is
// unimplemented, so we extract the PDF's text layer here with `unpdf` — the
// same Node/serverless-friendly pdfjs build the import CLI already uses
// (scripts/import/engine/extractText.ts) — and shape it into the identical
// ScanDocumentText the plugin returns. Everything downstream (scanParser →
// ParsedCandidate[] → TxForm.loadFromScanCandidate) is then platform-agnostic.
//
// unpdf gives one text string per page; we split it into lines exactly the way
// the import profiles do (`page.split('\n').map(trim)`, see
// scripts/import/profiles/*.ts). Frames are unavailable from a pure text layer,
// so every line carries a zeroed frame — harmless: the statement/receipt
// heuristics key off line TEXT, and this mirrors the CLI's frame-less PDF path.

import type { ScanDocumentText, ScanDocumentTextPage } from './scanModels'
import { isEmptyScanDocument } from './scanModels'

const ZERO_FRAME = { x: 0, y: 0, width: 0, height: 0 } as const

/** Thrown when the PDF has no extractable text layer (a scanned/image-only
 *  PDF). Mirrors extractText.ts's `UNPARSEABLE_PDF` sentinel so the caller can
 *  surface an honest "couldn't read this" instead of a silent dead-end. */
export class UnreadablePdfError extends Error {
  constructor() {
    super('UNPARSEABLE_PDF: no extractable text (scanned/image-only?)')
    this.name = 'UnreadablePdfError'
  }
}

export async function extractPdfToDocument(file: Blob): Promise<ScanDocumentText> {
  // Dynamic import keeps pdfjs out of the initial bundle — the scan pipeline is
  // deferred (spec 022, US2), and this runs only inside a user-initiated import.
  const { getDocumentProxy, extractText } = await import('unpdf')
  const data = new Uint8Array(await file.arrayBuffer())
  const pdf = await getDocumentProxy(data)
  const { text } = await extractText(pdf, { mergePages: false })
  const pageTexts = (Array.isArray(text) ? text : [text]).map((p) => p ?? '')

  const pages: ScanDocumentTextPage[] = pageTexts.map((pageText) => ({
    lines: pageText
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => ({ text: line, frame: ZERO_FRAME })),
    tables: [],
  }))

  const document: ScanDocumentText = { pages }
  // A scanned/image-only PDF extracts to nothing — fail loudly here rather than
  // letting the parser's empty-document tier return a calm {kind:'none'} that
  // reads identically to a genuinely unreadable capture.
  if (isEmptyScanDocument(document)) throw new UnreadablePdfError()
  return document
}
