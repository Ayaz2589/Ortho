import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

// Split-integrity guard (spec 022, US1 / T007): recharts is the heaviest dependency
// in the app and MUST only ever be reached through next/dynamic, so it leaves the
// initial-load chunk. It may be statically imported ONLY inside the dynamically-loaded
// leaves under components/**/charts/. Any other eager `import … from 'recharts'` would
// silently pull recharts back into a route's initial-load bundle — this test fails if so.

const WEB_ROOT = fileURLToPath(new URL('../../', import.meta.url))
const EAGER_DIRS = ['components/dashboard', 'components/housing']

function tsxFilesExcludingCharts(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'charts') continue // the ONLY place recharts may be imported
      out.push(...tsxFilesExcludingCharts(p))
    } else if (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts')) {
      out.push(p)
    }
  }
  return out
}

const IMPORTS_RECHARTS = /from\s+['"]recharts['"]/

describe('recharts is never eagerly imported (spec 022 US1 guard)', () => {
  for (const dir of EAGER_DIRS) {
    it(`no eager module under ${dir} statically imports recharts`, () => {
      const offenders = tsxFilesExcludingCharts(join(WEB_ROOT, dir))
        .filter((f) => IMPORTS_RECHARTS.test(readFileSync(f, 'utf8')))
        .map((f) => f.slice(WEB_ROOT.length))
      expect(offenders).toEqual([])
    })
  }

  it('the charts/ leaves DO import recharts (proving the import moved, not vanished)', () => {
    const leaves = [
      'components/dashboard/charts/CategoryPie.tsx',
      // DailyTrendChart removed in spec 034 (its only consumer, the overview
      // DailySpendTrendCard, was replaced by the widget framework).
      'components/dashboard/charts/SavingsRateChart.tsx',
      'components/housing/charts/AmortizationChart.tsx',
    ]
    const importers = leaves.filter((rel) => {
      try {
        return IMPORTS_RECHARTS.test(readFileSync(join(WEB_ROOT, rel), 'utf8'))
      } catch {
        return false
      }
    })
    expect(importers.sort()).toEqual(leaves.sort())
  })
})
