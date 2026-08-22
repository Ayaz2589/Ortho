'use client'

import { Card } from '@/components/ui'
import { Skeleton } from '@/components/ui/Skeleton'
import { ReadingColumn } from '@/components/layout'
import { SkeletonRegion } from './SkeletonRegion'

/** `/planning/goals` loading state (spec 032, reshaped by spec 045).
 *
 *  This route used to be the goals INDEX, so the skeleton drew `count` goal cards
 *  sized from the previous load. It is now the DETAIL page for a SINGLE goal, so
 *  the shape is fixed: a back link, one goal card with its ledger, and the two
 *  chart blocks below it. Drawing several cards here would promise a list that
 *  never arrives. Mirrors `components/goals/GoalDetail.tsx`.
 *
 *  (The recorded goal count now belongs to the Planning hub, which is where the
 *  per-goal cards render — see `PlanningSkeleton`.) */
export function GoalsSkeleton() {
  return (
    <SkeletonRegion testId="skeleton-goals">
      <ReadingColumn>
        {/* back to Planning */}
        <div className="pt-2">
          <Skeleton width={80} height={14} />
        </div>

        {/* the goal card */}
        <div className="mt-3">
          <Card className="p-5">
            <div className="flex items-center gap-3">
              <Skeleton width={36} height={36} radius={10} />
              <Skeleton width="45%" height={15} />
            </div>
            <div className="mt-4">
              <Skeleton width={160} height={26} />
            </div>
            {/* progress bar track */}
            <div className="mt-4">
              <Skeleton height={8} radius="full" />
            </div>
            <div className="mt-3 flex items-center justify-between">
              <Skeleton width="30%" height={12} />
              <Skeleton width="25%" height={12} />
            </div>
            {/* contribution ledger */}
            <div className="mt-5 flex flex-col gap-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between">
                  <Skeleton width="40%" height={12} />
                  <Skeleton width={60} height={12} />
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* saved-over-time, then by-month */}
        <div className="mt-6 flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <Skeleton width={110} height={11} />
            <Skeleton height={160} radius={12} />
          </div>
          <div className="flex flex-col gap-2">
            <Skeleton width={80} height={11} />
            <Skeleton height={110} radius={12} />
          </div>
        </div>
      </ReadingColumn>
    </SkeletonRegion>
  )
}
