import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative } from 'node:path'

/**
 * Tokens-only guard (constitution I): surface fills must use theme-aware CSS
 * variables, never a hardcoded color literal. A fixed `rgba(0,0,0,0.05)`
 * background looks right in light mode but composites to <1/255 over the dark
 * surface, so progress-bar tracks, segmented grooves, and icon tiles VANISH in
 * dark mode. The adaptive token `var(--chip-bg)` (light rgba(26,24,21,0.05) /
 * dark rgba(255,255,255,0.07)) is the correct fill.
 *
 * We flag the quoted literal `'rgba(0,0,0,…'` (a color used as a VALUE — a
 * background/fill). Box-shadows legitimately stay dark and are written inline
 * (`… 2px rgba(0,0,0,0.05)`), with no quote immediately before `rgba`, so they
 * are not matched.
 */

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..')
const SCAN_DIRS = ['components', 'app']
const FORBIDDEN = /'rgba\(0, ?0, ?0,/ // quoted black-alpha literal used as a value

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, acc)
    else if (/\.(ts|tsx)$/.test(p) && !p.endsWith('.d.ts')) acc.push(p)
  }
  return acc
}

describe('tokens-only backgrounds', () => {
  it('no component uses a hardcoded black-alpha fill (use var(--chip-bg))', () => {
    const offenders: string[] = []
    for (const dir of SCAN_DIRS) {
      for (const f of walk(join(WEB, dir))) {
        const src = readFileSync(f, 'utf8')
        src.split('\n').forEach((line, i) => {
          if (FORBIDDEN.test(line)) offenders.push(`${relative(WEB, f)}:${i + 1}  ${line.trim()}`)
        })
      }
    }
    expect(offenders, `hardcoded fills (use var(--chip-bg)):\n${offenders.join('\n')}`).toEqual([])
  })
})
