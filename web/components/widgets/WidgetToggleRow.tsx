'use client'

import { type ReactNode } from 'react'
import { Check } from 'lucide-react'

/**
 * A settings row that turns one widget on or off (spec 034). Visually it follows
 * the app's calm `ChoiceRow` vocabulary (leading icon tile, name, trailing sand
 * check when on), but it is a real `role="switch"` control with `aria-checked`
 * so it reads as a toggle to assistive tech and is unambiguous to test
 * (Principle V). Keyboard reachable with the global sand focus ring.
 */
export function WidgetToggleRow({
  icon,
  label,
  description,
  checked,
  onToggle,
}: {
  icon: ReactNode
  label: string
  description: string
  checked: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onToggle}
      className="flex min-h-[60px] w-full items-center gap-3.5 px-4 py-3 text-left"
    >
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-text-2"
        style={{ background: 'var(--chip-bg)' }}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[17px] font-normal text-text">{label}</span>
        <span className="block text-[13px] text-text-3">{description}</span>
      </span>
      <span
        aria-hidden="true"
        className="ml-auto flex h-6 w-6 shrink-0 items-center justify-center"
      >
        {checked && <Check size={16} className="text-accent" strokeWidth={2.5} />}
      </span>
    </button>
  )
}
