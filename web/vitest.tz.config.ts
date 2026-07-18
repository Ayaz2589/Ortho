import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

// Timezone-reproduction config (spec 026, defect A2). The default vitest.config.ts
// pins TZ=UTC — which is exactly what hides the insight month-bucketing bug from
// CI. This config runs ONLY the *.tz.test.ts files under a non-UTC zone so the
// timezone-dependent misbucketing is observable and locked. Set before any Date
// math runs; workers inherit the main process env.
process.env.TZ = 'America/New_York'

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['test/**/*.tz.test.ts'],
    setupFiles: ['./test/setup.ts'],
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 20000,
  },
})
