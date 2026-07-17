'use client'

import type { ReactNode } from 'react'

/**
 * The full-screen mobile form-page frame (spec 025) — one place for the page
 * width/height/flex so the transaction and property new/edit pages never drift
 * (and a single spot to add safe-area / keyboard-inset padding later).
 */
export function FormPage({ children }: { children: ReactNode }) {
  return <div className="mx-auto flex min-h-[100dvh] w-full max-w-[640px] flex-col">{children}</div>
}
