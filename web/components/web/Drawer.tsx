'use client'

import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useApp } from '@/lib/store'
import { useFocusTrap } from '@/lib/useFocusTrap'

/**
 * The shared right-side slide-out panel — the same affordance the Transactions
 * desktop view uses (`ow-drawer` + `ow-drawer-scrim`), promoted to a reusable
 * shell so Housing, Budgets, and Household share one master–detail pattern at
 * every width. Portals to <body>, dims + locks the background, slides in from
 * the right, and closes on scrim-click or Escape.
 */
export function Drawer({
  open,
  onClose,
  label,
  children,
}: {
  open: boolean
  onClose: () => void
  label: string
  children: ReactNode
}) {
  const trapRef = useFocusTrap<HTMLElement>(open)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    // Lock whichever element scrolls: <main> on desktop, <body> on mobile.
    // `main` has `scrollbar-gutter: stable`, so hiding its scrollbar doesn't shift.
    const main = document.querySelector('main') as HTMLElement | null
    const prevBody = document.body.style.overflow
    const prevMain = main?.style.overflow
    document.body.style.overflow = 'hidden'
    if (main) main.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevBody
      if (main) main.style.overflow = prevMain ?? ''
    }
  }, [open, onClose])

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <>
      <div className="ow-drawer-scrim" onClick={onClose} aria-hidden="true" />
      <aside ref={trapRef} tabIndex={-1} className="ow-drawer" role="dialog" aria-modal="true" aria-label={label}>
        {children}
      </aside>
    </>,
    document.body
  )
}

/** Standard drawer header: a close (X) chip on the left, centered title, optional right action. */
export function DrawerHeader({
  title,
  onClose,
  right,
}: {
  title: string
  onClose: () => void
  right?: ReactNode
}) {
  const { t } = useApp()
  return (
    <div
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        padding: '18px 20px 14px',
        borderBottom: '0.5px solid var(--hairline)',
        flexShrink: 0,
      }}
    >
      <button
        className="ow-btn ow-chip-btn"
        aria-label={t('Close')}
        onClick={onClose}
        style={{ width: 28, height: 28, zIndex: 1 }}
      >
        <svg width="11" height="11" viewBox="0 0 12 12">
          <path d="M2 2l8 8M10 2l-8 8" stroke="var(--text-2)" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          textAlign: 'center',
          fontSize: 15,
          fontWeight: 400,
          color: 'var(--text)',
          letterSpacing: '-0.3px',
          pointerEvents: 'none',
        }}
      >
        {title}
      </div>
      {right ? <div style={{ marginLeft: 'auto', zIndex: 1 }}>{right}</div> : null}
    </div>
  )
}
