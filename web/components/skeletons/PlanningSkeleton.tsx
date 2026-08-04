'use client'

import { Skeleton } from '@/components/ui/Skeleton'
import { SkeletonRegion } from './SkeletonRegion'

/** Planning hub skeleton (spec 038) — a fixed shape mirroring the hub: title +
 *  month bar, the "Left to plan" hero, and two summary-card placeholders. Static
 *  (no shimmer), token-only. */
export function PlanningSkeleton() {
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
      {/* summary cards */}
      <div className="mt-6 flex flex-col gap-5">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-hairline p-4">
            <Skeleton width="30%" height={13} />
            <div className="mt-4 flex flex-col gap-3">
              <Skeleton height={12} />
              <Skeleton width="70%" height={12} />
            </div>
          </div>
        ))}
      </div>
    </SkeletonRegion>
  )
}
