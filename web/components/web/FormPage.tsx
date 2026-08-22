'use client'

import type { ReactNode } from 'react'
import { useHideTabBar } from '@/lib/tabBarVisibility'

/**
 * The full-screen mobile form-page frame (spec 025) — one place for the page
 * width/height/flex so the transaction and property new/edit pages never drift
 * (and a single spot to add safe-area / keyboard-inset padding later).
 *
 * `-mx-4 sm:-mx-8` cancels the app shell's content padding (`px-4`, `sm:px-8` in
 * (app)/layout.tsx) so a full-screen form is edge-to-edge in the shell. Its only
 * side inset then comes from each field card's own `margin: 0 20px`, matching the
 * desktop drawer's 20px inset — instead of stacking the shell's padding on top of
 * the card margins (~36px, which read as too much space on the sides). Only the
 * base + sm padding tiers are cancelled because the form redirects to the list at
 * ≥1024px (lg), so it never renders at the `lg:px-10` tier.
 */
export function FormPage({ children }: { children: ReactNode }) {
  // Every form page is a full-screen task (Cancel/Save) — hide the bottom tab bar
  // so you can't navigate away mid-edit and lose the form.
  useHideTabBar()
  return <div className="-mx-4 flex min-h-[100dvh] flex-col sm:-mx-8">{children}</div>
}
