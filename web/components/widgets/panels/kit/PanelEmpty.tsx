'use client'

import type { ReactNode } from 'react'

/** A panel's own empty state (contract C-2), consistent with its card's — a
 *  calm centered message, never a blank frame. Extracted verbatim from
 *  HomeEquityPanel and BudgetsPanel (spec 057, D10). */
export function PanelEmpty({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center p-6 text-center text-[13px] text-text-3">
      {children}
    </div>
  )
}
