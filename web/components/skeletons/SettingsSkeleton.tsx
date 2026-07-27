'use client'

import { Card } from '@/components/ui'
import { Skeleton } from '@/components/ui/Skeleton'
import { ReadingColumn } from '@/components/layout'
import { SkeletonRegion } from './SkeletonRegion'

/** Settings skeleton (spec 032) — a fixed shape: header + a few section cards,
 *  each holding several link-row placeholders. The section list is
 *  data-independent, so no remembered count is needed. */
const SECTIONS = [5, 3, 2] // link rows per section card, matching the real groups

export function SettingsSkeleton() {
  return (
    <SkeletonRegion testId="skeleton-settings">
      <ReadingColumn>
        <div className="pt-2">
          <Skeleton width={110} height={24} />
        </div>
        <div className="mt-4 flex flex-col gap-6">
          {SECTIONS.map((rows, s) => (
            <Card key={s}>
              {Array.from({ length: rows }).map((_, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between px-4 py-3.5"
                  style={i > 0 ? { borderTop: '0.5px solid var(--hairline)' } : undefined}
                >
                  <Skeleton width="35%" height={14} />
                  <Skeleton width={16} height={16} radius="full" />
                </div>
              ))}
            </Card>
          ))}
        </div>
      </ReadingColumn>
    </SkeletonRegion>
  )
}
