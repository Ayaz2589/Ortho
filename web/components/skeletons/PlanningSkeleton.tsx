'use client'

import { Skeleton } from '@/components/ui/Skeleton'
import { SkeletonRegion, atLeastOne } from './SkeletonRegion'

/** Planning hub skeleton (spec 038) — title + month bar, the "Left to plan" hero,
 *  the budgets summary card, and (spec 045) one placeholder per goal card, sized
 *  from the previous successful load. The goal count lives here now because the
 *  hub is where per-goal cards render; `/planning/goals` became a single-goal
 *  detail page. Static (no shimmer), token-only. */
export function PlanningSkeleton({ goalCount = 3 }: { goalCount?: number }) {
  const goals = atLeastOne(goalCount)
  return (
    <SkeletonRegion testId="skeleton-planning" className="mx-auto w-full max-w-[720px]">
      <div className="pt-2">
        <Skeleton width={140} height={32} />
      </div>
      <div className="mt-4">
        <Skeleton width={200} height={40} />
      </div>
      {/* hero */}
      <div className="mt-6 flex flex-col gap-3">
        <Skeleton width={90} height={13} />
        <Skeleton width={220} height={48} />
        <div className="mt-2 flex gap-8">
          <Skeleton width={80} height={30} />
          <Skeleton width={80} height={30} />
          <Skeleton width={80} height={30} />
        </div>
      </div>
      {/* budgets summary */}
      <div className="mt-6 flex flex-col gap-5">
        <div className="rounded-2xl border border-hairline p-4">
          <Skeleton width="30%" height={13} />
          <div className="mt-4 flex flex-col gap-3">
            <Skeleton height={12} />
            <Skeleton width="70%" height={12} />
          </div>
        </div>

        {/* goals summary — one card per goal (spec 045) */}
        <div className="rounded-2xl border border-hairline p-4">
          <Skeleton width="30%" height={13} />
          <div className="mt-4 flex flex-col gap-3">
            {Array.from({ length: goals }).map((_, i) => (
              <div key={i} className="rounded-2xl bg-surface p-4">
                <div className="flex items-center gap-3">
                  <Skeleton width={36} height={36} radius={10} />
                  <Skeleton width="45%" height={15} />
                </div>
                <div className="mt-3">
                  <Skeleton width={140} height={20} />
                </div>
                <div className="mt-3">
                  <Skeleton height={6} radius="full" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </SkeletonRegion>
  )
}
