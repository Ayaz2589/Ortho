# PDF export fonts (spec 032)

The data-export PDF (`lib/dataFile/pdf/`) draws its visible pages with a font
chosen per export language:

- **Latin scripts** (English, Español, and "System") use pdf-lib's built-in
  **Helvetica** — no font file is needed and it works headlessly in tests.
- **Non-Latin scripts** need an embedded font that covers their glyphs. Those
  are lazy-fetched from **this directory** at export time, one per language, and
  embedded (subset) into the PDF. They are intentionally NOT bundled into the JS
  build — they load on demand only when that language is chosen.

## Expected files (per `lib/dataFile/pdf/fonts.ts`)

| Language | File |
|----------|------|
| বাংলা (Bengali) | `NotoSansBengali-Regular.ttf` |
| 日本語 (Japanese) | `NotoSansJP-Regular.ttf` |
| 简体中文 (Simplified Chinese) | `NotoSansSC-Regular.ttf` |
| 한국어 (Korean) | `NotoSansKR-Regular.ttf` |

## Rules

- **Use TTF / `glyf`-outline Noto, NOT the `.otf`/`.otc` CFF builds.** pdf-lib's
  subsetter produces invalid output for CFF CJK fonts (verified: Hopding/pdf-lib
  issues #494, #664). The `glyf` TTF variants (Google Fonts / `@fontsource/*`
  `.ttf`) subset correctly.
- A missing file is safe: `loadFontForLanguage` falls back to Helvetica (Latin
  glyphs) rather than failing the export. So English/Español export works even
  before these binaries are provisioned.

## Status

These large CJK/Bengali binaries are a tracked follow-up (spec 032 tasks T047),
together with on-device glyph QA — the Linux CI sandbox cannot render or verify
glyphs. Until they land, non-Latin exports render with Latin fallback glyphs; the
embedded machine-readable payload (the source of truth for re-import) is
unaffected either way.
