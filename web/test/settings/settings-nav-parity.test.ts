import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// Review 2026-08-24, C1: the Deposit Accounts page was unreachable on desktop
// because the mobile-only settings hub was the only link to it and the desktop
// layout redirects /settings straight to /settings/household. This parity
// guard fails whenever the mobile hub links to a settings page the desktop
// secondary nav does not carry (documented exceptions only).

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

/** Pages deliberately absent from the desktop section nav, each with a why. */
const DESKTOP_NAV_EXCEPTIONS = new Set<string>([
  // Kept reachable on desktop via the fallback row on the Household page.
  '/settings/linked-banks',
])

function hrefs(file: string, pattern: RegExp): Set<string> {
  const src = readFileSync(file, 'utf8')
  const out = new Set<string>()
  for (const m of src.matchAll(pattern)) out.add(m[1])
  return out
}

describe('settings navigation parity (mobile hub ⊆ desktop nav)', () => {
  it('every settings page the mobile hub links is in the desktop nav (or a documented exception)', () => {
    const hub = hrefs(join(WEB, 'app', '(app)', 'settings', 'page.tsx'), /['"](\/settings\/[a-z-]+)['"]/g)
    const nav = hrefs(
      join(WEB, 'components', 'settings', 'SettingsSecondaryNav.tsx'),
      /href: '(\/settings\/[a-z-]+)'/g
    )
    const missing = [...hub].filter((href) => !nav.has(href) && !DESKTOP_NAV_EXCEPTIONS.has(href)).sort()
    expect(missing, `mobile-hub settings pages unreachable from the desktop nav: ${JSON.stringify(missing)}`).toEqual([])
  })
})
