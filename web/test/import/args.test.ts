import { describe, it, expect } from 'vitest'
import { parseFlags, flagStr } from '../../scripts/import/engine/args'

describe('parseFlags', () => {
  it('parses --key value pairs', () => {
    expect(parseFlags(['--month', '2026-05', '--limit', '10'])).toEqual({ month: '2026-05', limit: '10' })
  })
  it('treats a bare --flag (or one before another --flag) as boolean true', () => {
    expect(parseFlags(['--dry-run', '--admin'])).toEqual({ 'dry-run': true, admin: true })
    expect(parseFlags(['--admin'])).toEqual({ admin: true })
  })
  it('keeps values with spaces and ignores non-flag tokens', () => {
    expect(parseFlags(['list', '--source', 'TD Bank'])).toEqual({ source: 'TD Bank' })
  })
  it('returns empty for no flags', () => {
    expect(parseFlags([])).toEqual({})
  })
})

describe('flagStr', () => {
  it('returns the string value, else undefined for boolean/absent', () => {
    expect(flagStr('x')).toBe('x')
    expect(flagStr(true)).toBeUndefined()
    expect(flagStr(undefined)).toBeUndefined()
  })
})
