// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Drawer } from '@/components/web/Drawer'

describe('Drawer (shared slide-out panel)', () => {
  it('renders nothing when closed', () => {
    render(
      <Drawer open={false} onClose={() => {}} label="Test">
        <p>Body</p>
      </Drawer>
    )
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('renders a labelled modal dialog with its children when open', () => {
    render(
      <Drawer open onClose={() => {}} label="Property">
        <p>Detail content</p>
      </Drawer>
    )
    const dialog = screen.getByRole('dialog', { name: 'Property' })
    expect(dialog).toBeInTheDocument()
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByText('Detail content')).toBeInTheDocument()
  })

  it('locks body scroll while open and restores it on unmount', () => {
    const { unmount } = render(
      <Drawer open onClose={() => {}} label="X">
        <p>B</p>
      </Drawer>
    )
    expect(document.body.style.overflow).toBe('hidden')
    unmount()
    expect(document.body.style.overflow).toBe('')
  })

  it('closes on Escape and on scrim click', async () => {
    const onClose = vi.fn()
    render(
      <Drawer open onClose={onClose} label="X">
        <p>B</p>
      </Drawer>
    )
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)

    // The scrim is the aria-hidden overlay behind the panel.
    const scrim = document.querySelector('.ow-drawer-scrim') as HTMLElement
    await userEvent.click(scrim)
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})
