'use client'

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import { ChevronRight, CreditCard, MinusCircle, Plus } from 'lucide-react'
import { Avatar } from '@/components/ui'
import type { Card, User, LocalUser } from '@/lib/types'

export function SectionCard({ children }: { children: ReactNode }) {
  return (
    <div
      className="divide-y divide-hairline overflow-hidden rounded-2xl bg-surface"
      style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}
    >
      {children}
    </div>
  )
}

/** A row that links to another route, with an optional right-side peek value. */
export function LinkRow({
  href,
  label,
  peek,
}: {
  href: string
  label: string
  peek?: ReactNode
}) {
  return (
    <Link
      href={href}
      className="flex min-h-[60px] items-center gap-3 px-4 py-3"
    >
      <span className="text-[17px] font-normal text-text">{label}</span>
      <span className="ml-auto flex items-center gap-1.5">
        {peek != null && <span className="text-[17px] font-normal text-text-2">{peek}</span>}
        <ChevronRight size={16} className="text-text-3" />
      </span>
    </Link>
  )
}

export function CardRow({ card, onDelete }: { card: Card; onDelete: () => void }) {
  const [confirming, setConfirming] = useState(false)
  return (
    <div className="flex min-h-[60px] items-center gap-3.5 px-4 py-3">
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-text-2"
        style={{ background: 'rgba(0,0,0,0.05)' }}
      >
        <CreditCard size={16} />
      </span>
      <span className="text-[17px] font-normal text-text">{card.name}</span>
      {confirming ? (
        <span className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="text-[13px] font-normal text-text-2"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="text-[13px] font-normal text-destructive"
          >
            Delete
          </button>
        </span>
      ) : (
        <button
          type="button"
          aria-label={`Delete ${card.name}`}
          onClick={() => setConfirming(true)}
          className="ml-auto text-destructive"
        >
          <MinusCircle size={20} />
        </button>
      )}
    </div>
  )
}

export function ActionRow({
  icon,
  label,
  onClick,
  destructive = false,
}: {
  icon: ReactNode
  label: string
  onClick: () => void
  destructive?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[60px] w-full items-center gap-3.5 px-4 py-3 text-left"
    >
      <span
        className={
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-full ' +
          (destructive ? 'text-destructive' : 'text-accent')
        }
        style={{ background: 'rgba(0,0,0,0.05)' }}
      >
        {icon}
      </span>
      <span
        className={
          'text-[17px] font-normal ' + (destructive ? 'text-destructive' : 'text-accent')
        }
      >
        {label}
      </span>
    </button>
  )
}

export function AddRow({ label, onClick }: { label: string; onClick: () => void }) {
  return <ActionRow icon={<Plus size={15} strokeWidth={2.5} />} label={label} onClick={onClick} />
}

/** User row used in the Household screen. */
export function UserRow({
  user,
  isCurrentUser = false,
  detail,
  onRemove,
  onClick,
}: {
  user: User | LocalUser
  isCurrentUser?: boolean
  detail?: string
  onRemove?: () => void
  onClick?: () => void
}) {
  const [confirming, setConfirming] = useState(false)

  const composedDetail = (() => {
    if (isCurrentUser && detail) return `(you) · ${detail}`
    if (isCurrentUser) return '(you)'
    return detail
  })()

  // Clickable variant: the whole row opens the member detail drawer (remove
  // lives there), shown with a trailing chevron.
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="flex min-h-[60px] w-full items-center gap-3.5 px-4 py-3 text-left"
      >
        <Avatar user={user} size={40} />
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-[17px] font-normal text-text">{user.name}</span>
          {composedDetail && (
            <span className="truncate text-[13px] text-text-2">{composedDetail}</span>
          )}
        </div>
        <ChevronRight size={16} className="ml-auto shrink-0 text-text-3" />
      </button>
    )
  }

  return (
    <div className="flex min-h-[60px] items-center gap-3.5 px-4 py-3">
      <Avatar user={user} size={40} />
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-[17px] font-normal text-text">{user.name}</span>
        {composedDetail && (
          <span className="truncate text-[13px] text-text-2">{composedDetail}</span>
        )}
      </div>
      {onRemove &&
        (confirming ? (
          <span className="ml-auto flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="text-[13px] font-normal text-text-2"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onRemove}
              className="text-[13px] font-normal text-destructive"
            >
              Remove
            </button>
          </span>
        ) : (
          <button
            type="button"
            aria-label={`Remove ${user.name}`}
            onClick={() => setConfirming(true)}
            className="ml-auto shrink-0 text-destructive"
          >
            <MinusCircle size={20} />
          </button>
        ))}
    </div>
  )
}
