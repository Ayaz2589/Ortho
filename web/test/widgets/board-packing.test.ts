import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Spec 034 FR-003/FR-005 — "no dead space" packing invariant, locked at the CSS
// level (jsdom can't measure real layout). Spec 037 makes every widget the SAME
// height on a UNIFORM grid: equal columns + a single `grid-auto-rows` height and
// no per-item width spans. Uniform cells cannot strand an interior hole for any
// toggled subset, so this is the model that replaces the old height-tier masonry.
// This guard fails if the board regresses to per-item sizes (height tiers or
// width spans), which is what reintroduces dead space.

const css = readFileSync(
  fileURLToPath(new URL('../../app/globals.css', import.meta.url)),
  'utf8'
)

/** The `.ow-board { ... }` (and immediately-following) declarations. */
function boardBlock(): string {
  const start = css.indexOf('.ow-board')
  expect(start).toBeGreaterThan(-1)
  return css.slice(start, start + 1200)
}

describe('widget board packing model (FR-003/FR-005)', () => {
  const block = boardBlock()

  it('is a uniform grid with equal columns', () => {
    expect(block).toMatch(/\.ow-board\s*\{[^}]*display\s*:\s*grid/)
    expect(block).toMatch(/\.ow-board\s*\{[^}]*grid-template-columns/)
  })

  it('gives every widget the same height (a single grid-auto-rows track)', () => {
    expect(block).toMatch(/\.ow-board\s*\{[^}]*grid-auto-rows\s*:/)
  })

  it('declares no per-widget size classes (no height tiers, no width spans)', () => {
    expect(block).not.toMatch(/\.ow-w-(sm|md|lg|wide)/)
    expect(block).not.toMatch(/column-span/)
  })
})
