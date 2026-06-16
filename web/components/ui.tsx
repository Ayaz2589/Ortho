'use client'

import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { paletteFor } from '@/lib/categories'
import type { User } from '@/lib/types'

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn('rounded-2xl bg-surface', className)}
      style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}
    >
      {children}
    </div>
  )
}

export function SectionLabel({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[13px] font-normal uppercase tracking-[0.6px] text-text-2">
        {children}
      </span>
      {right ? <span className="text-xs text-text-3">{right}</span> : null}
    </div>
  )
}

export function Avatar({
  user,
  size = 38,
}: {
  user: User
  size?: number
}) {
  const p = paletteFor(user.color_key)
  const multi = user.initial.length > 1
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full font-normal"
      style={{
        width: size,
        height: size,
        background: p.bg,
        color: p.fg,
        fontSize: multi ? size * 0.34 : size * 0.45,
      }}
    >
      {user.initial}
    </div>
  )
}

export function IconButton({
  onClick,
  children,
  className,
  ariaLabel,
}: {
  onClick?: () => void
  children: ReactNode
  className?: string
  ariaLabel?: string
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      className={cn(
        'flex h-9 w-9 items-center justify-center rounded-full text-accent transition-colors hover:bg-[var(--hairline)]',
        className
      )}
      style={{ background: 'rgba(0,0,0,0.04)' }}
    >
      {children}
    </button>
  )
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div
      className="flex gap-1 rounded-[10px] p-1"
      style={{ background: 'rgba(0,0,0,0.05)' }}
    >
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={cn(
              'flex-1 rounded-lg px-3 py-1.5 text-sm font-normal transition-colors',
              active ? 'text-text' : 'text-text-2'
            )}
            style={active ? { background: 'var(--surface)', boxShadow: '0 1px 2px rgba(0,0,0,0.06)' } : undefined}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

export function Modal({
  open,
  onClose,
  title,
  children,
  left,
  right,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  left?: ReactNode
  right?: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handler)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-bg sm:rounded-3xl">
        <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
          <div className="min-w-[60px] text-left text-[15px] text-accent">
            {left ?? (
              <button type="button" onClick={onClose} className="text-accent">
                Cancel
              </button>
            )}
          </div>
          <h2 className="text-[15px] font-normal text-text">{title}</h2>
          <div className="min-w-[60px] text-right text-[15px]">{right}</div>
        </div>
        <div className="overflow-y-auto px-4 py-4">{children}</div>
      </div>
    </div>,
    document.body
  )
}

export function FieldRow({
  label,
  children,
  labelWidth = 120,
}: {
  label: string
  children: ReactNode
  labelWidth?: number
}) {
  return (
    <div className="flex min-h-[52px] items-center gap-3 px-4">
      <span className="shrink-0 text-[15px] text-text-2" style={{ width: labelWidth }}>
        {label}
      </span>
      <div className="flex flex-1 items-center justify-end">{children}</div>
    </div>
  )
}

export function FormGroup({ children }: { children: ReactNode }) {
  return (
    <Card className="divide-y divide-hairline overflow-hidden">{children}</Card>
  )
}

export function PrimaryButton({
  onClick,
  disabled,
  children,
  className,
  type = 'button',
}: {
  onClick?: () => void
  disabled?: boolean
  children: ReactNode
  className?: string
  type?: 'button' | 'submit'
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex h-12 w-full items-center justify-center rounded-full text-[15px] font-normal text-white transition-opacity disabled:opacity-40',
        className
      )}
      style={{ background: 'var(--text)' }}
    >
      <span style={{ color: 'var(--bg)' }}>{children}</span>
    </button>
  )
}

export function PageHeader({
  title,
  right,
  subtitle,
}: {
  title: string
  right?: ReactNode
  subtitle?: ReactNode
}) {
  return (
    <div className="mb-4 flex items-start justify-between pt-2">
      <div>
        <h1 className="text-[32px] font-light tracking-[-0.6px] text-text">{title}</h1>
        {subtitle ? <p className="mt-0.5 text-[13px] text-text-2">{subtitle}</p> : null}
      </div>
      {right ? <div className="flex items-center gap-2 pt-2">{right}</div> : null}
    </div>
  )
}

export function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <IconButton onClick={onClick} ariaLabel="Close">
      <X size={18} />
    </IconButton>
  )
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: ReactNode
  title: string
  body: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-8 py-20 text-center">
      <div className="text-text-3">{icon}</div>
      <h3 className="text-[17px] font-normal text-text">{title}</h3>
      <p className="max-w-xs text-sm text-text-2">{body}</p>
      {action}
    </div>
  )
}
