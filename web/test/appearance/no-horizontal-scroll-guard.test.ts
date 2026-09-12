import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Guard for: horizontal scrolling on mobile (spec 058).
//
// Symptom: opening a dashboard widget's detail panel on a phone let the panel
// pan sideways. The causes were per-component (see the panel/heatmap suites),
// but a document-level backstop is what guarantees the class of bug can never
// reach a user again from some future component.
//
// The backstop must be `overflow-x: clip`, NOT `overflow-x: hidden`.
// `hidden` turns the document into a scroll container, which silently breaks
// `position: sticky` descendants and programmatic scrolling; `clip` clips the
// overflow without establishing one. `clip` also leaves the vertical axis
// alone: per CSS Overflow 3, `visible` is only forced to `auto` when the other
// axis is neither `visible` nor `clip`, so `overflow-y` stays `visible` here
// and the page keeps scrolling normally.

const CSS = readFileSync(fileURLToPath(new URL('../../app/globals.css', import.meta.url)), 'utf8')
const SHELL = readFileSync(fileURLToPath(new URL('../../app/(app)/layout.tsx', import.meta.url)), 'utf8')

/** The class list on the shell's <main> element. */
function mainClassList(): string {
  return SHELL.match(/<main\s+className="([^"]+)"/)?.[1] ?? ''
}

/** The declaration block for a selector, e.g. `html,\n body { … }`. */
function ruleBlock(css: string, selectorPattern: RegExp): string {
  const m = css.match(selectorPattern)
  if (!m || m.index === undefined) return ''
  const open = css.indexOf('{', m.index)
  if (open === -1) return ''
  const close = css.indexOf('}', open)
  return close === -1 ? '' : css.slice(open + 1, close)
}

describe('app-wide horizontal scroll guard', () => {
  const block = ruleBlock(CSS, /^html,\s*\n\s*body\s*\{/m)

  it('declares a document-level horizontal-overflow backstop', () => {
    expect(block, 'globals.css needs an `html, body` rule carrying the backstop').not.toBe('')
    expect(/overflow-x:\s*clip/.test(block)).toBe(true)
  })

  it('uses clip rather than hidden, so the document never becomes a scroll container', () => {
    expect(/overflow-x:\s*hidden/.test(block), 'hidden breaks position: sticky').toBe(false)
  })

  it('never locks the viewport to defeat the scroll instead of fixing the overflow', () => {
    // A locked viewport (maximum-scale / user-scalable=no) would hide the
    // symptom while destroying pinch-to-zoom, which the app deliberately keeps
    // available for accessibility.
    expect(/user-scalable\s*=\s*no|maximum-scale\s*=\s*1/.test(CSS)).toBe(false)
  })
})

describe('app shell horizontal containment', () => {
  // THE app-wide cause. <main> is `flex-1` inside a `flex` row, and a flex item
  // defaults to `min-width: auto` — it refuses to shrink below its content. The
  // shell only ever applied `sm:min-w-0`, so mobile, the one place the bug was
  // reported, was the single tier NOT covered: any wide descendant pushed
  // <main> past the viewport on a phone and nowhere else.
  it('lets <main> shrink to the viewport on mobile, not only from sm: up', () => {
    const cls = mainClassList()
    expect(cls, 'could not read the class list off the shell <main>').not.toBe('')
    // Deliberately anchored on a word boundary that `sm:min-w-0` cannot satisfy.
    expect(/(^|\s)min-w-0(\s|$)/.test(cls), `<main> needs an unprefixed min-w-0; got: ${cls}`).toBe(true)
  })

  // Second half of the same cause: `overflow-y-auto` with the x-axis left at its
  // initial `visible` makes overflow-x compute to `auto` (CSS Overflow 3), so
  // <main> became the horizontal scroller for every route in the app.
  it('does not let <main> scroll horizontally while it scrolls vertically', () => {
    const cls = mainClassList()
    expect(/\boverflow-y-auto\b/.test(cls), '<main> should still scroll vertically').toBe(true)
    expect(/\boverflow-x-hidden\b/.test(cls), '<main> must not scroll horizontally').toBe(true)
  })
})

describe('right-side drawer', () => {
  // `.ow-drawer` is 440px capped at 90vw, and every Drawer that does NOT opt
  // into `fullBleedOnMobile` (budgets, household, filters) renders in it on a
  // phone too. `overflow: auto` scrolls BOTH axes, so wide content panned it.
  it('scrolls vertically only', () => {
    const block = ruleBlock(CSS, /^\.ow-drawer \{/m)
    expect(block, 'globals.css should define .ow-drawer').not.toBe('')
    expect(/overflow:\s*auto/.test(block), '`overflow: auto` scrolls both axes').toBe(false)
    expect(/overflow-y:\s*auto/.test(block)).toBe(true)
    expect(/overflow-x:\s*hidden/.test(block)).toBe(true)
  })
})

describe('percentage-positioned markers', () => {
  // The generalised form of the CycleStrip / SpendingPacePanel defect. An
  // element placed at `left: ${pct}%` and centred with a blanket
  // `translateX(-50%)` hangs half its width off the track at 0% and again at
  // 100%. That overhang widens the container, and inside a panel on a phone it
  // is enough to make the whole surface pan. `edgeAnchoredTransform` is the
  // measurement-free fix, so the pairing must never reappear.
  const ROOTS = ['../../components', '../../app']

  function tsxFiles(): string[] {
    const out: string[] = []
    for (const root of ROOTS) {
      const dir = fileURLToPath(new URL(root, import.meta.url))
      for (const rel of readdirSync(dir, { recursive: true, encoding: 'utf8' })) {
        if (rel.endsWith('.tsx')) out.push(`${dir}/${rel}`)
      }
    }
    return out
  }

  /** Every `style={{ … }}` object literal in a file, brace-matched. */
  function styleObjects(src: string): string[] {
    const found: string[] = []
    const marker = 'style={{'
    let i = src.indexOf(marker)
    while (i !== -1) {
      let depth = 0
      for (let j = i + marker.length - 2; j < src.length; j++) {
        if (src[j] === '{') depth++
        else if (src[j] === '}') {
          depth--
          if (depth === 0) {
            found.push(src.slice(i, j + 1))
            break
          }
        }
      }
      i = src.indexOf(marker, i + 1)
    }
    return found
  }

  it('are anchored to their track, never centred with a blanket translateX(-50%)', () => {
    const offenders: string[] = []
    for (const file of tsxFiles()) {
      for (const obj of styleObjects(readFileSync(file, 'utf8'))) {
        const percentPositioned = /(left|right):\s*`\$\{[^`]*\}%`/.test(obj)
        const blanketCentre = /translateX\(-50%\)/.test(obj)
        if (percentPositioned && blanketCentre) {
          offenders.push(file.replace(/.*\/web\//, 'web/'))
        }
      }
    }
    expect(
      offenders,
      `these position a marker by percentage and centre it blindly; use edgeAnchoredTransform:\n${offenders.join('\n')}`
    ).toEqual([])
  })
})
