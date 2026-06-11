'use client'

import { useEffect, useState } from 'react'

/** SSR-safe media query hook. Returns false on the server / first paint,
 *  then resolves on mount. */
export function useMediaQuery(query: string): boolean {
  // Resolve synchronously on the first client render so the correct layout
  // paints immediately (no flash of the other breakpoint). These pages mount
  // client-side after the data-loading gate, so `window` is available here.
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false
  )
  useEffect(() => {
    const mql = window.matchMedia(query)
    setMatches(mql.matches)
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [query])
  return matches
}

/** Expanded breakpoint = desktop master–detail (≥1024px). */
export function useIsExpanded(): boolean {
  return useMediaQuery('(min-width: 1024px)')
}
