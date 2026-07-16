import { describe, it, expect } from 'vitest'
import es from '@/lib/i18n/es'
import ja from '@/lib/i18n/ja'
import zh from '@/lib/i18n/zh'
import ko from '@/lib/i18n/ko'
import bn from '@/lib/i18n/bn'

// B6 (spec 023): sign-in uses an 8-digit code, and the page requests the key
// "We'll email you an 8-digit code. …". Every catalog must translate THAT key
// (not the stale 6-digit one, which left non-English users on the English
// fallback) and the translated text must say 8, not 6.
const KEY_8 = "We'll email you an 8-digit code. No password, no fuss."
const KEY_6 = "We'll email you a 6-digit code. No password, no fuss."
const CATALOGS: Array<[string, Record<string, string>]> = [
  ['es', es], ['ja', ja], ['zh', zh], ['ko', ko], ['bn', bn],
]

describe('B6: sign-in code copy is 8-digit in every language', () => {
  for (const [name, cat] of CATALOGS) {
    it(`${name} translates the 8-digit key and has no stale 6-digit one`, () => {
      expect(cat[KEY_8], `${name} is missing the 8-digit translation`).toBeTruthy()
      expect(cat[KEY_6], `${name} still carries the stale 6-digit key`).toBeUndefined()
      expect(cat[KEY_8].includes('8'), `${name} translation should say 8`).toBe(true)
      expect(cat[KEY_8].includes('6'), `${name} translation should not say 6`).toBe(false)
    })
  }
})
