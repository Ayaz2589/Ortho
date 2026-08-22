// spec 032 — verify the provisioned non-Latin fonts actually embed + subset and
// draw their script through the real generate path, without throwing.
//
// This is the headless stand-in for on-device glyph QA a Linux sandbox can't do:
// it proves each shipped TTF is a subsettable glyf font whose cmap covers its
// script (a missing/CFF/complex-shaping-broken font throws here), and that the
// export still embeds the machine-readable payload. It does NOT prove pixels
// look right — that remains a manual on-device check.

import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildPdf } from '../../lib/dataFile/pdf/generate'
import { readEnvelope } from '../../lib/dataFile/readPdf'
import type { ExportEnvelope } from '../../lib/dataFile/envelope'

const FONTS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'public', 'fonts')

// language script sample + the file loadFontForLanguage expects
const CASES = [
  { file: 'NotoSansBengali-Regular.ttf', sample: 'বাংলা ৳500 Ortho $1,234.50' }, // complex Indic + taka
  { file: 'NotoSansJP-Regular.ttf', sample: '東京 あア Ortho $1,234.50' },
  { file: 'NotoSansKR-Regular.ttf', sample: '한국 가나다 Ortho $1,234.50' },
  { file: 'NotoSansSC-Regular.ttf', sample: '中文 你好 Ortho $1,234.50' },
]

function envelope(): ExportEnvelope {
  return {
    formatVersion: 1,
    generatedAt: '2026-07-27T00:00:00.000Z',
    app: { name: 'ortho', version: '1' },
    household: { id: 'hh1', name: 'Home' },
    display: { language: 'English', currency: 'usd' },
    sections: [{ key: 'transactions', sectionVersion: 1, records: [] }],
  }
}

describe('provisioned non-Latin fonts embed + subset + draw', () => {
  for (const { file, sample } of CASES) {
    it(`${file} embeds, subsets, and draws its script without throwing`, async () => {
      const path = join(FONTS_DIR, file)
      expect(existsSync(path), `${file} must be provisioned in public/fonts`).toBe(true)
      const bytes = new Uint8Array(readFileSync(path))
      const doc = {
        title: 'Ortho',
        subtitle: 'Home',
        sections: [{ title: sample, columns: [sample], rows: [[sample]], emptyLabel: sample }],
      }
      const out = await buildPdf({ envelope: envelope(), doc, font: { kind: 'custom', bytes } })
      expect(out.length).toBeGreaterThan(0)
      // the machine-readable payload still round-trips alongside the embedded font
      const read = await readEnvelope(out)
      expect(read.ok).toBe(true)
    })
  }
})
