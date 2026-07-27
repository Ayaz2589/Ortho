'use client'

import { Skeleton } from '@/components/ui/Skeleton'
import { SkeletonRegion, atLeastOne } from './SkeletonRegion'

/** One ledger-row placeholder: category tile · merchant + meta · amount —
 *  mirroring `components/transactions/TransactionRow.tsx`. */
function RowSkeleton() {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Skeleton width={42} height={42} radius={12} />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <Skeleton width="55%" height={13} />
        <Skeleton width="35%" height={11} />
      </div>
      <Skeleton width={64} height={14} />
    </div>
  )
}

/**
 * Ledger skeleton (spec 032). Renders `count` transaction-row placeholders under
 * a couple of day-header stubs, sized from the previous successful load. Shape
 * matches both the mobile ledger and the desktop table's row rhythm closely
 * enough that content swaps in without a jump.
 */
export function TransactionsSkeleton({ count = 8 }: { count?: number }) {
  const rows = atLeastOne(count)
  // Break the run with a day header roughly every 5 rows, like grouped days.
  return (
    <SkeletonRegion testId="skeleton-transactions" className="mx-auto w-full max-w-[860px]">
      {/* header: title + search field */}
      <div className="flex items-center justify-between px-4 pt-2">
        <Skeleton width={140} height={22} />
        <Skeleton width={40} height={40} radius="full" />
      </div>
      <div className="px-4 pt-4">
        <Skeleton height={38} radius={12} />
      </div>
      <div className="mt-4 flex flex-col">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i}>
            {i % 5 === 0 && (
              <div className="px-4 pb-1 pt-3">
                <Skeleton width={90} height={11} />
              </div>
            )}
            <RowSkeleton />
          </div>
        ))}
      </div>
    </SkeletonRegion>
  )
}
