'use client'

import { useCallback, useEffect, useState } from 'react'
import type { WidgetDefinition } from './registry'
import {
  enabledWidgets,
  readWidgetPrefs,
  setWidgetEnabled as persistToggle,
  type WidgetPrefs,
} from './preferences'

/**
 * React binding for widget preferences (spec 034). SSR-safe: the first render
 * returns the declared defaults (an empty prefs map) so server and first client
 * paint agree; a mount effect then adopts the stored values, exactly like
 * `useDashboardRange`. `setEnabled` updates state and persists in one step.
 */
export function useWidgetPrefs(): {
  prefs: WidgetPrefs
  enabled: WidgetDefinition[]
  setEnabled: (id: string, on: boolean) => void
} {
  const [prefs, setPrefs] = useState<WidgetPrefs>({})

  useEffect(() => {
    setPrefs(readWidgetPrefs())
  }, [])

  const setEnabled = useCallback((id: string, on: boolean) => {
    setPrefs((current) => persistToggle(id, on, current))
  }, [])

  return { prefs, enabled: enabledWidgets(prefs), setEnabled }
}
