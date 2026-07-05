// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { useState } from 'react'
import { render, fireEvent, screen } from '@testing-library/react'
import { useFocusTrap } from '@/lib/useFocusTrap'

function Dialog() {
  const ref = useFocusTrap<HTMLDivElement>(true)
  return (
    <div ref={ref} tabIndex={-1} role="dialog">
      <button>first</button>
      <button>middle</button>
      <button>last</button>
    </div>
  )
}

function Harness() {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <button onClick={() => setOpen(true)}>trigger</button>
      {open && <Dialog />}
      <button onClick={() => setOpen(false)}>closer</button>
    </div>
  )
}

describe('useFocusTrap', () => {
  it('moves focus into the panel on open', () => {
    render(<Harness />)
    const trigger = screen.getByText('trigger')
    trigger.focus()
    fireEvent.click(trigger)
    expect(document.activeElement).toBe(screen.getByText('first'))
  })

  it('cycles Tab / Shift+Tab within the panel', () => {
    render(<Harness />)
    fireEvent.click(screen.getByText('trigger'))

    // Tab off the last element wraps to the first.
    screen.getByText('last').focus()
    fireEvent.keyDown(screen.getByText('last'), { key: 'Tab' })
    expect(document.activeElement).toBe(screen.getByText('first'))

    // Shift+Tab off the first element wraps to the last.
    screen.getByText('first').focus()
    fireEvent.keyDown(screen.getByText('first'), { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(screen.getByText('last'))
  })

  it('restores focus to the trigger on close', () => {
    render(<Harness />)
    const trigger = screen.getByText('trigger')
    trigger.focus()
    fireEvent.click(trigger)
    expect(document.activeElement).not.toBe(trigger)
    fireEvent.click(screen.getByText('closer')) // unmounts the dialog
    expect(document.activeElement).toBe(trigger)
  })
})
