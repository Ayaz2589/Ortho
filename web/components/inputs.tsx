'use client'

import { useEffect, useMemo, useRef, useState, type InputHTMLAttributes } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { useApp } from '@/lib/store'
import { currencySymbol, type CurrencyKey } from '@/lib/finance/currency'
import { toUSDCents } from '@/lib/finance/money'
import { mediumDate, monthYearLong } from '@/lib/format'

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={
        'w-full bg-transparent text-right text-[15px] text-text outline-none placeholder:text-text-3 ' +
        (props.className ?? '')
      }
    />
  )
}

/** Amount entry in the user's display currency. Value is the raw string. */
export function MoneyInput({
  value,
  onChange,
  placeholder,
  autoFocus,
  big,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  autoFocus?: boolean
  big?: boolean
}) {
  const { currency } = useApp()
  return (
    <div className="flex items-center gap-1">
      <span className={big ? 'text-[40px] font-light text-text-2' : 'text-[15px] text-text-2'}>
        {currencySymbol(currency)}
      </span>
      <input
        inputMode="decimal"
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9.,]/g, ''))}
        placeholder={placeholder ?? '0.00'}
        className={
          big
            ? 'w-full bg-transparent text-[40px] font-light text-text outline-none placeholder:text-text-3'
            : 'w-28 bg-transparent text-right text-[15px] text-text outline-none placeholder:text-text-3'
        }
      />
    </div>
  )
}

/** Parse the display-currency string back to USD cents. Returns null if empty/invalid. */
export function parseMoney(raw: string, currency: CurrencyKey, rate: number): number | null {
  const cleaned = raw.replace(/[,\s]/g, '')
  if (cleaned === '') return null
  const value = parseFloat(cleaned)
  if (isNaN(value)) return null
  return toUSDCents(value, currency, rate)
}

// ---- DatePicker ---------------------------------------------------------------

const pad2 = (n: number) => String(n).padStart(2, '0')

/** Local-date ISO (YYYY-MM-DD) — avoids the UTC shift of `toISOString().slice(0,10)`. */
function dateToISO(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/** Parse a YYYY-MM-DD string as a *local* date (no timezone shift). */
function isoToDate(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return isNaN(d.getTime()) ? null : d
}

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

const POPOVER_W = 268

const navBtnStyle = {
  width: 28,
  height: 28,
  borderRadius: 8,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  transition: 'background var(--duration-fast) var(--ease-out)',
} as const

/**
 * Calm, brand-styled date field. Renders a text trigger ("Jun 12, 2026 ▾") that
 * opens a calendar popover anchored to the field. The popover is portalled to
 * `document.body` and positioned `fixed` so it escapes the `overflow:hidden`
 * cards / modals it lives inside. Value + onChange are local-date ISO strings
 * (YYYY-MM-DD), matching every existing date field in the app.
 */
export function DatePicker({
  value,
  onChange,
  ariaLabel = 'Choose date',
}: {
  value: string
  onChange: (iso: string) => void
  ariaLabel?: string
}) {
  const { locale } = useApp()
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLDivElement>(null)

  const selected = useMemo(() => isoToDate(value), [value])
  const today = useMemo(() => new Date(), [])
  const [view, setView] = useState<Date>(() => {
    const base = isoToDate(value) ?? new Date()
    return new Date(base.getFullYear(), base.getMonth(), 1)
  })

  // Anchor the popover to the trigger; re-runs on open and on scroll/resize so
  // it tracks the field even inside a scrolling modal body.
  useEffect(() => {
    if (!open) return
    const reposition = () => {
      const el = triggerRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const gap = 6
      const estH = 340
      const vw = window.innerWidth
      const vh = window.innerHeight
      let left = Math.max(8, Math.min(r.right - POPOVER_W, vw - POPOVER_W - 8))
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
  }, [open])

  // Dismiss on Esc / outside click. Esc is captured + stopped so a host Modal's
  // own Escape handler doesn't also fire (close popover first, not the modal).
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setOpen(false)
      }
    }
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (popRef.current?.contains(t) || triggerRef.current?.contains(t)) return
      setOpen(false)
    }
    document.addEventListener('keydown', onKey, true)
    document.addEventListener('mousedown', onDown, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      document.removeEventListener('mousedown', onDown, true)
    }
  }, [open])

  const openPicker = () => {
    const base = selected ?? new Date()
    setView(new Date(base.getFullYear(), base.getMonth(), 1))
    setOpen(true)
  }

  // Sun→Sat short labels for the current locale (Aug 1 2021 was a Sunday).
  const weekdays = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(locale, { weekday: 'short' })
    return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2021, 7, 1 + i)).slice(0, 2))
  }, [locale])

  const cells = useMemo(() => {
    const y = view.getFullYear()
    const m = view.getMonth()
    const offset = new Date(y, m, 1).getDay()
    const count = new Date(y, m + 1, 0).getDate()
    const out: (Date | null)[] = []
    for (let i = 0; i < offset; i++) out.push(null)
    for (let d = 1; d <= count; d++) out.push(new Date(y, m, d))
    return out
  }, [view])

  const pick = (d: Date) => {
    onChange(dateToISO(d))
    setOpen(false)
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : openPicker())}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          appearance: 'none',
          border: 0,
          background: 'transparent',
          cursor: 'pointer',
          fontFamily: 'inherit',
          fontSize: 15,
          fontWeight: 400,
          color: selected ? 'var(--text)' : 'var(--text-3)',
          letterSpacing: '-0.2px',
          fontVariantNumeric: 'tabular-nums',
          padding: 0,
        }}
      >
        {selected ? mediumDate(selected, locale) : 'Select date'}
        <ChevronDown size={14} style={{ color: 'var(--text-3)' }} />
      </button>

      {open && coords && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={popRef}
              role="dialog"
              aria-label={ariaLabel}
              style={{
                position: 'fixed',
                top: coords.top,
                left: coords.left,
                width: POPOVER_W,
                zIndex: 1000,
                background: 'var(--surface)',
                border: '0.5px solid var(--hairline)',
                borderRadius: 14,
                boxShadow: 'var(--shadow-sheet)',
                padding: 10,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '2px 2px 8px' }}>
                <button
                  className="ow-btn ow-chip-btn"
                  aria-label="Previous month"
                  onClick={() => setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))}
                  style={navBtnStyle}
                >
                  <ChevronLeft size={16} style={{ color: 'var(--text-2)' }} />
                </button>
                <span style={{ fontSize: 14, fontWeight: 400, letterSpacing: '-0.2px', color: 'var(--text)' }}>
                  {monthYearLong(view, locale)}
                </span>
                <button
                  className="ow-btn ow-chip-btn"
                  aria-label="Next month"
                  onClick={() => setView(new Date(view.getFullYear(), view.getMonth() + 1, 1))}
                  style={navBtnStyle}
                >
                  <ChevronRight size={16} style={{ color: 'var(--text-2)' }} />
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 2 }}>
                {weekdays.map((w, i) => (
                  <div key={i} style={{ textAlign: 'center', fontSize: 11, fontWeight: 400, color: 'var(--text-3)', padding: '4px 0' }}>
                    {w}
                  </div>
                ))}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
                {cells.map((d, i) => {
                  if (!d) return <div key={i} />
                  const isSel = selected ? sameDay(d, selected) : false
                  const isToday = sameDay(d, today)
                  return (
                    <div key={i} style={{ display: 'flex', justifyContent: 'center', padding: '2px 0' }}>
                      <button
                        className="ow-btn"
                        onClick={() => pick(d)}
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 8,
                          fontSize: 13.5,
                          fontVariantNumeric: 'tabular-nums',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          background: isSel ? 'var(--text)' : 'transparent',
                          color: isSel ? 'var(--bg)' : 'var(--text)',
                          fontWeight: 400,
                          boxShadow: !isSel && isToday ? 'inset 0 0 0 1.5px var(--hairline)' : 'none',
                          transition: 'background var(--duration-fast) var(--ease-out)',
                        }}
                        onMouseEnter={(e) => {
                          if (!isSel) e.currentTarget.style.background = 'var(--chip-bg)'
                        }}
                        onMouseLeave={(e) => {
                          if (!isSel) e.currentTarget.style.background = 'transparent'
                        }}
                      >
                        {d.getDate()}
                      </button>
                    </div>
                  )
                })}
              </div>

              <div style={{ display: 'flex', justifyContent: 'center', borderTop: '0.5px solid var(--hairline)', marginTop: 6, paddingTop: 8 }}>
                <button
                  className="ow-btn"
                  onClick={() => pick(new Date())}
                  style={{ fontSize: 13, fontWeight: 400, color: 'var(--accent)', padding: '2px 8px' }}
                >
                  Today
                </button>
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  )
}
