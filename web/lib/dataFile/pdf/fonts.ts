// spec 032 — per-language font provider for the visible PDF layer.
//
// Latin scripts (English, Español, System) use pdf-lib's built-in Helvetica —
// no font file needed, and it works headlessly in tests. Non-Latin scripts
// (Bengali, Japanese, Simplified Chinese, Korean) need an embedded font that
// covers their glyphs; those are lazy-fetched from /public/fonts as TTF/glyf
// Noto files ONLY when that language is chosen, so the JS bundle is unaffected.
//
// IMPORTANT: use TTF/glyf-outline Noto, never the .otf/.otc CFF builds —
// pdf-lib's subsetter produces invalid output for CFF CJK fonts.
//
// A missing/failed font asset degrades to the Latin standard font rather than
// hard-failing the export (glyphs for that run render in Latin; the machine-
// readable payload is unaffected). The JP/KR/SC/Bengali TTFs are provisioned as
// static glyf Noto instances under /public/fonts (embed+subset verified in
// test/dataFile/fonts-embed.test.ts); pixel-level rendering is still on-device QA.

import type { Language } from '../../language'

export type FontChoice = { kind: 'standard' } | { kind: 'custom'; bytes: Uint8Array }

/** Non-Latin languages → their TTF asset path under /public/fonts. */
const TTF_BY_LANGUAGE: Partial<Record<Language, string>> = {
  বাংলা: '/fonts/NotoSansBengali-Regular.ttf',
  日本語: '/fonts/NotoSansJP-Regular.ttf',
  简体中文: '/fonts/NotoSansSC-Regular.ttf',
  한국어: '/fonts/NotoSansKR-Regular.ttf',
}

export async function loadFontForLanguage(
  language: Language,
  fetchFn: typeof fetch = typeof fetch !== 'undefined' ? fetch : (undefined as unknown as typeof fetch)
): Promise<FontChoice> {
  const path = TTF_BY_LANGUAGE[language]
  if (!path || !fetchFn) return { kind: 'standard' } // Latin → built-in Helvetica
  try {
    const res = await fetchFn(path)
    if (!res.ok) return { kind: 'standard' }
    const buf = await res.arrayBuffer()
    return { kind: 'custom', bytes: new Uint8Array(buf) }
  } catch {
    return { kind: 'standard' } // missing asset → degrade to Latin, never crash
  }
}
