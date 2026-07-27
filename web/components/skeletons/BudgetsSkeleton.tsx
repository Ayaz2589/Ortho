'use client'

import { Card } from '@/components/ui'
import { Skeleton } from '@/components/ui/Skeleton'
import { ReadingColumn } from '@/components/layout'
import { CATEGORY_GROUPS } from '@/lib/categories'
import { SkeletonRegion } from './SkeletonRegion'

/** Budgets skeleton (spec 032) — a fixed shape: one group caption + a card of
 *  rows per expense category group. The number of groups is data-independent
 *  (`CATEGORY_GROUPS.expense`), so no remembered count is needed. */
export function BudgetsSkeleton() {
  return (
    <SkeletonRegion testId="skeleton-budgets">
      <ReadingColumn>
        <div className="pt-2">
          <Skeleton width={80} height={14} />
        </div>
        <div className="mt-3">
          <Skeleton width={110} height={24} />
        </div>
        <div className="mt-4 flex flex-col gap-4">
          {CATEGORY_GROUPS.expense.map((group) => (
            <div key={group.key}>
              <div className="px-1 pb-2">
                <Skeleton width={120} height={11} />
              </div>
              <Card>
                {group.children.slice(0, 3).map((child, i) => (
                  <div
                    key={child}
                    className="flex items-center justify-between px-4 py-3"
                    style={i > 0 ? { borderTop: '0.5px solid var(--hairline)' } : undefined}
                  >
                    <Skeleton width="40%" height={13} />
                    <Skeleton width={64} height={13} />
                  </div>
                ))}
              </Card>
            </div>
          ))}
        </div>
      </ReadingColumn>
    </SkeletonRegion>
  )
}
