'use client'

import { ChevronRight } from 'lucide-react'
import { Modal } from '@/components/ui'
import type { PropertyKind } from '@/lib/types'
import { PROPERTY_KINDS, kindMeta } from './kinds'

export function PropertyTypePicker({
  open,
  onClose,
  onPick,
}: {
  open: boolean
  onClose: () => void
  onPick: (kind: PropertyKind) => void
}) {
  return (
    <Modal open={open} onClose={onClose} title="New property">
      <p className="px-1 pb-4 text-[14px] leading-relaxed text-text-2">
        What kind of home is this? Choose one — we&apos;ll ask only the questions that fit.
      </p>
      <div className="flex flex-col gap-3">
        {PROPERTY_KINDS.map((kind) => {
          const meta = kindMeta(kind)
          const Icon = meta.icon
          return (
            <button
              key={kind}
              type="button"
              onClick={() => onPick(kind)}
              className="flex items-center gap-3.5 rounded-2xl bg-surface px-4 py-3.5 text-left"
              style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}
            >
              <span
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-text-2"
                style={{ background: 'rgba(0,0,0,0.05)' }}
              >
                <Icon size={19} />
              </span>
              <span className="flex flex-col gap-0.5">
                <span className="text-[17px] font-semibold text-text">{meta.displayName}</span>
                <span className="text-[13px] text-text-2">{meta.subtitle}</span>
              </span>
              <ChevronRight size={16} className="ml-auto shrink-0 text-text-3" />
            </button>
          )
        })}
      </div>
      <p className="px-1 pb-2 pt-4 text-[13px] leading-relaxed text-text-3">
        You can change details later from the property&apos;s Edit screen.
      </p>
    </Modal>
  )
}
