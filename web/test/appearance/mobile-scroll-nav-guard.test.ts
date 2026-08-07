import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Guard for: mobile excess scroll + drifting bottom tab bar.
//
// Root cause: the shell's h-screen/overflow-hidden/overflow-y-auto clamps were
// desktop-only (sm:). On mobile, the document scrolled naturally with no height
// bound — on iOS Safari/WKWebView the URL-bar collapse shifts the visual viewport
// without adjusting the layout viewport, so the layout overflows into empty space
// and the `fixed` tab bar "drifts" as the URL bar collapses.
//
// Fix: give the mobile shell the same contained-scroll posture as the desktop,
// using h-dvh (dynamic viewport height) so the container shrinks with the URL bar.

const SHELL = readFileSync(
  fileURLToPath(new URL('../../app/(app)/layout.tsx', import.meta.url)),
  'utf8'
)
const TABBAR = readFileSync(
  fileURLToPath(new URL('../../components/TabBar.tsx', import.meta.url)),
  'utf8'
)

describe('mobile scroll + nav guard', () => {
  it('shell height is dvh-based AND zoom-corrected (fits the viewport under the text-size zoom)', () => {
    // The shell height must (1) use `dvh` so it tracks the mobile dynamic viewport
    // (URL-bar collapse), and (2) divide by the text-size zoom (`--ui-zoom`) so a
    // `100dvh` box doesn't render at viewport×zoom and overflow — the exact
    // "double scrollbar" this guards against (verified in Chromium). Both live in
    // `calc(100dvh / var(--ui-zoom, …))` on the shell.
    expect(/calc\(\s*100dvh\s*\/\s*var\(--ui-zoom/.test(SHELL)).toBe(true)
  })

  it('shell outer div has overflow-hidden so body-level scroll never returns', () => {
    // overflow-hidden on the shell keeps the scroll inside <main>; without it the
    // document scrolls on mobile and the fixed tab bar drifts.
    expect(/\boverflow-hidden\b/.test(SHELL)).toBe(true)
  })

  it('shell never uses a static h-screen/100vh (ignores the URL bar AND overflows under zoom)', () => {
    // `h-screen` (100vh) tracks the LARGE viewport (ignores the mobile URL bar) and
    // — like any plain viewport-height — renders taller than the viewport under the
    // text-size zoom, reintroducing the double scrollbar. The shell must use the
    // zoom-corrected dvh calc above instead.
    expect(/\bh-screen\b/.test(SHELL), 'shell must not use h-screen').toBe(false)
    expect(/\b100vh\b/.test(SHELL), 'shell must not use 100vh').toBe(false)
  })

  it('shell <main> has overflow-y-auto without a sm: breakpoint prefix (mobile scrolls inside main)', () => {
    // Currently only sm:overflow-y-auto — strip that and confirm a bare
    // overflow-y-auto still exists (i.e. it applies on mobile too).
    const withoutSmPrefixed = SHELL.replace(/\bsm:overflow-y-auto\b/g, '')
    expect(/\boverflow-y-auto\b/.test(withoutSmPrefixed)).toBe(true)
  })

  it('TabBar is still fixed to the viewport (no regression from PR #69)', () => {
    expect(/\bfixed\b/.test(TABBAR)).toBe(true)
  })
})
