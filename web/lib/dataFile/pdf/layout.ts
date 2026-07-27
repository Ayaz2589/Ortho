// spec 032 — low-level pdf-lib drawing for the visible layer. A calm, paginated
// money document: doc title, a provenance subtitle, then each section as a
// heading + a simple table. Graphite text, hairline column rule, never red.
//
// Every text draw is guarded: if the embedded/standard font cannot encode a
// character (an exotic merchant name, a currency symbol outside the font), we
// redraw a WinAnsi-safe fallback rather than throwing — the canonical payload
// is the source of truth, so a best-effort visible cell is acceptable.

import { rgb, type PDFFont, type PDFPage, type PDFDocument } from 'pdf-lib'
import type { SectionRenderModel } from '../registry'

export interface DocModel {
  title: string
  subtitle: string
  sections: SectionRenderModel[]
}

const PAGE_W = 612
const PAGE_H = 792
const MARGIN = 40
const ROW_H = 15
const GRAPHITE = rgb(0.15, 0.15, 0.15)
const GRAY = rgb(0.45, 0.45, 0.45)
const HAIRLINE = rgb(0.85, 0.85, 0.85)

/** Replace any non-WinAnsi-safe code point so a standard font can always draw it. */
function winAnsiSafe(s: string): string {
  let out = ''
  for (const ch of s) {
    const code = ch.codePointAt(0) ?? 0
    out += code <= 0xff ? ch : '?'
  }
  return out
}

function safeDraw(page: PDFPage, font: PDFFont, s: string, x: number, y: number, size: number, color = GRAPHITE) {
  const text = s.replace(/−/g, '-')
  try {
    page.drawText(text, { x, y, size, font, color })
  } catch {
    page.drawText(winAnsiSafe(text), { x, y, size, font, color })
  }
}

/** Truncate a cell to a rough width budget (chars), keeping the table tidy. */
function clip(s: string, maxChars: number): string {
  return s.length > maxChars ? `${s.slice(0, maxChars - 1)}…` : s
}

export function drawDocument(doc: PDFDocument, font: PDFFont, model: DocModel): void {
  let page = doc.addPage([PAGE_W, PAGE_H])
  let y = PAGE_H - MARGIN

  const newPage = () => {
    page = doc.addPage([PAGE_W, PAGE_H])
    y = PAGE_H - MARGIN
  }
  const ensure = (need: number) => {
    if (y - need < MARGIN) newPage()
  }

  safeDraw(page, font, model.title, MARGIN, y, 18)
  y -= 22
  safeDraw(page, font, model.subtitle, MARGIN, y, 9, GRAY)
  y -= 24

  const usableW = PAGE_W - 2 * MARGIN

  for (const sec of model.sections) {
    ensure(46)
    safeDraw(page, font, sec.title, MARGIN, y, 14)
    y -= 18

    const cols = sec.columns.length || 1
    const colW = usableW / cols
    const colX = sec.columns.map((_, i) => MARGIN + i * colW)
    const maxCharsPerCol = Math.max(6, Math.floor(colW / 5))

    // header
    sec.columns.forEach((c, i) => safeDraw(page, font, clip(c, maxCharsPerCol), colX[i], y, 9, GRAY))
    y -= 4
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: PAGE_W - MARGIN, y },
      thickness: 0.5,
      color: HAIRLINE,
    })
    y -= ROW_H

    if (sec.rows.length === 0) {
      safeDraw(page, font, sec.emptyLabel, MARGIN, y, 9, GRAY)
      y -= ROW_H
    } else {
      for (const row of sec.rows) {
        ensure(ROW_H)
        row.forEach((cell, i) => safeDraw(page, font, clip(cell, maxCharsPerCol), colX[i], y, 9))
        y -= ROW_H
      }
    }
    y -= 12
  }
}
