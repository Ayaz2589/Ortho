// @vitest-environment jsdom
//
// Spec 040: Settings → Text size lists the four sizes; selecting one rescales the
// whole app immediately and persists per device. Mirrors the appearance picker.
// FR-005/006/007. Active row is signalled by ChoiceRow's trailing accent check.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TextSizePage from '@/app/(app)/settings/text-size/page'
import { readTextSize } from '@/components/settings/textSize'

vi.mock('@/lib/store', () => ({ useApp: () => ({ t: (k: string) => k }) }))

const LABELS = ['Small', 'Medium', 'Large', 'X-Large'] as const

/** ChoiceRow renders the trailing check with `text-accent`; the leading tile uses
 *  `text-text-2`, so `.text-accent` inside a row uniquely marks it active. */
const isActive = (btn: HTMLElement) => btn.querySelector('.text-accent') != null

function resetRoot() {
  const r = document.documentElement
  r.style.removeProperty('zoom')
  r.removeAttribute('data-text-size')
}

beforeEach(() => {
  localStorage.clear()
  resetRoot()
})
afterEach(cleanup)

describe('Text size settings page', () => {
  it('renders the four size options', () => {
    render(<TextSizePage />)
    for (const label of LABELS) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy()
    }
  })

  it('applies and marks the default (Medium) active when nothing is stored', async () => {
    render(<TextSizePage />)
    await waitFor(() => {
      expect(document.documentElement.getAttribute('data-text-size')).toBe('medium')
    })
    expect(isActive(screen.getByRole('button', { name: 'Medium' }))).toBe(true)
    expect(isActive(screen.getByRole('button', { name: 'Small' }))).toBe(false)
  })

  it('selecting a size persists it and applies it live', async () => {
    render(<TextSizePage />)
    await userEvent.click(screen.getByRole('button', { name: 'Large' }))

    await waitFor(() => expect(readTextSize()).toBe('large'))
    expect(document.documentElement.getAttribute('data-text-size')).toBe('large')
    expect(document.documentElement.style.getPropertyValue('zoom')).toBe('1.14')
    expect(isActive(screen.getByRole('button', { name: 'Large' }))).toBe(true)
    expect(isActive(screen.getByRole('button', { name: 'Medium' }))).toBe(false)
  })

  it('reflects an existing stored preference on mount', async () => {
    localStorage.setItem('textSize', 'xlarge')
    render(<TextSizePage />)
    await waitFor(() => {
      expect(isActive(screen.getByRole('button', { name: 'X-Large' }))).toBe(true)
    })
    expect(document.documentElement.getAttribute('data-text-size')).toBe('xlarge')
  })
})
