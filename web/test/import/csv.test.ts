import { describe, it, expect } from 'vitest'
import { parseCsv, parseCsvLine } from '../../scripts/import/engine/csv'

describe('parseCsvLine', () => {
  it('splits simple comma-separated fields', () => {
    expect(parseCsvLine('a,b,c')).toEqual(['a', 'b', 'c'])
  })
  it('keeps commas inside quoted fields', () => {
    expect(parseCsvLine('a,"b, still b",c')).toEqual(['a', 'b, still b', 'c'])
  })
  it('unescapes doubled quotes inside a quoted field', () => {
    expect(parseCsvLine('"he said ""hi""",x')).toEqual(['he said "hi"', 'x'])
  })
  it('keeps a trailing empty field (e.g. an empty Memo)', () => {
    expect(parseCsvLine('a,b,')).toEqual(['a', 'b', ''])
  })
})

describe('parseCsv', () => {
  it('parses rows and skips blank lines', () => {
    expect(parseCsv('h1,h2\n1,2\n\n3,4\n')).toEqual([
      ['h1', 'h2'],
      ['1', '2'],
      ['3', '4'],
    ])
  })
})
