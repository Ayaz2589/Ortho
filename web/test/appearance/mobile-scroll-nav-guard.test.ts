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
  it('shell outer div has h-dvh AND overflow-hidden in the same className (both required for mobile scroll containment)', () => {
    // h-dvh clamps the container to the dynamic viewport; overflow-hidden prevents
    // body-level scroll from returning. Both must be on the SAME element — checking
    // the same className string ensures neither is silently moved to a child.
    const sameCls =
      /className="[^"]*(?:\bh-dvh\b[^"]*\boverflow-hidden\b|\boverflow-hidden\b[^"]*\bh-dvh\b)/
    expect(sameCls.test(SHELL)).toBe(true)
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
