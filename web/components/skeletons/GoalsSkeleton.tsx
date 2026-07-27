'use client'

import { Skeleton } from '@/components/ui/Skeleton'
import { ReadingColumn } from '@/components/layout'
import { SkeletonRegion, SkeletonCard, atLeastOne } from './SkeletonRegion'

/** Goals skeleton (spec 032) — back link + header, then `count` goal-card
 *  placeholders (headline amount, progress bar, meta line), sized from the
 *  previous successful load. Mirrors `components/goals/GoalCard.tsx`. */
export function GoalsSkeleton({ count = 3 }: { count?: number }) {
  const cards = atLeastOne(count)
  return (
    <SkeletonRegion testId="skeleton-goals">
      <ReadingColumn>
        <div className="pt-2">
          <Skeleton width={80} height={14} />
        </div>
        <div className="mt-3 flex items-center justify-between">
          <Skeleton width={90} height={24} />
          <Skeleton width={40} height={40} radius="full" />
        </div>
        <div className="mt-4 flex flex-col gap-4">
          {Array.from({ length: cards }).map((_, i) => (
            <SkeletonCard key={i}>
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
            </SkeletonCard>
          ))}
        </div>
      </ReadingColumn>
    </SkeletonRegion>
  )
}
