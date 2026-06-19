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
