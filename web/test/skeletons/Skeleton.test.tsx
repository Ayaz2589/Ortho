// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { Skeleton, SkeletonText } from '@/components/ui/Skeleton'

describe('Skeleton primitive', () => {
  it('fills with the adaptive token, never a hardcoded color', () => {
    const { container } = render(<Skeleton />)
    const el = container.firstElementChild as HTMLElement
    // jsdom preserves the raw inline value for CSS custom-property functions.
    expect(el.style.background).toBe('var(--chip-bg)')
  })

  it('is motionless — no shimmer/pulse animation or gradient (constitution IV)', () => {
    const { container } = render(<Skeleton className="my-2" />)
    const el = container.firstElementChild as HTMLElement
    expect(el.className).not.toMatch(/animate-pulse|animate-|shimmer/)
    expect(el.style.background).not.toMatch(/gradient/)
    expect(el.style.animation ?? '').toBe('')
  })

  it('is decorative and non-interactive (aria-hidden, not a control)', () => {
    const { container } = render(<Skeleton />)
    const el = container.firstElementChild as HTMLElement
    expect(el.getAttribute('aria-hidden')).toBe('true')
    expect(el.tagName).not.toBe('BUTTON')
    expect(el.tagName).not.toBe('A')
    expect(el.getAttribute('tabindex')).toBeNull()
  })

  it('honors width / height / radius props', () => {
    const { container } = render(<Skeleton width={120} height={16} radius="full" />)
    const el = container.firstElementChild as HTMLElement
    expect(el.style.width).toBe('120px')
    expect(el.style.height).toBe('16px')
    // 'full' → a large pill radius
    expect(parseInt(el.style.borderRadius, 10)).toBeGreaterThanOrEqual(999)
  })

  it('SkeletonText renders the requested number of lines', () => {
    const { container } = render(<SkeletonText lines={4} />)
    // 4 line blocks, all aria-hidden
    const blocks = container.querySelectorAll('[aria-hidden="true"]')
    // wrapper is aria-hidden too; assert at least the 4 line children exist
    expect(blocks.length).toBeGreaterThanOrEqual(4)
  })
})
