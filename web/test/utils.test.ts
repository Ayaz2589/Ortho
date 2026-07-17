import { describe, it, expect } from 'vitest'
import { cn } from '@/lib/utils'

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
