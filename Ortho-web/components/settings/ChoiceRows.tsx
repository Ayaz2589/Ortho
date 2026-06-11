'use client'

import { type ReactNode } from 'react'
import { Check } from 'lucide-react'

/** A selectable row with a leading icon tile and trailing checkmark when active. */
export function ChoiceRow({
  icon,
  label,
  active,
  onClick,
}: {
  icon: ReactNode
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[60px] w-full items-center gap-3.5 px-4 py-3 text-left"
    >
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-text-2"
        style={{ background: 'rgba(0,0,0,0.05)' }}
      >
        {icon}
      </span>
      <span className="text-[17px] font-medium text-text">{label}</span>
      {active && <Check size={16} className="ml-auto text-accent" strokeWidth={2.5} />}
    </button>
  )
}
