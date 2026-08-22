import type { Language } from '../language'

/**
 * Resolve "System" to a named language via a browser language tag, mirroring iOS's
 * system-language behavior. Unsupported tags → English.
 *
 * spec 045: extracted from lib/i18n/index.ts, which also exports `useTranslate` and so
 * depends on React hooks. That makes index.ts client-only, and the landing route is a
 * SERVER component — importing the registry there dragged `useEffect`/`useState` into a
 * Server Component and failed the build. This function was always pure; it just lived
 * in the wrong file. `index.ts` re-exports it, so every existing import is unchanged.
 *
 * `tagOverride` lets a caller resolve an explicit tag instead of reading
 * `navigator.language` — used by the landing-locale registry's `detectLandingSlug`, so
 * browser-tag parsing lives in exactly one place rather than being duplicated there.
 */
export function effectiveLanguage(language: Language, tagOverride?: string): Language {
  if (language !== 'System') return language
  const tag = tagOverride ?? ((typeof navigator !== 'undefined' ? navigator.language : '') || '')
  const prefix = tag.toLowerCase().split('-')[0]
  switch (prefix) {
    case 'bn':
      return 'বাংলা'
    case 'es':
      return 'Español'
    case 'ja':
      return '日本語'
    case 'zh':
      return '简体中文'
    case 'ko':
      return '한국어'
    default:
      return 'English'
  }
}
