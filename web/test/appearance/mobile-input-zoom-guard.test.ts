import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// iOS Safari (and the Capacitor WKWebView) auto-zooms the viewport in whenever
// a focused text-entry control has a font-size below 16px. That zoom enlarges
// the layout past the screen and forces an unwanted horizontal scroll the user
// has to swipe back after every tap. The form controls in this app are sized
// 14–15px for the calm desktop design, so on touch devices we hold every
// text-entry field at 16px to prevent the zoom. Desktop (fine pointer) keeps
// its tighter sizing.
const CSS = readFileSync(fileURLToPath(new URL('../../app/globals.css', import.meta.url)), 'utf8')

// Pull out the `@media (pointer: coarse) { ... }` block that carries the guard.
function coarsePointerBlock(css: string): string {
  const start = css.search(/@media\s*\(\s*pointer:\s*coarse\s*\)\s*\{/)
  if (start === -1) return ''
  let depth = 0
  for (let i = css.indexOf('{', start); i < css.length; i++) {
    if (css[i] === '{') depth++
    else if (css[i] === '}') {
      depth--
      if (depth === 0) return css.slice(start, i + 1)
    }
  }
  return ''
}

describe('mobile input zoom guard', () => {
  const block = coarsePointerBlock(CSS)

  it('holds form controls at 16px on coarse-pointer (touch) devices', () => {
    expect(block).not.toBe('')
    // The 16px floor is what stops iOS Safari from zooming on focus.
    expect(/font-size:\s*16px/.test(block)).toBe(true)
    // Must reach every text-entry control kind, incl. inline-styled selects.
    expect(/\binput\b/.test(block)).toBe(true)
    expect(/\btextarea\b/.test(block)).toBe(true)
    expect(/\bselect\b/.test(block)).toBe(true)
    // Inline styles (e.g. the "Paid by" select) need !important to be beaten.
    expect(/16px\s*!important/.test(block)).toBe(true)
  })

  it('leaves the oversized amount hero untouched', () => {
    // The amount entry is intentionally huge and already well above 16px; the
    // floor must exclude it so it is never shrunk to 16px.
    expect(/:not\(\.ow-amount-input\)/.test(block)).toBe(true)
  })

  it('does not disable pinch-to-zoom in the viewport (accessibility)', () => {
    // The fix is font-size, NOT a locked viewport. A maximum-scale/user-scalable
    // lock would break accessibility zoom and must not be how we solve this.
    // Strip comments first so explanatory prose about the tokens doesn't count.
    const rules = CSS.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(/maximum-scale/.test(rules)).toBe(false)
    expect(/user-scalable/.test(rules)).toBe(false)
  })
})
