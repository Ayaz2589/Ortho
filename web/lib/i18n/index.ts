/**
 * Full-UI translation, mirroring iOS's Localizable.xcstrings: keys are the
 * English source strings; each language file maps key → translation, seeded
 * from the iOS catalog so shared strings read identically on both apps.
 * English needs no catalog (identity). Dynamic values use positional
 * placeholders — t('Day {0} of {1}', day, total) — the web equivalent of
 * iOS's %lld/%@ specifiers.
 *
 * Catalogs are DYNAMICALLY imported per active language (spec 023 P1): the five
 * (~30 KB gzip / ~100 KB raw combined) never enter the initial-load bundle, and
 * a default English/System-English user downloads none. `useTranslate` loads the
 * active catalog after mount and returns the English identity until it resolves.
 */
import { useEffect, useMemo, useState } from 'react'
import type { Language } from '../language'

type CatalogLang = Exclude<Language, 'System' | 'English'>

const CATALOG_LOADERS: Record<CatalogLang, () => Promise<{ default: Record<string, string> }>> = {
  বাংলা: () => import('./bn'),
  Español: () => import('./es'),
  日本語: () => import('./ja'),
  简体中文: () => import('./zh'),
  한국어: () => import('./ko'),
}

/** Resolve "System" to a named language via the browser's language tag,
 *  mirroring iOS's system-language behavior. Unsupported tags → English. */
export function effectiveLanguage(language: Language): Language {
  if (language !== 'System') return language
  const tag = (typeof navigator !== 'undefined' ? navigator.language : '') || ''
  const prefix = tag.toLowerCase().split('-')[0]
  switch (prefix) {
    case 'bn': return 'বাংলা'
    case 'es': return 'Español'
    case 'ja': return '日本語'
    case 'zh': return '简体中文'
    case 'ko': return '한국어'
    default: return 'English'
  }
}

/** Dynamically load the catalog for a language (`undefined` for English/System-
 *  English). Only the active language's chunk is fetched. */
export async function loadCatalog(language: Language): Promise<Record<string, string> | undefined> {
  const resolved = effectiveLanguage(language)
  if (resolved === 'English') return undefined
  const loader = CATALOG_LOADERS[resolved as CatalogLang]
  if (!loader) return undefined
  return (await loader()).default
}

export type Translate = (key: string, ...args: Array<string | number>) => string

/** Build a `t` function from an already-loaded catalog (identity when none).
 *  Missing keys fall back to the English source string, exactly like iOS. */
export function makeT(catalog: Record<string, string> | undefined): Translate {
  return (key, ...args) => {
    const s = catalog?.[key] ?? key
    return args.length ? s.replace(/\{(\d+)\}/g, (m, i) => String(args[Number(i)] ?? m)) : s
  }
}

/** React hook: the `t` function for the selected language. Dynamically loads the
 *  active catalog after mount and returns the English identity until it resolves
 *  — so non-active catalogs never enter the initial-load bundle and a language
 *  switch never flashes a stale catalog (spec 023 P1). */
export function useTranslate(language: Language): Translate {
  const resolved = effectiveLanguage(language)
  const [loaded, setLoaded] = useState<{ lang: Language; map?: Record<string, string> }>({ lang: 'English' })
  useEffect(() => {
    if (loaded.lang === resolved) return
    let cancelled = false
    void loadCatalog(language).then((map) => {
      if (!cancelled) setLoaded({ lang: resolved, map })
    })
    return () => {
      cancelled = true
    }
  }, [language, resolved, loaded.lang])
  // Apply the catalog only when it matches the active language; otherwise the
  // English identity (no wrong-language flash while a switch is loading).
  const activeCatalog = loaded.lang === resolved ? loaded.map : undefined
  return useMemo(() => makeT(activeCatalog), [activeCatalog])
}
