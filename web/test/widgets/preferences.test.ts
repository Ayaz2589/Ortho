// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import {
  readWidgetPrefs,
  writeWidgetPrefs,
  isWidgetEnabled,
  enabledWidgets,
  setWidgetEnabled,
  WIDGETS_STORAGE_KEY,
  type WidgetPrefs,
} from '@/lib/widgets/preferences'
import { WIDGETS, type WidgetDefinition } from '@/lib/widgets/registry'

// Spec 034: widget on/off is a per-browser preference persisted under
// `ortho.widgets`, following the defensive read/write convention of lib/flags.ts
// and lib/skeletonCounts.ts. Reads never throw; corrupt/missing storage yields the
// declared defaults (FR-007).

const def = (over: Partial<WidgetDefinition>): WidgetDefinition => ({
  id: 'x',
  title: 'X',
  description: 'x',
  defaultEnabled: true,
  Body: () => null,
  ...over,
})

beforeEach(() => {
  localStorage.clear()
})

describe('readWidgetPrefs', () => {
  it('returns {} when nothing is stored', () => {
    expect(readWidgetPrefs()).toEqual({})
  })

  it('returns {} for corrupt JSON', () => {
    localStorage.setItem(WIDGETS_STORAGE_KEY, 'not json {')
    expect(readWidgetPrefs()).toEqual({})
  })

  it('returns {} for a non-object (array) value', () => {
    localStorage.setItem(WIDGETS_STORAGE_KEY, JSON.stringify([1, 2, 3]))
    expect(readWidgetPrefs()).toEqual({})
  })

  it('returns {} for a scalar value', () => {
    localStorage.setItem(WIDGETS_STORAGE_KEY, JSON.stringify(5))
    expect(readWidgetPrefs()).toEqual({})
  })

  it('keeps only boolean-valued keys', () => {
    localStorage.setItem(
      WIDGETS_STORAGE_KEY,
      JSON.stringify({ a: true, b: false, c: 'yes', d: 1 })
    )
    expect(readWidgetPrefs()).toEqual({ a: true, b: false })
  })
})

describe('writeWidgetPrefs', () => {
  it('round-trips through storage', () => {
    const prefs: WidgetPrefs = { 'net-summary': false, goals: true }
    writeWidgetPrefs(prefs)
    expect(readWidgetPrefs()).toEqual(prefs)
  })
})

describe('isWidgetEnabled', () => {
  it('uses the declared default when nothing is stored', () => {
    expect(isWidgetEnabled(def({ defaultEnabled: true }), {})).toBe(true)
    expect(isWidgetEnabled(def({ defaultEnabled: false }), {})).toBe(false)
  })

  it('lets a stored value override the default in both directions', () => {
    expect(isWidgetEnabled(def({ id: 'x', defaultEnabled: true }), { x: false })).toBe(false)
    expect(isWidgetEnabled(def({ id: 'x', defaultEnabled: false }), { x: true })).toBe(true)
  })
})

describe('enabledWidgets', () => {
  it('with no prefs returns exactly the default-enabled widgets, in registry order', () => {
    const expected = WIDGETS.filter((w) => w.defaultEnabled).map((w) => w.id)
    expect(enabledWidgets({}).map((w) => w.id)).toEqual(expected)
  })

  it('respects stored toggles', () => {
    const first = WIDGETS[0]
    const off = enabledWidgets({ [first.id]: false })
    expect(off.map((w) => w.id)).not.toContain(first.id)
  })

  it('ignores unknown stored ids', () => {
    const result = enabledWidgets({ 'no-such-widget': true })
    expect(result.every((w) => w.id !== 'no-such-widget')).toBe(true)
  })
})

describe('setWidgetEnabled', () => {
  it('merges one toggle, persists it, and returns the next prefs', () => {
    const next = setWidgetEnabled('goals', false, { 'net-summary': true })
    expect(next).toEqual({ 'net-summary': true, goals: false })
    expect(readWidgetPrefs()).toEqual({ 'net-summary': true, goals: false })
  })
})
