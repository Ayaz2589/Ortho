'use client'

import { Skeleton } from '@/components/ui/Skeleton'
import { SkeletonRegion, atLeastOne } from './SkeletonRegion'

/**
 * Loading placeholder for a Reports view (spec 032, US3). Rendered inside the
 * view's existing `Card` + `SectionLabel`, so it only draws the chart area and a
 * ranked-row list — sized from the previous successful fetch. Replaces the inline
 * "Loading…" text; error/empty states are handled by the view unchanged.
 */
export function ReportsSkeleton({
  rows = 6,
  testId,
}: {
  rows?: number
  testId: string
}) {
  const n = atLeastOne(rows)
  return (
    <SkeletonRegion testId={testId}>
      {/* chart area */}
      <div className="mt-3">
        <Skeleton height={160} radius={16} />
      </div>
      {/* ranked legend/rows */}
      <div className="mt-2 flex flex-col">
        {Array.from({ length: n }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 py-2.5">
            <Skeleton width={28} height={28} radius="full" />
            <Skeleton width="40%" height={13} />
            <div className="ml-auto flex items-center gap-3">
              <Skeleton width={36} height={12} />
              <Skeleton width={64} height={13} />
            </div>
          </div>
        ))}
      </div>
    </SkeletonRegion>
  )
}
