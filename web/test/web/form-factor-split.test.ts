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

// Spec 025 — the dedicated MOBILE new/edit pages must never pull the desktop
// tray/composition code into their bundle: they render the shared form body only.
const MOBILE_FORM_PAGES = [
  'app/(app)/transactions/new/page.tsx',
  'app/(app)/transactions/edit/page.tsx',
  'app/(app)/housing/new/page.tsx',
  'app/(app)/housing/edit/page.tsx',
]

describe('mobile new/edit pages never import desktop compositions (spec 025)', () => {
  for (const page of MOBILE_FORM_PAGES) {
    it(`${page} references no *Desktop composition and self-guards on the breakpoint`, () => {
      const src = read(page)
      expect(/TransactionsDesktop|HousingDesktop/.test(src)).toBe(false)
      // Desktop keeps its tray, so each page must guard the breakpoint — directly
      // via useIsExpanded or through the shared useMobileFormPage hook.
      expect(/useIsExpanded|useMobileFormPage/.test(src)).toBe(true)
    })
  }
})
