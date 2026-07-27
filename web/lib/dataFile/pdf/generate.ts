// spec 032 — build the export PDF: draw the visible pages with the chosen
// language's font, then embed the machine-readable envelope as a file
// attachment (`ortho-export.json`). The attachment is the authoritative source
// for re-import; the visible pages are presentation only.

import { PDFDocument, StandardFonts, type PDFFont } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { ATTACHMENT_MIME, ATTACHMENT_NAME, type ExportEnvelope } from '../envelope'
import type { DocModel } from './layout'
import { drawDocument } from './layout'
import type { FontChoice } from './fonts'

export interface BuildPdfInput {
  envelope: ExportEnvelope
  doc: DocModel
  font: FontChoice
}

/**
 * Build the PDF bytes. Pure w.r.t. inputs (no store/network access) so it is
 * unit-testable headlessly — pass a `{ kind: 'standard' }` font and any
 * envelope. `generatedAt` is already baked into the envelope by the caller.
 */
export async function buildPdf({ envelope, doc, font }: BuildPdfInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  pdf.setTitle('Ortho data export')
  pdf.setCreator('Ortho')
  pdf.setProducer('Ortho')

  let pdfFont: PDFFont
  if (font.kind === 'custom') {
    // @pdf-lib/fontkit's complex-script shaper (Bengali and other Indic scripts:
    // conjunct/reordering via GSUB) runs through regenerator-transpiled code that
    // needs a global `regeneratorRuntime`. Load the polyfill lazily — only on the
    // non-Latin embedded-font path, so the common bundle is unaffected.
    await import('regenerator-runtime/runtime.js')
    pdf.registerFontkit(fontkit)
    pdfFont = await pdf.embedFont(font.bytes, { subset: true })
  } else {
    pdfFont = await pdf.embedFont(StandardFonts.Helvetica)
  }

  drawDocument(pdf, pdfFont, doc)

  const payload = new TextEncoder().encode(JSON.stringify(envelope))
  await pdf.attach(payload, ATTACHMENT_NAME, {
    mimeType: ATTACHMENT_MIME,
    description: 'Ortho machine-readable export payload',
  })

  return pdf.save()
}
