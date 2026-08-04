'use client'

import { type LucideIcon, Download, LayoutGrid, CircleDollarSign, Languages, ChevronRight } from 'lucide-react'
import { useApp } from '@/lib/store'

/**
 * Settings-shortcut widget bodies (spec 039). Each is a calm navigation tile: an icon
 * in a chip that grows to fill the cell, plus an "Open" affordance at the bottom. The
 * widget frame's `<h2>` title carries the label and the frame's `href` makes the whole
 * card the link, so the body itself is purely presentational (no per-widget text →
 * minimal i18n, no duplication). Reads only `t` from `useApp()`; tokens only.
 */
function SettingsShortcut({ icon: Icon }: { icon: LucideIcon }) {
  const { t } = useApp()
  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-1 items-center justify-center">
        <span
          className="flex h-12 w-12 items-center justify-center rounded-full"
          style={{ background: 'var(--chip-bg)' }}
        >
          <Icon size={22} className="text-text-2" />
        </span>
      </div>
      {/* Decorative affordance — the whole card is the link (aria-label "Open {title}"),
          so hide this from assistive tech to avoid a redundant "Open" announcement. */}
      <span
        aria-hidden="true"
        className="mt-auto inline-flex items-center gap-1 text-[13px] text-accent"
      >
        {t('Open')}
        <ChevronRight size={15} />
      </span>
    </div>
  )
}

export function DownloadDataBody() {
  return <SettingsShortcut icon={Download} />
}

export function WidgetSettingsBody() {
  return <SettingsShortcut icon={LayoutGrid} />
}

export function ChangeCurrencyBody() {
  return <SettingsShortcut icon={CircleDollarSign} />
}

export function ChangeLanguageBody() {
  return <SettingsShortcut icon={Languages} />
}
