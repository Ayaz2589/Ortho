'use client'

import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * Centered desktop dialog — ported from the handoff (Shell.jsx WebModal).
 * ONE save action lives in the header (Cancel · title · Save); no duplicated
 * footer button. Esc and scrim-click close.
 */
export function WebModal({
  title,
  onClose,
  onSave,
  canSave = true,
  saveLabel = 'Save',
  hideHeader = false,
  children,
}: {
  title: string
  onClose: () => void
  onSave?: () => void
  canSave?: boolean
  saveLabel?: string
  hideHeader?: boolean
  children: ReactNode
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', h)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', h)
      document.body.style.overflow = ''
    }
  }, [onClose])

  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      className="ow-scrim"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="ow-modal" role="dialog" aria-modal="true" aria-label={title}>
        {!hideHeader && (
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', padding: '18px 20px 14px', flexShrink: 0 }}>
          <button
            className="ow-btn"
            onClick={onClose}
            style={{ fontSize: 15, fontWeight: 400, color: 'var(--accent)', letterSpacing: '-0.2px', padding: 0, zIndex: 1 }}
          >
            Cancel
          </button>
          <div style={{ position: 'absolute', left: 0, right: 0, textAlign: 'center', fontSize: 16, fontWeight: 400, color: 'var(--text)', letterSpacing: '-0.3px', pointerEvents: 'none' }}>
            {title}
          </div>
          <div style={{ marginLeft: 'auto', zIndex: 1 }}>
            {onSave && (
              <button
                className="ow-btn"
                onClick={onSave}
                disabled={!canSave}
                style={{ fontSize: 15, fontWeight: 400, letterSpacing: '-0.2px', padding: 0, color: canSave ? 'var(--accent)' : 'var(--text-3)', cursor: canSave ? 'pointer' : 'default' }}
              >
                {saveLabel}
              </button>
            )}
          </div>
        </div>
        )}
        <div style={{ overflow: 'auto', paddingBottom: 8 }}>{children}</div>
      </div>
    </div>,
    document.body
  )
}
