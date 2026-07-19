import { describe, expect, it, test } from 'vitest'
import { formatMoney, toDisplayAmount, toUSDCents } from '@/lib/finance/money'

/**
 * RED reproduction test — Multi-currency accounting strategy (a decision).
 * Spec: specs/027-multi-currency-strategy/ (contracts/reproduction-test.md).
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * Every amount is stored as integer USD cents: at entry a native amount is
 * converted to USD cents with `toUSDCents(amount, currency, rateAtEntry)` and the
 * native figure is DISCARDED; at display the cents are converted back with
 * `toDisplayAmount(cents, currency, rateNow)`. Entry divides by the entry-rate;
 * display multiplies by the *current* rate. When the rate moves between entry and
 * view, the reconstructed native amount differs from what the user typed — a
 * non-USD household's historical totals silently shift ("why did my March
 * groceries change?"). Storing USD cents is also lossy on the round trip even at a
 * fixed rate (it re-rounds through cents; JPY can't be represented at all).
 *
 * This is a *decision* with a large implementation tail. The fix (a native-currency
 * ledger — "option b") is deliberately deferred and research-gated (see the spec).
 * So the drift cases below assert the TARGET invariant a correct ledger guarantees
 * (a recorded native amount re-reads unchanged) and are wrapped in Vitest's
 * `test.fails` — they DESCRIBE the intended behavior test-first while documenting
 * that today's model violates it. The suite is green precisely *because* the drift
 * exists; if someone builds option (b), these flip red and force this spec to be
 * revisited. The USD control (rate = 1.0) is a normal passing assertion, proving
 * the demonstration is real and not tautological.
 *
 * Numbers are pinned against web/lib/finance/money.ts (see research.md §Verification).
 * This test reads the money layer and changes nothing — no source, no vectors.
 */

/** Record a native amount at one rate (→ USD cents, native discarded), then read it back at another. */
function recordThenView(native: number, currency: 'usd' | 'cad' | 'gbp' | 'eur' | 'jpy' | 'cny' | 'bdt', rateAtEntry: number, rateNow: number): number {
  const storedUsdCents = toUSDCents(native, currency, rateAtEntry)
  return toDisplayAmount(storedUsdCents, currency, rateNow)
}

describe('Multi-currency instability — historical figures drift as FX moves (RED evidence)', () => {
  // Case 1 — rate-movement drift (the headline bug). CA$100.00 recorded in March at
  // 1 USD = 1.35 CAD is stored as 7407 USD cents; viewed in July at 1.40 it reads
  // CA$103.70. The user changed nothing; the number moved +CA$3.70 because FX moved.
  // TARGET: a recorded CA$100.00 must still read CA$100.00. FAILS today (reads 103.70).
  test.fails('a CA$100.00 expense re-reads as CA$100.00 after the CAD rate moves 1.35 → 1.40', () => {
    expect(recordThenView(100, 'cad', 1.35, 1.4)).toBe(100)
    // Today: toUSDCents(100,'cad',1.35)=7407 ; toDisplayAmount(7407,'cad',1.40)=103.70 → drift +3.70
  })

  // Case 2 — the drift compounds across a category total. Three March expenses the
  // user entered as CA$100.00 + CA$250.00 + CA$37.55 = CA$387.55 are stored as
  // 7407 + 18519 + 2781 = 28707 USD cents and re-read at 1.40 as CA$401.90 (+14.35).
  // TARGET: the category total stays CA$387.55. FAILS today.
  test.fails('a CA$387.55 category total re-reads as CA$387.55 after the CAD rate moves', () => {
    const entered = [100, 250, 37.55]
    const storedCents = entered.reduce((sum, n) => sum + toUSDCents(n, 'cad', 1.35), 0)
    expect(toDisplayAmount(storedCents, 'cad', 1.4)).toBe(387.55)
    // Today: stored 28707 cents ; view @1.35 = 387.54 (already −0.01) ; view @1.40 = 401.90 (+14.35)
  })

  // Case 3 — rounding-through-USD loss, INDEPENDENT of any rate movement. Routing a
  // native amount through USD cents and back is lossy even at the SAME rate, because
  // the USD-cent snapshot can't represent the native amount exactly (JPY especially:
  // 0 fraction digits vs. a cent-resolution snapshot). TARGET: same-rate round trip
  // is lossless. FAILS today (CA$100.00 → CA$99.99 ; ¥1000 → ¥1001).
  test.fails('round-tripping through USD cents at a FIXED rate is lossless (CAD and JPY)', () => {
    expect(recordThenView(100, 'cad', 1.35, 1.35)).toBe(100) // today: 99.99
    expect(recordThenView(1000, 'jpy', 150, 150)).toBe(1000) // today: 1001
  })

  // Case 4 — USD control. At rate = 1.0 the entry and display conversions are exact
  // inverses: there is ZERO drift. This is why option (a) — launch US/USD-only — is a
  // real option, not a workaround: the current model is correct for the USD audience.
  // Normal passing assertion (proves the drift cases above aren't tautological).
  it('USD households have ZERO drift (rate = 1.0 round-trips exactly)', () => {
    expect(recordThenView(100, 'usd', 1, 1)).toBe(100)
    expect(recordThenView(1234.56, 'usd', 1, 1)).toBe(1234.56)
    // And the formatted string is stable too:
    expect(formatMoney(toUSDCents(100, 'usd', 1), 'usd', 1)).toBe('$100.00')
  })

  // Documentary control: the SAME stored cents formatted at the two rates yields two
  // different CAD strings — the visible face of the bug. This one PASSES today (it
  // asserts that the drift is present), so it stays a normal `it`.
  it('the same stored CAD amount renders as two different figures at two rates (the visible bug)', () => {
    const stored = toUSDCents(100, 'cad', 1.35) // 7407 USD cents
    expect(formatMoney(stored, 'cad', 1.35)).toBe('CA$99.99')
    expect(formatMoney(stored, 'cad', 1.4)).toBe('CA$103.70')
  })
})
