import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Guard for: a second scrollbar on the desktop side nav ("double scroll").
//
// Root cause: the app shell was migrated to h-dvh (dynamic viewport height) so the
// container tracks the *visible* viewport (see mobile-scroll-nav-guard.test.ts),
// but the Sidebar kept the static h-screen (100vh / large viewport). When the
// dynamic viewport is shorter than the large viewport, the h-screen nav is TALLER
// than its h-dvh container; inside the shell's overflow-hidden scroll context that
// gives the nav its own scroll body — a second scrollbar beside <main>'s.
//
// Fix: bind the sidebar to its container height with h-full (a flex child fills the
// container), so it can never exceed the shell and never scrolls on its own.

const SIDEBAR = readFileSync(
  fileURLToPath(new URL('../../components/Sidebar.tsx', import.meta.url)),
  'utf8'
)

// The nav's own className, identified by its unique width step `sm:w-[72px]` — so
// the guard inspects the classes that actually size the nav, not an incidental
// mention of `h-screen` in a comment.
const navClass = SIDEBAR.match(/className="([^"]*sm:w-\[72px\][^"]*)"/)?.[1] ?? ''

describe('sidebar no-scroll guard', () => {
  it('resolves the nav className', () => {
    expect(navClass).not.toBe('')
  })

  it('the nav fills its container with h-full', () => {
    expect(/\bh-full\b/.test(navClass)).toBe(true)
  })

  it('the nav does NOT use the static h-screen (it mismatches the h-dvh shell)', () => {
    expect(/\bh-screen\b/.test(navClass)).toBe(false)
  })
})
