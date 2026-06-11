'use client'

import { type ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** Centered, width-capped reading column (Settings, single forms). */
export function ReadingColumn({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return <div className={cn('mx-auto w-full max-w-[560px]', className)}>{children}</div>
}

/** Capped dashboard container (grid layout decided by the page). */
export function DashboardGrid({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-[1080px]">{children}</div>
}

/**
 * Two-pane master–detail. Only rendered at the expanded breakpoint by callers;
 * the list pane is fixed-ish, the detail pane flexes and sticks while the list
 * scrolls within the content area.
 */
export function MasterDetail({ list, detail }: { list: ReactNode; detail: ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-[1200px] gap-8">
      <div className="w-full max-w-[440px] shrink-0">{list}</div>
      <div className="sticky top-2 min-w-0 flex-1 self-start" style={{ maxWidth: 720 }}>
        {detail}
      </div>
    </div>
  )
}

/** Quiet prompt shown in an empty detail pane. */
export function DetailEmpty({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[320px] items-center justify-center rounded-2xl text-sm text-text-3">
      {children}
    </div>
  )
}
