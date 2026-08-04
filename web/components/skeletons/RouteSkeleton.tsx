'use client'

import { usePathname } from 'next/navigation'
import { readSkeletonCount } from '@/lib/skeletonCounts'
import { Card } from '@/components/ui'
import { Skeleton } from '@/components/ui/Skeleton'
import { SkeletonRegion } from './SkeletonRegion'
import { DashboardSkeleton } from './DashboardSkeleton'
import { TransactionsSkeleton } from './TransactionsSkeleton'
import { HousingSkeleton } from './HousingSkeleton'
import { BudgetsSkeleton } from './BudgetsSkeleton'
import { GoalsSkeleton } from './GoalsSkeleton'
import { PlanningSkeleton } from './PlanningSkeleton'
import { SettingsSkeleton } from './SettingsSkeleton'

/** Per-surface default row/card counts, used on the first-ever load before a real
 *  count has been recorded. Tuned to roughly fill a viewport for each surface. */
const DEFAULTS = { transactions: 8, housing: 2, goals: 3 } as const

/** Fallback for any route without a bespoke shape — still a calm busy region,
 *  never the bare "Loading…" string. */
function GenericSkeleton() {
  return (
    <SkeletonRegion testId="skeleton-generic" className="mx-auto w-full max-w-[560px]">
      <div className="pt-2">
        <Skeleton width={120} height={24} />
      </div>
      <div className="mt-4 flex flex-col gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} className="p-5">
            <Skeleton width="40%" height={13} />
            <div className="mt-3 flex flex-col gap-2">
              <Skeleton height={12} />
              <Skeleton width="70%" height={12} />
            </div>
          </Card>
        ))}
      </div>
    </SkeletonRegion>
  )
}

/**
 * Route-aware loading skeleton (spec 032). Chosen by `usePathname()` so the shell
 * shows a placeholder shaped like the page the user is about to land on, instead
 * of a centered "Loading…" string. List/table surfaces are sized from the item
 * count recorded at the end of the previous successful load (`lib/skeletonCounts`),
 * falling back to a per-surface default on the first-ever load.
 */
export function RouteSkeleton() {
  const pathname = usePathname() ?? ''

  if (pathname.startsWith('/transactions')) {
    return <TransactionsSkeleton count={readSkeletonCount('transactions', DEFAULTS.transactions)} />
  }
  if (pathname.startsWith('/housing')) {
    return <HousingSkeleton count={readSkeletonCount('housing', DEFAULTS.housing)} />
  }
  // Budget/Goals detail live under /planning (spec 040) — match them BEFORE the
  // general /planning hub so the sub-routes keep their own skeletons.
  if (pathname.startsWith('/planning/goals')) {
    return <GoalsSkeleton count={readSkeletonCount('goals', DEFAULTS.goals)} />
  }
  if (pathname.startsWith('/planning/budget')) return <BudgetsSkeleton />
  if (pathname.startsWith('/planning')) return <PlanningSkeleton />
  if (pathname.startsWith('/settings')) return <SettingsSkeleton />
  if (pathname.startsWith('/dashboard')) return <DashboardSkeleton />

  return <GenericSkeleton />
}
