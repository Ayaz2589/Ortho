'use client'

import { ChevronRight } from 'lucide-react'
import { useApp } from '@/lib/store'
import type { PropertyKind } from '@/lib/types'
import { PROPERTY_KINDS, kindMeta } from './kinds'

/**
 * The property-kind choice list (spec 025), shared by the desktop
 * PropertyTypePicker (inside its Drawer) and the mobile new-property page (as its
 * first in-page step). Presentational only — the caller supplies the chrome.
 */
export function PropertyKindChoices({ onPick }: { onPick: (kind: PropertyKind) => void }) {
  const { t } = useApp()
  return (
    <>
      <p className="px-1 pb-4 text-[14px] leading-relaxed text-text-2">
        {t("What kind of home is this? Choose one — we'll ask only the questions that fit.")}
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
                style={{ background: 'var(--chip-bg)' }}
              >
                <Icon size={19} />
              </span>
              <span className="flex flex-col gap-0.5">
                <span className="text-[17px] font-normal text-text">{t(meta.displayName)}</span>
                <span className="text-[13px] text-text-2">{t(meta.subtitle)}</span>
              </span>
              <ChevronRight size={16} className="ml-auto shrink-0 text-text-3" />
            </button>
          )
        })}
      </div>
      <p className="px-1 pb-2 pt-4 text-[13px] leading-relaxed text-text-3">
        {t("A property's type can't be changed after it's added — to switch, remove it and add it again as the new type.")}
      </p>
    </>
  )
}
