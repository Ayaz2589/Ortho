import { roundHalfAwayFromZero } from './money'

/**
 * A branded integer representing whole US cents — the compile-time expression of
 * Ortho's storage invariant (all money is integer USD cents; see
 * `docs/finance.md` §2). `Cents` is a *subtype* of `number`, so it is freely
 * assignable to any `number` parameter — introducing it therefore does NOT ripple
 * through existing call sites. The value it adds is the other direction: a plain
 * `number` (e.g. a dollars amount) is NOT assignable to a `Cents` parameter, so a
 * new code path that requires `Cents` is caught at compile time, and the
 * constructors below reject non-integer cents at runtime.
 *
 * Adoption is opt-in: reach for `Cents` at money boundaries in new code; there is
 * deliberately no mass migration of the existing `number`-typed signatures (that
 * would be a separate, larger change — see spec 025 scope).
 */
export type Cents = number & { readonly __cents: unique symbol }

/** True iff `n` is a finite integer — the runtime shape of a valid cents value. */
export function isCents(n: number): n is Cents {
  return Number.isInteger(n)
}

/**
 * Assert `n` is a whole-cent integer and return it branded as `Cents`. Throws on
 * a non-integer, NaN, or Infinity — the cases a silent `number` would let slip.
 */
export function assertCents(n: number): Cents {
  if (!isCents(n)) {
    throw new RangeError(`Expected whole USD cents (a finite integer), received ${n}`)
  }
  return n
}

/** Construct `Cents` from a value already in cents, validating it is an integer. */
export function toCents(n: number): Cents {
  return assertCents(n)
}

/**
 * Construct `Cents` from a dollars amount, rounding to whole cents half away from
 * zero (the same rule the rest of the money layer uses, so conversions agree on
 * every tie). `$12.99 → 1299`, `-$0.005 → -1`.
 */
export function centsFromDollars(dollars: number): Cents {
  return roundHalfAwayFromZero(dollars * 100) as Cents
}
