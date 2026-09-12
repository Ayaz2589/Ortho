/**
 * Edge-anchored positioning for markers placed along a track (spec 058).
 *
 * A marker positioned with `left: <pct>%` + `transform: translateX(-50%)` is
 * centred on its point — so at pct=0 half of it hangs off the left edge of the
 * track, and at pct=100 half hangs off the right. That overhang widens the
 * marker's container, and inside a panel or card on a phone it is enough to
 * force the whole surface to pan sideways.
 *
 * Anchoring instead of centring removes the overhang without measuring
 * anything at runtime: shift the marker by -pct% of its OWN width. It reads
 * flush-left at the start of the track, centred at the middle, and flush-right
 * at the end — and for a marker of width `w` on a track of width `W` its left
 * edge lands at `(pct/100) * (W - w)`, which is inside `[0, W - w]` for every
 * width and every position. No marker can ever cross an edge.
 */

/** The translateX percentage (of the marker's own width) for a track position. */
export function edgeAnchoredShiftPct(leftPct: number): number {
  // A non-finite position has no meaningful anchor; fall back to centred, which
  // is what the caller would otherwise have hard-coded.
  if (!Number.isFinite(leftPct)) return -50
  const clamped = Math.min(100, Math.max(0, leftPct))
  // Return +0 rather than -0 at the left edge so the value compares equal to 0.
  return clamped === 0 ? 0 : -clamped
}

/** The same shift as a ready-to-use CSS `transform` value. */
export function edgeAnchoredTransform(leftPct: number): string {
  const shift = edgeAnchoredShiftPct(leftPct)
  // Two decimals keeps sub-pixel accuracy without emitting float noise.
  const rounded = Math.round(shift * 100) / 100
  return `translateX(${rounded}%)`
}
