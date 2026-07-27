# PDF export fonts (spec 032)

The data-export PDF (`lib/dataFile/pdf/`) draws its visible pages with a font
chosen per export language:

- **Latin scripts** (English, Español, and "System") use pdf-lib's built-in
  **Helvetica** — no font file is needed and it works headlessly in tests.
- **Non-Latin scripts** need an embedded font that covers their glyphs. Those
  are lazy-fetched from **this directory** at export time, one per language, and
  embedded (subset) into the PDF. They are intentionally NOT bundled into the JS
  build — they load on demand only when that language is chosen.

## Provisioned files (per `lib/dataFile/pdf/fonts.ts`)

| Language | File | Notes |
|----------|------|-------|
| বাংলা (Bengali) | `NotoSansBengali-Regular.ttf` | ~140 KB |
| 日本語 (Japanese) | `NotoSansJP-Regular.ttf` | ~5.8 MB |
| 简体中文 (Simplified Chinese) | `NotoSansSC-Regular.ttf` | ~10.6 MB |
| 한국어 (Korean) | `NotoSansKR-Regular.ttf` | ~6.2 MB |

These are **static Regular instances** (`fontTools.varLib.instancer wght=400`) of
Google's variable Noto Sans families — glyf outlines, no `fvar`. Embed + subset +
draw is verified headlessly in `test/dataFile/fonts-embed.test.ts`.

**Bengali (and other complex/Indic scripts):** `@pdf-lib/fontkit`'s shaper needs a
global `regeneratorRuntime`; `pdf/generate.ts` lazy-imports `regenerator-runtime`
on the custom-font path so conjunct/reordering shaping works.

To regenerate from source:
```
python3 -m fontTools.varLib.instancer 'NotoSansJP[wght].ttf' wght=400 \
  --update-name-table -o NotoSansJP-Regular.ttf
# Bengali has two axes: pin both → wght=400 wdth=100
```

## Rules

- **Use TTF / `glyf`-outline Noto, NOT the `.otf`/`.otc` CFF builds.** pdf-lib's
  subsetter produces invalid output for CFF CJK fonts (verified: Hopding/pdf-lib
  issues #494, #664). The `glyf` TTF variants (Google Fonts / `@fontsource/*`
  `.ttf`) subset correctly.
- A missing file is safe: `loadFontForLanguage` falls back to Helvetica (Latin
  glyphs) rather than failing the export. So English/Español export works even
  before these binaries are provisioned.

## Status

Provisioned. Embed + subset + script-draw are verified headlessly
(`test/dataFile/fonts-embed.test.ts`). The one thing a Linux sandbox still can't
check is whether the rendered **pixels** look right (no tofu, correct
conjuncts) — that remains a manual on-device / real-browser QA pass.
