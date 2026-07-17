// Per-section reconciliation: the (net) sum of parsed rows in a section MUST
// equal the statement's printed Subtotal. A mismatch is the engine's strongest
// correctness guarantee against grouping/extraction errors and BLOCKS import
// (FR-009).
//
// Row amounts are always non-negative; the sign comes from the row's `kind`
// relative to the section's primary `kind`. Profiles keep an in-section return
// (a credit inside a charges section) as an income row, while the printed
// subtotal ("Total charges, credits and returns" on Apple, "Total New Charges"
// on Amex) is the NET. So a row that shares the section's kind ADDS and an
// out-of-kind row SUBTRACTS — otherwise any statement with a refund would fail
// reconciliation and block the whole month's import.
import type { ParsedSection, ReconResult } from './types'

export function reconcile(sections: ParsedSection[]): ReconResult {
  const detail = sections.map((s) => {
    const computedCents = s.rows.reduce(
      (sum, r) => sum + (r.kind === s.kind ? r.amountCents : -r.amountCents),
      0,
    )
    return {
      name: s.name,
      expectedCents: s.printedSubtotalCents,
      computedCents,
      ok: computedCents === s.printedSubtotalCents,
    }
  })
  return { ok: detail.every((d) => d.ok), sections: detail }
}
