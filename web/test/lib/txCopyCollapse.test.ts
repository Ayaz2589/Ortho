// @vitest-environment jsdom
//
// Persistence for the "Copy from most common" collapsible category sections:
// which categories the user left collapsed is remembered across opens. Reads are
// defensive — corrupt or absent storage resolves to "everything open".
import { beforeEach, describe, expect, it } from 'vitest'
import { readCollapsedCategories, writeCollapsedCategories } from '@/lib/txCopyCollapse'

const KEY = 'ortho.txCopyCollapsed'

describe('txCopyCollapse persistence', () => {
  beforeEach(() => localStorage.clear())

  it('reads an empty set when nothing is stored', () => {
    expect(readCollapsedCategories().size).toBe(0)
  })

  it('round-trips a set of collapsed category slugs', () => {
    writeCollapsedCategories(new Set(['groceries', 'dining']))
    const read = readCollapsedCategories()
    expect(read.has('groceries')).toBe(true)
    expect(read.has('dining')).toBe(true)
    expect(read.size).toBe(2)
  })

  it('de-duplicates on write', () => {
    writeCollapsedCategories(['groceries', 'groceries'])
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual(['groceries'])
  })

  it('resolves to an empty set on corrupt JSON', () => {
    localStorage.setItem(KEY, '{not json')
    expect(readCollapsedCategories().size).toBe(0)
  })

  it('resolves to an empty set when the stored value is not an array', () => {
    localStorage.setItem(KEY, JSON.stringify({ groceries: true }))
    expect(readCollapsedCategories().size).toBe(0)
  })

  it('ignores non-string entries in a stored array', () => {
    localStorage.setItem(KEY, JSON.stringify(['groceries', 3, null, 'dining']))
    const read = readCollapsedCategories()
    expect([...read].sort()).toEqual(['dining', 'groceries'])
  })

  it('writing an empty set clears the remembered categories', () => {
    writeCollapsedCategories(['groceries'])
    writeCollapsedCategories(new Set())
    expect(readCollapsedCategories().size).toBe(0)
  })
})
