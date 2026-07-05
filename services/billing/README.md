# @ortho/billing-core

Extraction-ready subscription billing core. This package is designed to be lifted into its own
repository and reused across applications — Ortho is its first consumer, not its owner.

## The extraction contract (binding)

- **Zero runtime dependencies.** `dependencies` stays empty; only dev tooling may be added.
- **Zero host imports.** Nothing under `src/` may import from `web/`, `iOS/`, `supabase/`, or any
  Ortho-specific module. The `tsconfig.json` compiles with `"lib": ["ES2022"]` and `"types": []`
  precisely so DOM/Node/Deno globals fail the typecheck — the core must run unchanged in any
  JS runtime (Node, Deno edge functions, browsers, tests).
- **Providers end at the adapter.** Everything Stripe-specific lives in `src/stripe.ts` and stops
  at `NormalizedBillingEvent` (`src/normalize.ts`). A future Apple/StoreKit adapter emits the same
  shape; `src/machine.ts` and `src/derive.ts` must never learn provider names beyond the
  `provider` tag.
- **No I/O.** The core is pure functions over plain data: payloads in, rows/decisions out.
  Persistence, HTTP, SDKs, and secrets belong to the host (Ortho: Supabase Edge Functions in
  `supabase/functions/`, which consume this package via the committed byte-copy in
  `supabase/functions/_shared/billing/` — regenerate with `npm run sync:functions`; the
  `test/shared-sync.test.ts` drift lock keeps the copy honest).

## Layout

| File | Role |
|---|---|
| `src/states.ts` | Status/gate types + the binding constants (`LEEWAY_HOURS`, `DUNNING_GRACE_DAYS`, `TRIAL_DAYS`) |
| `src/derive.ts` | `deriveGateState(row, nowIso)` — the client-mirrored gate derivation (see `specs/018-subscription-system/contracts/entitlement-state.md`) |
| `src/normalize.ts` | `NormalizedBillingEvent` + guard pipeline (dedup is the host's job; staleness & admin-wins are here) |
| `src/machine.ts` | `applyBillingEvent(row, event)` — provider-agnostic transitions |
| `src/stripe.ts` | Stripe payload → `NormalizedBillingEvent` translator (pure; no SDK) |

## Tests

`npm test` — Vitest. The derivation literal vectors (V01–V19 + digest) are shared verbatim with
`web/lib/entitlements.ts` and `iOS/Ortho-iOS/Shared/EntitlementLogic.swift`; change them only by
amending the contract in `specs/018-subscription-system/contracts/entitlement-state.md` first.
