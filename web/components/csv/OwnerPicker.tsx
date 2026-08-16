'use client'
// Inline owner picker for a CSV import row: an owner avatar that sits in the
// bottom-right corner of the category tile (matching the ledger's TransactionRow)
// and, on tap, opens a small member-toggle popover so owners can be assigned
// without opening the full per-row editor. The popover is portalled to
// `document.body` and positioned `fixed` so it escapes the scrolling import tray.
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check } from 'lucide-react'
import { Avatar, StackedAvatars } from '@/components/ui'
import type { User } from '@/lib/types'

const POP_W = 220

export function OwnerPicker({
  ownerIds,
  members,
  resolveUser,
  onChange,
  paidById = null,
  onChangePayer,
}: {
  ownerIds: string[]
  members: User[]
  resolveUser: (id: string) => User
  onChange: (ownerIds: string[]) => void
  /** spec 053 — who fronted the money. `undefined` onChangePayer hides the section
   *  (income has no payer, and a one-person household has nothing to choose). */
  paidById?: string | null
  onChangePayer?: (personId: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLDivElement>(null)

  const owners = useMemo(() => ownerIds.map(resolveUser), [ownerIds, resolveUser])
  const label = owners.length > 0 ? owners.map((u) => u.name).join(', ') : 'Unassigned'

  // Anchor the popover to the trigger; track it through scroll/resize of the tray.
  useEffect(() => {
    if (!open) return
    const reposition = () => {
      const el = triggerRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const gap = 6
      const estH = 44 + members.length * 40
      const vw = window.innerWidth
      const vh = window.innerHeight
      const left = Math.max(8, Math.min(r.right - POP_W, vw - POP_W - 8))
      let top = r.bottom + gap
      if (top + estH > vh && r.top - gap - estH >= 8) top = r.top - gap - estH
      setCoords({ top, left })
    }
    reposition()
    window.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)
    return () => {
      window.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', reposition)
    }
  }, [open, members.length])

  // Dismiss on Esc / outside click. Esc is captured + stopped so the host Drawer's
  // own Escape handler doesn't also step back to the list.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setOpen(false)
      }
    }
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (popRef.current?.contains(target) || triggerRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('keydown', onKey, true)
    document.addEventListener('mousedown', onDown, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      document.removeEventListener('mousedown', onDown, true)
    }
  }, [open])

  // Keep at least one owner: the last one can't be toggled off.
  const toggle = (id: string) => {
    if (ownerIds.includes(id)) {
      if (ownerIds.length > 1) onChange(ownerIds.filter((x) => x !== id))
    } else {
      onChange([...ownerIds, id])
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={`Owner: ${label}. Tap to change.`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          // Don't let the tap bubble to the row (which opens the full editor).
          e.stopPropagation()
          setOpen((o) => !o)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') e.stopPropagation()
        }}
        className="ow-btn"
        style={{ padding: 0, borderRadius: 999, lineHeight: 0 }}
      >
        <span
          className="rounded-full"
          style={{ display: 'block', boxShadow: '0 0 0 2px var(--bg)', borderRadius: 999 }}
        >
          {owners.length <= 1 ? (
            <Avatar user={owners[0] ?? resolveUser('')} size={20} />
          ) : (
            <StackedAvatars users={owners} size={18} ring="var(--bg)" />
          )}
        </span>
      </button>

      {open && coords && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={popRef}
              role="menu"
              aria-label="Assign owners"
              onClick={(e) => e.stopPropagation()}
              style={{
                position: 'fixed',
                top: coords.top,
                left: coords.left,
                width: POP_W,
                zIndex: 1000,
                background: 'var(--surface)',
                border: '0.5px solid var(--hairline)',
                borderRadius: 14,
                boxShadow: 'var(--shadow-sheet)',
                padding: 6,
              }}
            >
              <div
                style={{
                  padding: '4px 10px 6px',
                  fontSize: 11.5,
                  fontWeight: 400,
                  letterSpacing: '0.4px',
                  textTransform: 'uppercase',
                  color: 'var(--text-3)',
                }}
              >
                Owners
              </div>
              {members.map((u) => {
                const on = ownerIds.includes(u.id)
                return (
                  <button
                    key={u.id}
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={on}
                    className="ow-btn"
                    onClick={() => toggle(u.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: 9,
                      textAlign: 'left',
                    }}
                  >
                    <Avatar user={u} size={24} />
                    <span style={{ flex: 1, fontSize: 14, color: 'var(--text)' }}>{u.name}</span>
                    {on && <Check size={16} style={{ color: 'var(--accent)' }} strokeWidth={2.4} />}
                  </button>
                )
              })}

              {/* spec 053 — who fronted the money. Single-select, and only rendered when the
                  caller supplies a handler: income has no payer, and a one-person household
                  has nothing to choose. Without this an imported statement is invisible to
                  the balance engine however carefully its owners are set. */}
              {onChangePayer && members.length > 1 && (
                <>
                  <div
                    style={{
                      marginTop: 4,
                      paddingTop: 6,
                      borderTop: '0.5px solid var(--hairline)',
                      padding: '10px 10px 6px',
                      fontSize: 11.5,
                      fontWeight: 400,
                      letterSpacing: '0.4px',
                      textTransform: 'uppercase',
                      color: 'var(--text-3)',
                    }}
                  >
                    Paid by
                  </div>
                  {members.map((u) => {
                    const on = u.id === paidById
                    return (
                      <button
                        key={`payer-${u.id}`}
                        type="button"
                        role="menuitemradio"
                        aria-checked={on}
                        aria-label={`Paid by ${u.name}`}
                        className="ow-btn"
                        onClick={() => onChangePayer(u.id)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          width: '100%',
                          padding: '8px 10px',
                          borderRadius: 9,
                          textAlign: 'left',
                        }}
                      >
                        <Avatar user={u} size={24} />
                        <span style={{ flex: 1, fontSize: 14, color: 'var(--text)' }}>{u.name}</span>
                        {on && <Check size={16} style={{ color: 'var(--accent)' }} strokeWidth={2.4} />}
                      </button>
                    )
                  })}
                </>
              )}
            </div>,
            document.body
          )
        : null}
    </>
  )
}
