/**
 * The cadence day, rendered for a locale.
 *
 * English gets a real ordinal ("1st", "22nd"); every other locale gets the plain
 * number, because the `st/nd/rd/th` suffixes are English words. Mapping
 * `Intl.PluralRules` ordinal categories onto them unconditionally printed
 * "cada día 15th" and "毎月15th" — a translated sentence with an untranslated
 * word inside it (spec 059 review).
 *
 * The surrounding sentence carries the "every …" framing in each catalog, so the
 * plain number reads correctly there.
 */
export function ordinalDay(day: number, locale: string): string {
  if (!/^en\b/i.test(locale)) return String(day)
  try {
    const category = new Intl.PluralRules(locale, { type: 'ordinal' }).select(day)
    const suffix = { one: 'st', two: 'nd', few: 'rd', other: 'th' }[category as 'one' | 'two' | 'few' | 'other']
    return suffix ? `${day}${suffix}` : String(day)
  } catch {
    return String(day)
  }
}
