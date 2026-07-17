'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useIsExpanded } from './useMediaQuery'

/**
 * Shared plumbing for the spec-025 mobile new/edit form pages, so the four pages
 * don't each repeat the same guards:
 *  - desktop keeps its in-place tray/drawer, so redirect to the list at ≥1024px;
 *  - read the transient URL intent ONCE after mount (window.location, not
 *    useSearchParams — static export prerenders at build time where window is
 *    absent; this matches the plaid-oauth precedent and avoids the Suspense deopt).
 *
 * Returns `search` (undefined until read, so pages render nothing until intent is
 * known) plus stable `goList`/`replaceList` navigators to the given list route.
 */
export function useMobileFormPage(listRoute: string) {
  const router = useRouter()
  const isExpanded = useIsExpanded()
  const [search, setSearch] = useState<string | undefined>(undefined)

  useEffect(() => {
    if (isExpanded) router.replace(listRoute)
  }, [isExpanded, listRoute, router])

  useEffect(() => {
    setSearch(window.location.search)
  }, [])

  const goList = useCallback(() => router.push(listRoute), [router, listRoute])
  const replaceList = useCallback(() => router.replace(listRoute), [router, listRoute])

  return { isExpanded, search, goList, replaceList }
}
