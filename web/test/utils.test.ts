import { describe, it, expect } from 'vitest'
import { cn, paletteClasses, PALETTE_KEYS, CATEGORY_META } from '@/lib/utils'

describe('cn', () => {
  it('merges multiple class strings', () => {
    expect(cn('px-2', 'text-sm')).toBe('px-2 text-sm')
  })

  it('lets a later Tailwind utility win on conflict', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4')
    expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500')
  })

  it('ignores falsy values', () => {
    expect(cn('px-2', false, null, undefined, '', 'py-2')).toBe('px-2 py-2')
  })

  it('flattens arrays (clsx semantics)', () => {
    expect(cn(['px-2', 'py-2'], 'text-sm')).toBe('px-2 py-2 text-sm')
  })

  it('applies object-form conditional classes (clsx semantics)', () => {
    expect(cn({ 'px-2': true, 'py-2': false, 'text-sm': true })).toBe('px-2 text-sm')
  })

  it('returns an empty string with no meaningful input', () => {
    expect(cn()).toBe('')
    expect(cn(false, null, undefined)).toBe('')
  })

  it('combines array, object, and conflict resolution together', () => {
    expect(cn(['p-2'], { 'p-4': true }, 'text-sm')).toBe('p-4 text-sm')
  })
})

describe('paletteClasses', () => {
  it('maps each known palette key to bg-<key>-bg / text-<key>-fg', () => {
    for (const key of PALETTE_KEYS) {
      expect(paletteClasses(key)).toEqual({
        bg: `bg-${key}-bg`,
        fg: `text-${key}-fg`,
      })
    }
  })

  it('returns peach classes for an unknown key', () => {
    expect(paletteClasses('lavender')).toEqual({
      bg: 'bg-peach-bg',
      fg: 'text-peach-fg',
    })
  })

  it('returns peach classes for an empty key', () => {
    expect(paletteClasses('')).toEqual({ bg: 'bg-peach-bg', fg: 'text-peach-fg' })
  })
})

describe('PALETTE_KEYS', () => {
  it('lists the six palette keys in order', () => {
    expect(PALETTE_KEYS).toEqual(['peach', 'slate', 'sage', 'terracotta', 'mauve', 'sand'])
  })
})

describe('CATEGORY_META', () => {
  it('has label / icon / tint for each entry', () => {
    for (const key of Object.keys(CATEGORY_META)) {
      const meta = CATEGORY_META[key]
      expect(typeof meta.label).toBe('string')
      expect(meta.label.length).toBeGreaterThan(0)
      expect(typeof meta.icon).toBe('string')
      expect(meta.tint).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })

  it('includes the expected known categories', () => {
    expect(CATEGORY_META.coffee).toEqual({ label: 'Coffee', icon: '☕', tint: '#a08060' })
    expect(CATEGORY_META.income.label).toBe('Income')
  })
})
