// Per-section reconciliation: the sum of parsed rows in a section MUST equal the
// statement's printed Subtotal. A mismatch is the engine's strongest correctness
// guarantee against grouping/extraction errors and BLOCKS import (FR-009).
import type { ParsedSection, ReconResult } from './types'

export function reconcile(sections: ParsedSection[]): ReconResult {
  const detail = sections.map((s) => {
    const computedCents = s.rows.reduce((sum, r) => sum + r.amountCents, 0)
    return {
      name: s.name,
      expectedCents: s.printedSubtotalCents,
      computedCents,
      ok: computedCents === s.printedSubtotalCents,
    }
  })
  return { ok: detail.every((d) => d.ok), sections: detail }
}
