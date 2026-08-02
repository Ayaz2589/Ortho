'use client'

import { useCallback, useState } from 'react'
import type { WidgetDefinition } from './registry'
import {
  enabledWidgets,
  readWidgetPrefs,
  setWidgetEnabled as persistToggle,
  type WidgetPrefs,
} from './preferences'

/**
 * React binding for widget preferences (spec 034). The stored prefs are read
 * SYNCHRONOUSLY in the initial state, mirroring `useMediaQuery`: the Dashboard
 * mounts client-side after the data-loading gate (a RouteSkeleton covers the
 * prerender), so `window` is available on this hook's first render and the
 * member's real widget set paints immediately — no default-set → stored-set
 * flash (and, for an all-off member, no full-board → empty flip). On the server
 * / prerender (`window` undefined) it falls back to the declared defaults.
 * `setEnabled` updates state and persists in one step.
 */
export function useWidgetPrefs(): {
  prefs: WidgetPrefs
  enabled: WidgetDefinition[]
  setEnabled: (id: string, on: boolean) => void
} {
  const [prefs, setPrefs] = useState<WidgetPrefs>(() =>
    typeof window !== 'undefined' ? readWidgetPrefs() : {}
  )

  const setEnabled = useCallback((id: string, on: boolean) => {
    setPrefs((current) => persistToggle(id, on, current))
  }, [])

  return { prefs, enabled: enabledWidgets(prefs), setEnabled }
}
