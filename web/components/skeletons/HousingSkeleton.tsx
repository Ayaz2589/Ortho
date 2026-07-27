'use client'

import { Skeleton } from '@/components/ui/Skeleton'
import { ReadingColumn } from '@/components/layout'
import { SkeletonRegion, SkeletonCard, atLeastOne } from './SkeletonRegion'

/** Housing skeleton (spec 032) — a header plus `count` property-card
 *  placeholders, sized from the previous successful load. */
export function HousingSkeleton({ count = 2 }: { count?: number }) {
  const cards = atLeastOne(count)
  return (
    <SkeletonRegion testId="skeleton-housing">
      <ReadingColumn>
        <div className="flex items-center justify-between pt-2">
          <Skeleton width={120} height={24} />
          <Skeleton width={40} height={40} radius="full" />
        </div>
        <div className="mt-4 flex flex-col gap-4">
          {Array.from({ length: cards }).map((_, i) => (
            <SkeletonCard key={i}>
              <div className="flex items-center gap-3">
                <Skeleton width={44} height={44} radius={12} />
                <div className="flex flex-1 flex-col gap-2">
                  <Skeleton width="60%" height={15} />
                  <Skeleton width="40%" height={12} />
                </div>
              </div>
              <div className="mt-4 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <Skeleton width="30%" height={12} />
                  <Skeleton width={70} height={12} />
                </div>
                <div className="flex items-center justify-between">
                  <Skeleton width="35%" height={12} />
                  <Skeleton width={70} height={12} />
                </div>
              </div>
            </SkeletonCard>
          ))}
        </div>
      </ReadingColumn>
    </SkeletonRegion>
  )
}
