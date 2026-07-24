// Vitest global setup. Applies to every suite (node + jsdom).
// jest-dom matchers are safe to register in node; RTL cleanup only runs when a
// DOM is present (jsdom suites), so node logic suites pay nothing.
import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'

// jsdom does not implement matchMedia; components that read prefers-color-scheme
// (appearance / applyAppearance) need it. Provide a minimal light-mode stub as a
// fallback — suites that assert theme behavior override window.matchMedia in their
// own setup, which runs after this and wins.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia
}

// jsdom does not implement IntersectionObserver; scroll-spy components (e.g.
// SettingsSecondaryNav) construct one in a client effect. Real browsers always
// have it, so provide a no-op stub for the test DOM.
if (typeof globalThis !== 'undefined' && !('IntersectionObserver' in globalThis)) {
  class IntersectionObserverStub {
    root = null
    rootMargin = ''
    thresholds: number[] = []
    constructor(_cb: IntersectionObserverCallback, _opts?: IntersectionObserverInit) {}
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords(): IntersectionObserverEntry[] {
      return []
    }
  }
  globalThis.IntersectionObserver = IntersectionObserverStub as unknown as typeof IntersectionObserver
}

afterEach(async () => {
  if (typeof document !== 'undefined') {
    const { cleanup } = await import('@testing-library/react')
    cleanup()
  }
  // Keep sessionStorage-backed state (e.g. the persisted CSV import session) from
  // leaking between tests in the same jsdom file.
  if (typeof sessionStorage !== 'undefined') sessionStorage.clear()
})
