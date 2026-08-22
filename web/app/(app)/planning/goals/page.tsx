'use client'

import { useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useApp } from '@/lib/store'
import { useRouteSearch } from '@/lib/useRouteSearch'
import { parseIdParam } from '@/lib/formPageIntent'
import { ReadingColumn } from '@/components/layout'
import { GoalDetail } from '@/components/goals/GoalDetail'

/**
 * One goal's detail page (spec 045 US2). This route used to be the goals INDEX —
 * a second list of every goal, duplicating the Planning hub's own goals section.
 * The hub now renders a card per goal, so this route became the place a single
 * goal is understood instead.
 *
 * Addressed `?id=<goalId>`, not `/planning/goals/<goalId>`: the app is a static
 * export (`output: 'export'`), so a dynamic segment would need every id enumerated
 * at build time, and goal ids are runtime UUIDs. `?id=` is the repo's existing
 * answer to exactly this (`housing/edit`, `transactions/edit`), and it keeps the
 * URL refresh-safe on web and correct in the Capacitor iOS shell, where an
 * extensionless path would be swallowed by the asset router's SPA fallback.
 *
 * Both "not known yet" states render nothing AND redirect nothing: `search` is
 * undefined until the mount effect reads it, and `loading` is true until the store
 * arrives. Redirecting during either would bounce a legitimate refresh to
 * /planning before the goal ever loaded.
 */
export default function GoalDetailPage() {
  const router = useRouter()
  const search = useRouteSearch()
  const { goals, goalContributions, loading } = useApp()

  const id = search === undefined ? undefined : parseIdParam(search)
  const goal = id ? goals.find((g) => g.id === id) ?? null : null

  useEffect(() => {
    if (search === undefined || loading) return
    if (!goal) router.replace('/planning')
  }, [search, loading, goal, router])

  const contributions = useMemo(
    () => (goal ? goalContributions.filter((c) => c.goal_id === goal.id) : []),
    [goal, goalContributions]
  )

  // Nothing to show, and no error screen either — the effect above is already
  // taking the user back to Planning.
  if (search === undefined || loading || !goal) return null

  return (
    <ReadingColumn>
      <GoalDetail goal={goal} contributions={contributions} />
    </ReadingColumn>
  )
}
