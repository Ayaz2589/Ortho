/**
 * Language picker option → BCP-47 locale, the single source of truth shared by
 * the store and the Settings picker. The locale drives every `Intl`-based
 * money/number/date formatter (mirrors iOS's @AppStorage("language") →
 * .environment(\.locale)). "System" follows the browser's `navigator.language`.
 */

export const LANGUAGES = [
  'System',
  'English',
  'বাংলা',
  'Español',
  '日本語',
  '简体中文',
  '한국어',
] as const

export type Language = (typeof LANGUAGES)[number]

export const DEFAULT_LANGUAGE: Language = 'System'

/** Fallback locale used for "System" during SSR and before hydration. */
export const DEFAULT_LOCALE = 'en-US'

/** Each named language maps to a fixed BCP-47 locale. "System" resolves at
 *  render time from the browser, so it has no fixed entry here. */
const LOCALE_BY_LANGUAGE: Record<Exclude<Language, 'System'>, string> = {
  English: 'en-US',
  বাংলা: 'bn-BD',
  Español: 'es-ES',
  日本語: 'ja-JP',
  简体中文: 'zh-Hans',
  한국어: 'ko-KR',
}

/** Narrow an arbitrary stored string to a known Language, or the default. */
export function asLanguage(value: string | null | undefined): Language {
  return (LANGUAGES as readonly string[]).includes(value ?? '')
    ? (value as Language)
    : DEFAULT_LANGUAGE
}

/**
 * Resolve a language option to a BCP-47 locale. "System" reads
 * `navigator.language`, guarded for server render (returns the default locale
 * when `navigator` is unavailable) so SSR and the first client paint agree.
 */
export function localeForLanguage(language: Language): string {
  if (language === 'System') {
    return typeof navigator !== 'undefined' && navigator.language
      ? navigator.language
      : DEFAULT_LOCALE
  }
  return LOCALE_BY_LANGUAGE[language]
}
