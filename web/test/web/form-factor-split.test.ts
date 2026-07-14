import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Split-integrity guard (spec 022, US3 / T015): each master–detail route must load its
// desktop-only composition via next/dynamic, so a mobile/iOS session never downloads the
// desktop composition (and vice-versa). The synchronous useIsExpanded() decision is
// preserved (still imported) so the correct branch is chosen before paint — no
// wrong-layout flash. Behavior of the compositions themselves is covered by
// test/desktop-parity.test.tsx (which imports them directly, unaffected by this split).

const ROUTES: Array<{ page: string; desktop: string }> = [
  { page: 'app/(app)/dashboard/page.tsx', desktop: 'DashboardDesktop' },
  { page: 'app/(app)/transactions/page.tsx', desktop: 'TransactionsDesktop' },
  { page: 'app/(app)/housing/page.tsx', desktop: 'HousingDesktop' },
]

function read(rel: string): string {
  return readFileSync(fileURLToPath(new URL('../../' + rel, import.meta.url)), 'utf8')
}

describe('desktop compositions are dynamically imported per route (spec 022 US3 guard)', () => {
  for (const { page, desktop } of ROUTES) {
    it(`${page} does not statically import ${desktop}`, () => {
      const src = read(page)
      const staticImport = new RegExp(`import\\s*\\{[^}]*\\b${desktop}\\b[^}]*\\}\\s*from`)
      expect(staticImport.test(src)).toBe(false)
    })

    it(`${page} loads ${desktop} via next/dynamic and keeps the synchronous useIsExpanded gate`, () => {
      const src = read(page)
      expect(/from ['"]next\/dynamic['"]/.test(src)).toBe(true)
      expect(new RegExp(`import\\([^)]*${desktop}[^)]*\\)`).test(src)).toBe(true)
      expect(/useIsExpanded/.test(src)).toBe(true)
    })
  }
})
