/**
 * Full-UI translation, mirroring iOS's Localizable.xcstrings: keys are the
 * English source strings; each language file maps key → translation, seeded
 * from the iOS catalog so shared strings read identically on both apps.
 * English needs no catalog (identity). Dynamic values use positional
 * placeholders — t('Day {0} of {1}', day, total) — the web equivalent of
 * iOS's %lld/%@ specifiers.
 */
import bn from './bn'
import es from './es'
import ja from './ja'
import zh from './zh'
import ko from './ko'
import type { Language } from '../language'

const CATALOGS: Partial<Record<Exclude<Language, 'System' | 'English'>, Record<string, string>>> = {
  বাংলা: bn,
  Español: es,
  日本語: ja,
  简体中文: zh,
  한국어: ko,
}

/** Resolve "System" to a named language via the browser's language tag,
 *  mirroring iOS's system-language behavior. Unsupported tags → English. */
function effectiveLanguage(language: Language): Language {
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

export type Translate = (key: string, ...args: Array<string | number>) => string

/** Build the `t` function for a picker language. Missing keys fall back to
 *  the English source string, exactly like iOS's untranslated behavior. */
export function makeT(language: Language): Translate {
  const resolved = effectiveLanguage(language)
  const catalog = resolved === 'English' ? undefined : CATALOGS[resolved as keyof typeof CATALOGS]
  return (key, ...args) => {
    const s = catalog?.[key] ?? key
    return args.length ? s.replace(/\{(\d+)\}/g, (m, i) => String(args[Number(i)] ?? m)) : s
  }
}
