// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { WIDGETS, getWidget } from '@/lib/widgets/registry'

// Spec 034 (+ spec 037): the registry is the single source of truth. These
// invariants keep it safe to persist by id. Every widget renders at the same
// height on a uniform grid, so there is no per-widget size to validate.

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

  it('getWidget finds by id and returns undefined for unknown', () => {
    expect(getWidget(WIDGETS[0].id)?.id).toBe(WIDGETS[0].id)
    expect(getWidget('nope')).toBeUndefined()
  })
})
