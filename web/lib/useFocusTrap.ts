'use client'

import { useEffect, useRef } from 'react'

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

/**
 * Modal focus management for a dialog/drawer. While `active`:
 *  - moves focus into the panel on open (unless something inside already has it,
 *    so an `autoFocus` field wins),
 *  - keeps Tab / Shift+Tab cycling within the panel (no escaping to the page
 *    behind the scrim),
 *  - restores focus to the previously-focused element (the trigger) on close.
 *
 * Attach the returned ref to the dialog container, which must be focusable
 * (`tabIndex={-1}`) so it can hold focus when it has no focusable children.
 */
export function useFocusTrap<T extends HTMLElement = HTMLElement>(active: boolean) {
  const ref = useRef<T>(null)
  useEffect(() => {
    if (!active) return
    const node = ref.current
    if (!node) return
    const previouslyFocused = document.activeElement as HTMLElement | null

    const focusable = () =>
      Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true'
      )

    if (!node.contains(document.activeElement)) {
      ;(focusable()[0] ?? node).focus()
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const items = focusable()
      if (items.length === 0) {
        e.preventDefault()
        node.focus()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      const activeEl = document.activeElement
      if (e.shiftKey) {
        if (activeEl === first || !node.contains(activeEl)) {
          e.preventDefault()
          last.focus()
        }
      } else if (activeEl === last || !node.contains(activeEl)) {
        e.preventDefault()
        first.focus()
      }
    }

    node.addEventListener('keydown', onKeyDown)
    return () => {
      node.removeEventListener('keydown', onKeyDown)
      // Restore focus to the trigger if it is still in the document.
      if (previouslyFocused && document.contains(previouslyFocused)) {
        previouslyFocused.focus()
      }
    }
  }, [active])
  return ref
}
