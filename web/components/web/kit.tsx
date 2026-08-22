'use client'

import { type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { useApp } from '@/lib/store'
import { categoryMeta } from '@/lib/categories'
import type { TransactionCategory } from '@/lib/types'

// Shared desktop (≥1024px) chrome ported from the design handoff (Shell.jsx).

/** Label-on-left / control-on-right form row used inside drawer/modal cards
 *  (the New/Edit transaction form and the CSV import editor). `first` drops the
 *  top hairline for the first row in a card. */
export function FormRow({ label, children, first = false }: { label: string; children: ReactNode; first?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 20px', minHeight: 50, borderTop: first ? 'none' : '0.5px solid var(--hairline)' }}>
      <div style={{ flex: '0 0 100px', fontSize: 14, color: 'var(--text-2)', letterSpacing: '-0.1px' }}>{label}</div>
      <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 400, color: 'var(--text)' }}>
        {children}
      </div>
    </div>
  )
}

/**
 * A `FormRow`-shaped disclosure row: collapsed, it looks exactly like a
 * `FormRow` (label on the left, `value` on the right) but with a chevron that
 * rotates when open. Open, it reveals `children` below inside the SAME card, so
 * the card simply grows taller in place — no popover, no native dropdown. Used
 * by the tx form for the category and date pickers. Only the header is a button;
 * the expanded panel is plain flow content, so nested buttons/inputs work.
 */
export function AccordionRow({
  label,
  value,
  open,
  onToggle,
  children,
  first = false,
  ariaLabel,
}: {
  label: string
  value: ReactNode
  open: boolean
  onToggle: () => void
  children: ReactNode
  first?: boolean
  ariaLabel?: string
}) {
  return (
    <div style={{ borderTop: first ? 'none' : '0.5px solid var(--hairline)' }}>
      <button
        type="button"
        className="ow-btn"
        onClick={onToggle}
        aria-expanded={open}
        aria-label={ariaLabel}
        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 20px', minHeight: 50, width: '100%', textAlign: 'left' }}
      >
        <div style={{ flex: '0 0 100px', fontSize: 14, color: 'var(--text-2)', letterSpacing: '-0.1px' }}>{label}</div>
        <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 400, color: 'var(--text)' }}>
          {value}
          <ChevronDown
            size={14}
            style={{
              color: 'var(--text-3)',
              flexShrink: 0,
              transition: 'transform var(--duration-mid) var(--ease-out)',
              transform: open ? 'rotate(180deg)' : undefined,
            }}
          />
        </div>
      </button>
      {open && <div style={{ padding: '0 12px 12px' }}>{children}</div>}
    </div>
  )
}

export function WebPageHeader({
  title,
  sub,
  actions,
}: {
  title: string
  sub?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 24 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <h1
          style={{
            margin: 0,
            fontSize: 34,
            fontWeight: 300,
            letterSpacing: '-0.6px',
            lineHeight: 1.1,
            color: 'var(--text)',
          }}
        >
          {title}
        </h1>
        {sub && (
          <div style={{ fontSize: 14, color: 'var(--text-2)', marginTop: 6, letterSpacing: '-0.1px' }}>
            {sub}
          </div>
        )}
      </div>
      {actions && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 6 }}>{actions}</div>
      )}
    </div>
  )
}

export function Seg<T extends string>({
  value,
  onChange,
  options,
  size = 'md',
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
  size?: 'sm' | 'md'
}) {
  const pad = size === 'sm' ? '4px 12px' : '6px 16px'
  return (
    <div
      role="tablist"
      style={{ display: 'inline-flex', gap: 2, padding: 3, background: 'var(--chip-bg)', borderRadius: 9 }}
    >
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            className="ow-btn"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            style={{
              padding: pad,
              borderRadius: 7,
              fontSize: 13,
              fontWeight: 400,
              letterSpacing: '-0.1px',
              background: active ? 'var(--surface)' : 'transparent',
              color: active ? 'var(--text)' : 'var(--text-2)',
              boxShadow: active ? '0 0 0 0.5px var(--hairline), 0 1px 2px rgba(0,0,0,0.05)' : 'none',
            }}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

export function PlusGlyph({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <path d="M8 3v10M3 8h10" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

export function ChipIconButton({
  label,
  onClick,
  disabled = false,
  children,
}: {
  label: string
  onClick?: () => void
  disabled?: boolean
  children: ReactNode
}) {
  return (
    <button
      className="ow-btn ow-chip-btn"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      style={disabled ? { opacity: 0.4, cursor: 'default' } : undefined}
    >
      {children}
    </button>
  )
}

export function AccentTextButton({ onClick, children }: { onClick?: () => void; children: ReactNode }) {
  return (
    <button
      className="ow-btn"
      onClick={onClick}
      style={{ fontSize: 14, fontWeight: 400, color: 'var(--accent)', letterSpacing: '-0.1px', padding: '6px 10px', borderRadius: 8 }}
    >
      {children}
    </button>
  )
}

export function CardLabel({
  children,
  hint,
  style,
}: {
  children: ReactNode
  hint?: ReactNode
  style?: React.CSSProperties
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14, ...style }}>
      <div
        style={{
          fontSize: 13,
          fontWeight: 400,
          letterSpacing: '0.6px',
          textTransform: 'uppercase',
          color: 'var(--text-2)',
        }}
      >
        {children}
      </div>
      {hint && <div style={{ fontSize: 12, color: 'var(--text-3)', letterSpacing: '-0.1px' }}>{hint}</div>}
    </div>
  )
}

export function WebSearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  const { t } = useApp()
  const ph = placeholder ?? t('Search')
  return (
    <div style={{ position: 'relative' }}>
      <svg width="14" height="14" viewBox="0 0 14 14" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
        <circle cx="6" cy="6" r="4.5" fill="none" stroke="var(--text-3)" strokeWidth="1.4" />
        <path d="M9.5 9.5L13 13" stroke="var(--text-3)" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
      <input
        className="ow-search"
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={ph}
        aria-label={ph}
      />
    </div>
  )
}

/** Category tint tile with the category glyph (lucide), matching the iOS tile. */
export function CatTile({ category, size = 30 }: { category: TransactionCategory; size?: number }) {
  const meta = categoryMeta(category)
  const Icon = meta.icon
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.36),
        background: meta.tint,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <Icon size={Math.round(size * 0.5)} color="#fff" strokeWidth={2.1} />
    </span>
  )
}

/** A small payment-source dot. Real card names vary, so we use a calm muted dot. */
export function SourceDot({ size = 7 }: { size?: number }) {
  return (
    <span
      style={{ width: size, height: size, borderRadius: size, flexShrink: 0, background: 'var(--pay-ach)' }}
    />
  )
}
