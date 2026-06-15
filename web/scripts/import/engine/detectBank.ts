// Bank detection: run every profile's fingerprint check. Exactly one match wins;
// an override forces a profile; zero or many matches are reported (never guessed).
import type { BankProfile } from './types'
import { PROFILES } from '../profiles'

export type DetectResult =
  | { ok: true; profile: BankProfile }
  | { ok: false; code: 'unknown' | 'ambiguous' | 'bad-override'; message: string }

/**
 * @param text full extracted statement text
 * @param override optional forced bank id (from --bank / BANK=)
 * @param profiles registry to match against (injectable for tests)
 */
export function detectBank(text: string, override?: string | null, profiles: BankProfile[] = PROFILES): DetectResult {
  if (override) {
    const p = profiles.find((x) => x.id === override)
    if (!p) {
      return {
        ok: false,
        code: 'bad-override',
        message: `Unknown bank id "${override}". Known: ${profiles.map((x) => x.id).join(', ')}`,
      }
    }
    return { ok: true, profile: p }
  }

  const matches = profiles.filter((p) => p.detect(text))
  if (matches.length === 1) return { ok: true, profile: matches[0] }
  if (matches.length === 0) {
    return {
      ok: false,
      code: 'unknown',
      message: `Unsupported bank — no profile matched. Known profiles: ${profiles.map((x) => x.id).join(', ')}.`,
    }
  }
  return {
    ok: false,
    code: 'ambiguous',
    message: `Ambiguous — matched ${matches.map((m) => m.id).join(', ')}. Pass BANK=<id> to force one.`,
  }
}
