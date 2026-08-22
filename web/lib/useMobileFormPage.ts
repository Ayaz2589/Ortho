'use client'

import { useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useIsExpanded } from './useMediaQuery'
import { useRouteSearch } from './useRouteSearch'

/**
 * Shared plumbing for the spec-025 mobile new/edit form pages, so the four pages
 * don't each repeat the same guards:
 *  - desktop keeps its in-place tray/drawer, so redirect to the list at ≥1024px;
 *  - read the transient URL intent ONCE after mount (`useRouteSearch` — see there
 *    for why it is window.location and not useSearchParams).
 *
 * Returns `search` (undefined until read, so pages render nothing until intent is
 * known) plus stable `goList`/`replaceList` navigators to the given list route.
 *
 * The desktop redirect is what makes this FORM-page-specific: the spec-025 new/edit
 * pages each have a drawer equivalent at ≥1024px. A page that is a real destination
 * at every width (the goal detail page) wants `useRouteSearch` on its own instead.
 */
export function useMobileFormPage(listRoute: string) {
  const router = useRouter()
  const isExpanded = useIsExpanded()
  const search = useRouteSearch()

  useEffect(() => {
    if (isExpanded) router.replace(listRoute)
  }, [isExpanded, listRoute, router])

  const goList = useCallback(() => router.push(listRoute), [router, listRoute])
  const replaceList = useCallback(() => router.replace(listRoute), [router, listRoute])

  return { isExpanded, search, goList, replaceList }
}
