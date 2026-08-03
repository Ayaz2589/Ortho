import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Spec 034 FR-003/FR-005 — "no dead space" packing invariant, locked at the CSS
// level (jsdom can't measure real column layout). A fixed multi-column grid with
// width-varying spans strands interior holes for user-toggled subsets; the board
// must instead be a COLUMN MASONRY (uniform-width columns, height tiers, wide =
// span-all) which packs with no interior gap for ANY enabled subset. This guard
// fails if the board regresses to width spans.

const css = readFileSync(
  fileURLToPath(new URL('../../app/globals.css', import.meta.url)),
  'utf8'
)

/** The `.ow-board { ... }` (and immediately-following widget-size) declarations. */
function boardBlock(): string {
  const start = css.indexOf('.ow-board')
  expect(start).toBeGreaterThan(-1)
  // Grab a generous slice covering the board + its size-tier rules.
  return css.slice(start, start + 1200)
}

describe('widget board packing model (FR-003/FR-005)', () => {
  const block = boardBlock()

  it('is a column masonry, not a fixed column grid', () => {
    expect(block).toMatch(/\.ow-board\s*\{[^}]*columns\s*:/)
    // Must NOT pin a fixed multi-column grid on the board (the hole-prone model).
    expect(block).not.toMatch(/\.ow-board\s*\{[^}]*grid-template-columns/)
  })

  it('sizes are height tiers, never multi-track width spans', () => {
    for (const size of ['sm', 'md', 'lg']) {
      const rule = new RegExp(`\\.ow-w-${size}\\s*\\{([^}]*)\\}`).exec(block)?.[1] ?? ''
      expect(rule).toMatch(/min-height/)
      // A width span > 1 track is exactly what strands interior holes.
      expect(rule).not.toMatch(/grid-column|column-span/)
    }
  })

  it('the wide widget spans every column', () => {
    const rule = /\.ow-w-wide\s*\{([^}]*)\}/.exec(block)?.[1] ?? ''
    expect(rule).toMatch(/column-span\s*:\s*all/)
  })
})
