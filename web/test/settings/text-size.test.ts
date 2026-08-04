// @vitest-environment jsdom
//
// Spec 040 — a per-device "text size" preference applied as a whole-UI `zoom` on
// <html>, mirroring the appearance.ts pattern. Reads never throw; unknown/missing
// values coerce to the default (medium). The pre-paint boot script is generated
// from the same scale map so it can never drift. FR-002/003/004/007/008/009.
import { describe, it, expect, beforeEach } from 'vitest'
import {
  type TextSize,
  TEXT_SIZES,
  DEFAULT_TEXT_SIZE,
  TEXT_SIZE_SCALE,
  applyTextSize,
  readTextSize,
  writeTextSize,
  textSizeBootScript,
} from '@/components/settings/textSize'

function resetRoot() {
  const r = document.documentElement
  r.style.removeProperty('zoom')
  r.removeAttribute('data-text-size')
}

beforeEach(() => {
  localStorage.clear()
  resetRoot()
})

describe('text-size constants', () => {
  it('exposes exactly the four sizes in ascending order', () => {
    expect(TEXT_SIZES).toEqual(['small', 'medium', 'large', 'xlarge'])
  })

  it('defaults to medium (the subtle global bump)', () => {
    expect(DEFAULT_TEXT_SIZE).toBe('medium')
  })

  it('maps small to exactly 1.00 (the pre-feature baseline / way back)', () => {
    expect(TEXT_SIZE_SCALE.small).toBe(1)
  })

  it('is strictly increasing across the sizes (monotonic scale)', () => {
    const scales = TEXT_SIZES.map((s) => TEXT_SIZE_SCALE[s])
    for (let i = 1; i < scales.length; i++) {
      expect(scales[i]).toBeGreaterThan(scales[i - 1])
    }
  })

  it('has a scale entry for every size', () => {
    for (const s of TEXT_SIZES) expect(typeof TEXT_SIZE_SCALE[s]).toBe('number')
  })
})

describe('readTextSize', () => {
  it('returns the default when nothing is stored', () => {
    expect(readTextSize()).toBe('medium')
  })

  it('returns a valid stored size', () => {
    localStorage.setItem('textSize', 'large')
    expect(readTextSize()).toBe('large')
  })

  it.each(['', ' ', 'xxlarge', 'HUGE', '{bad', '1.06', 'null'])(
    'coerces the invalid stored value %o to the default',
    (bad) => {
      localStorage.setItem('textSize', bad)
      expect(readTextSize()).toBe('medium')
    },
  )
})

describe('applyTextSize', () => {
  it.each(TEXT_SIZES as readonly TextSize[])(
    'applies %s as a zoom on <html> plus a data attribute',
    (size) => {
      applyTextSize(size)
      const r = document.documentElement
      expect(r.style.getPropertyValue('zoom')).toBe(String(TEXT_SIZE_SCALE[size]))
      expect(r.getAttribute('data-text-size')).toBe(size)
    },
  )
})

describe('writeTextSize', () => {
  it('persists under the "textSize" key and applies immediately', () => {
    writeTextSize('xlarge')
    expect(localStorage.getItem('textSize')).toBe('xlarge')
    expect(document.documentElement.getAttribute('data-text-size')).toBe('xlarge')
    expect(document.documentElement.style.getPropertyValue('zoom')).toBe('1.22')
    // round-trips back through read
    expect(readTextSize()).toBe('xlarge')
  })
})

describe('textSizeBootScript (pre-paint, no-flash)', () => {
  it('applies the stored size when executed before hydration', () => {
    localStorage.setItem('textSize', 'large')
    // Execute the exact inline script the root layout injects.
    new Function(textSizeBootScript())()
    expect(document.documentElement.getAttribute('data-text-size')).toBe('large')
    expect(document.documentElement.style.getPropertyValue('zoom')).toBe('1.14')
  })

  it('defaults to medium when no size is stored (the global bump reaches everyone)', () => {
    new Function(textSizeBootScript())()
    expect(document.documentElement.getAttribute('data-text-size')).toBe('medium')
    expect(document.documentElement.style.getPropertyValue('zoom')).toBe('1.06')
  })

  it('falls back to medium for an unknown stored value', () => {
    localStorage.setItem('textSize', 'gigantic')
    new Function(textSizeBootScript())()
    expect(document.documentElement.getAttribute('data-text-size')).toBe('medium')
  })

  it('embeds the scale map from the single source of truth', () => {
    const script = textSizeBootScript()
    for (const s of TEXT_SIZES) expect(script).toContain(String(TEXT_SIZE_SCALE[s]))
  })
})
