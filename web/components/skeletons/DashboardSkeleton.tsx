'use client'

import { Card } from '@/components/ui'
import { Skeleton } from '@/components/ui/Skeleton'
import { SkeletonRegion } from './SkeletonRegion'

/** Dashboard skeleton (spec 032) — fixed shape mirroring the widget stack:
 *  header + range pill, a tall month-summary card, then a set of widget cards.
 *  Width-capped like the real dashboard grid. */
export function DashboardSkeleton() {
  return (
    <SkeletonRegion testId="skeleton-dashboard" className="mx-auto w-full max-w-[1080px]">
      <div className="flex items-center justify-between pt-2">
        <Skeleton width={130} height={24} />
        <Skeleton width={120} height={32} radius="full" />
      </div>

      {/* month summary headline card */}
      <Card className="mt-4 p-5">
        <Skeleton width={90} height={12} />
        <div className="mt-3">
          <Skeleton width={180} height={30} />
        </div>
        <div className="mt-4 flex gap-6">
          <Skeleton width={100} height={14} />
          <Skeleton width={100} height={14} />
        </div>
      </Card>

      {/* widget cards */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="p-5">
            <Skeleton width={120} height={12} />
            <div className="mt-4 flex flex-col gap-3">
              {Array.from({ length: 3 }).map((_, j) => (
                <div key={j} className="flex items-center justify-between gap-3">
                  <Skeleton width="45%" height={13} />
                  <Skeleton width={56} height={13} />
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </SkeletonRegion>
  )
}
