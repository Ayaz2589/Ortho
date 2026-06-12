// Vitest global setup. Applies to every suite (node + jsdom).
// jest-dom matchers are safe to register in node; RTL cleanup only runs when a
// DOM is present (jsdom suites), so node logic suites pay nothing.
import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'

afterEach(async () => {
  if (typeof document !== 'undefined') {
    const { cleanup } = await import('@testing-library/react')
    cleanup()
  }
})
