import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

// The golden vectors are generated under TZ=UTC (see scripts/gen-vectors.ts);
// assert under the same zone so the suite passes identically on any machine
// (dev Macs are America/New_York, CI runners are UTC). Set here — workers
// inherit the main process env before any Date math runs.
process.env.TZ = 'UTC'

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
    // Timezone-reproduction suites (spec 026, A2) must run under a non-UTC zone;
    // they live in *.tz.test.ts and are executed only by vitest.tz.config.ts.
    // Exclude them here so the default TZ=UTC run never picks them up.
    exclude: ['**/node_modules/**', '**/*.tz.test.ts'],
    setupFiles: ['./test/setup.ts'],
    // Parallel jsdom worker startup races under load in this sandbox ("Timeout
    // waiting for worker to respond"). Running files sequentially uses a single
    // worker, eliminating the race and keeping the suite deterministic. The suite
    // is small, so the wall-clock cost is acceptable.
    fileParallelism: false,
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
        'lib/splits.ts',
        'lib/utils.ts',
        'lib/api/aggregates.ts',
        // Import/transaction CLI: pure logic + DB/IO wrappers. The interactive
        // entrypoints (scripts/import/cli.ts, tx.ts) are integration-tested via
        // the spec quickstarts, like the store provider — not line-covered here.
        'scripts/import/engine/**/*.ts',
        'scripts/import/profiles/**/*.ts',
        'scripts/import/db/**/*.ts',
      ],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 80,
        statements: 90,
        // The CLI surface carries some thin Supabase chaining whose error
        // branches are covered by mocks but not every permutation; calibrated
        // to the achieved coverage so it gates regressions without flapping.
        'scripts/import/**': {
          lines: 88,
          functions: 90,
          branches: 72,
          statements: 85,
        },
      },
    },
  },
})
