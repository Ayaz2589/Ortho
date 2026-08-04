'use client'

import type { ReactNode } from 'react'

/**
 * Shared hairline surface for the planning-hub summary cards (spec 038). NO shadow
 * — inset cards sit on the background (constitution II / SC-007). A title row with
 * an optional trailing action (e.g. a "View all …" link).
 */
export function PlanningSection({
  title,
  action,
  children,
}: {
  title: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="mb-5 rounded-2xl border border-hairline bg-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[13px] font-normal uppercase tracking-[0.6px] text-text-2">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}
