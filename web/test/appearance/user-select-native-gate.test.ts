import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// B8 (spec 023): the iOS long-press text-selection / callout suppression must
// apply ONLY on the native shell. On the browser build (same static bundle)
// users must be able to select and copy amounts and merchant names, so the
// `-webkit-user-select: none` shell rule must be scoped to `html.native`,
// never a bare `html` selector.
const CSS = readFileSync(fileURLToPath(new URL('../../app/globals.css', import.meta.url)), 'utf8')

describe('B8: shell text-selection suppression is native-only', () => {
  it('scopes the shell user-select disable to html.native', () => {
    expect(/html\.native\s*\{[^}]*-webkit-user-select:\s*none/.test(CSS)).toBe(true)
  })

  it('does not disable user-select on a bare html selector (web keeps selection)', () => {
    expect(/^html\s*\{[^}]*-webkit-user-select:\s*none/m.test(CSS)).toBe(false)
  })
})
