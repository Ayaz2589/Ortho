/**
 * The kill switch for spec 018's subscription system.
 *
 * Ortho ships a Stripe subscription with a 31-day free month and a blocking paywall for
 * lapsed users. This flag turns that OFF for everyone — no paywall, no subscription UI,
 * and no entitlement traffic at all — while leaving every piece of the machinery in place.
 *
 * ## Why a flag and not a deletion
 *
 * "For the time being" is the whole requirement: the Stripe integration (edge functions,
 * webhooks, `services/billing`, the `entitlements` table and its `ensure_entitlement` RPC)
 * is expensive, correct, and contract-locked. Deleting it would mean rebuilding it — and
 * re-earning its review — to charge anyone again. Flipping this constant back to `true` is
 * the entire re-enable procedure.
 *
 * ## What is deliberately NOT touched
 *
 * - `lib/entitlements.ts` — `deriveGateState` is hand-mirrored from
 *   `services/billing/src/derive.ts` and locked by the literal vectors V01–V19 + digest in
 *   `specs/018-subscription-system/contracts/entitlement-state.md`. Gating it here would
 *   break that mirror. The switch sits ABOVE the pure function, never inside it.
 * - The server: edge functions, the webhook, and the `entitlements` table keep working, so
 *   an operator's existing Stripe subscriptions are neither cancelled nor corrupted while
 *   the app ignores them.
 *
 * ## How "off" is expressed
 *
 * As a **null gate**, which is a state spec 018 already defines and tests: FR-008 requires
 * that an entitlement the client could not load leaves the shell OPEN, because a false
 * paywall is the worst failure mode. Disabling reuses that path rather than inventing a
 * new one — `store.tsx` forces `gateState` to null, and both gated surfaces already treat
 * null as "show nothing": the Shell renders `children` instead of `<Paywall/>`, and
 * `SubscriptionSection` returns null.
 *
 * Tests that assert the subscription machinery still works (so that re-enabling is safe)
 * mock this module to `true`. See `test/subscriptions-disabled.test.tsx` for the
 * disabled-path assertions.
 */
export const SUBSCRIPTION_ENABLED = false
