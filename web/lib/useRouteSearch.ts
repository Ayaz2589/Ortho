'use client'

import { useEffect, useState } from 'react'

/**
 * The page's query string, read ONCE after mount — `undefined` until it is known.
 *
 * Deliberately `window.location.search` rather than `useSearchParams`: this app is
 * a static export (`output: 'export'`), so pages are prerendered at build time
 * where `window` does not exist, and `useSearchParams` forces a Suspense deopt.
 * This matches the plaid-oauth precedent and the spec-025 form pages.
 *
 * Callers MUST treat `undefined` as "not known yet" and render nothing — otherwise
 * a route that redirects on a missing/unresolvable id would flash that redirect on
 * the very first paint, before the real query string has been read.
 */
export function useRouteSearch(): string | undefined {
  const [search, setSearch] = useState<string | undefined>(undefined)
  useEffect(() => {
    setSearch(window.location.search)
  }, [])
  return search
}
