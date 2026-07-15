import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// B4 z-order guard (spec 023 review): the biometric lock overlay in
// app/(app)/layout.tsx no longer unmounts the app subtree — it renders as a fixed
// OPAQUE overlay ABOVE a kept-mounted provider. But the app's dialogs (drawers,
// scrims, modals) portal to document.body and paint against the ROOT stacking
// context, so a lock overlay at a lower z-index would let an open dialog's
// household data render ON TOP of the lock screen (defeating FR-011). The overlay
// must therefore sit strictly above every portaled dialog layer. This scans the
// sources so the invariant can't silently regress (the gate is native-only, so a
// jsdom render can't assert stacking).

const WEB_ROOT = fileURLToPath(new URL('../../', import.meta.url))

/** Tailwind z-index utilities: `z-50` and `z-[200]`. */
function tailwindZ(src: string): number[] {
  const out: number[] = []
  for (const m of src.matchAll(/\bz-\[(\d+)\]/g)) out.push(Number(m[1]))
  for (const m of src.matchAll(/\bz-(\d+)\b/g)) out.push(Number(m[1]))
  return out
}

/** CSS `z-index: N` declarations. */
function cssZ(src: string): number[] {
  return [...src.matchAll(/z-index:\s*(\d+)/g)].map((m) => Number(m[1]))
}

const layoutSrc = readFileSync(join(WEB_ROOT, 'app/(app)/layout.tsx'), 'utf8')
// The lock overlay is the only `fixed inset-0 z-…` element in the layout
// (Shell's error banner is `sticky top-0 z-40`).
const overlayMatch = layoutSrc.match(/fixed inset-0 z-\[?(\d+)\]?/)

// The portaled dialog layers that escape the app's flow (attach to
// document.body): the drawers/scrims/modals defined in globals.css and the
// mobile Modal in components/ui.tsx (createPortal → body, z-50).
const globalsZ = cssZ(readFileSync(join(WEB_ROOT, 'app/globals.css'), 'utf8'))
const modalZ = tailwindZ(readFileSync(join(WEB_ROOT, 'components/ui.tsx'), 'utf8'))

describe('B4: the biometric lock overlay sits above every portaled dialog layer', () => {
  it('layout.tsx exposes a single fixed-overlay z-index', () => {
    expect(overlayMatch, 'lock overlay `fixed inset-0 z-…` not found in layout.tsx').not.toBeNull()
  })

  it('the overlay z-index is strictly greater than every dialog/scrim/modal z-index', () => {
    const overlayZ = Number(overlayMatch![1])
    const maxDialogZ = Math.max(...globalsZ, ...modalZ)
    // e.g. .ow-scrim (WebModal/ScanFlow) is 100; the overlay must beat it so an
    // open dialog can never paint over the lock screen.
    expect(
      overlayZ,
      `lock overlay z-index (${overlayZ}) must exceed the highest dialog z-index (${maxDialogZ})`
    ).toBeGreaterThan(maxDialogZ)
  })
})
