'use client'

import type { ReactNode } from 'react'

/** A small uppercase heading over a group of rows within a panel (e.g.
 *  "Upcoming payments", "Recent months"). Extracted verbatim from
 *  HomeEquityPanel and BudgetsPanel (spec 057, D10). */
export function PanelSectionLabel({ children }: { children: ReactNode }) {
  return <span className="text-xs uppercase tracking-[0.4px] text-text-2">{children}</span>
}
