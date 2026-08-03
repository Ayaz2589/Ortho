// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { WIDGETS, WIDGET_SIZES, getWidget } from '@/lib/widgets/registry'

// Spec 034: the registry is the single source of truth. These invariants keep it
// safe to persist by id and guarantee the shipped set exercises the height tiers
// (so the board's packing is genuinely tested). `wide` remains a supported size in
// the vocabulary but is intentionally unused since spec 036 (activity moved to lg).

describe('widget registry', () => {
  it('is non-empty', () => {
    expect(WIDGETS.length).toBeGreaterThan(0)
  })

  it('has unique, kebab-case ids', () => {
    const ids = WIDGETS.map((w) => w.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
  })

  it('has non-empty titles and descriptions and a component Body', () => {
    for (const w of WIDGETS) {
      expect(w.title.trim().length).toBeGreaterThan(0)
      expect(w.description.trim().length).toBeGreaterThan(0)
      expect(typeof w.Body).toBe('function')
    }
  })

  it('uses a valid size from the vocabulary', () => {
    for (const w of WIDGETS) expect(WIDGET_SIZES).toContain(w.size)
  })

  it('exercises the shipped height tiers (sm/md/lg)', () => {
    const used = new Set(WIDGETS.map((w) => w.size))
    for (const size of ['sm', 'md', 'lg'] as const) expect(used).toContain(size)
  })

  it('getWidget finds by id and returns undefined for unknown', () => {
    expect(getWidget(WIDGETS[0].id)?.id).toBe(WIDGETS[0].id)
    expect(getWidget('nope')).toBeUndefined()
  })
})
