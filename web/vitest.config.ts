import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  // Resolve the app's `@/` alias (tsconfig paths) for tests.
  resolve: {
    alias: { '@': fileURLToPath(new URL('./', import.meta.url)) },
  },
  test: {
    // Default to fast node for pure-logic suites; component/store suites opt into
    // jsdom per-file with `// @vitest-environment jsdom`.
    environment: 'node',
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
    setupFiles: ['./test/setup.ts'],
    // The `forks` pool's worker startup races under parallel jsdom init in this
    // sandbox ("Timeout waiting for worker to respond"); the `threads` pool starts
    // workers faster and runs the jsdom suites in parallel reliably.
    pool: 'threads',
    testTimeout: 20000,
    hookTimeout: 20000,
    coverage: {
      provider: 'v8',
      // Scope coverage to the pure business logic the suite is responsible for.
      // View components and the store provider are tested behaviorally, not for
      // line coverage (see spec assumptions).
      include: [
        'lib/finance/money.ts',
        'lib/finance/currency.ts',
        'lib/finance/mortgage.ts',
        'lib/finance/insights.ts',
        'lib/format.ts',
        'lib/categories.ts',
        'lib/utils.ts',
        'lib/api/aggregates.ts',
      ],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 80,
        statements: 90,
      },
    },
  },
})
