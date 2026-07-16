# Data Model: Subscription System (spec 018)

Migration: `supabase/migrations/20260716130000_subscription_entitlements.sql`
(house ordering: enums → tables → indexes → RLS enable → policies → RPCs).
**Zero changes to existing tables/enums/policies** (FR-030).

## 1. Enums

```sql
create type public.entitlement_status as enum (
  'trialing',   -- app-administered free month (D4); no Stripe objects exist
  'active',     -- paying subscription in good standing
  'past_due',   -- renewal failed; provider retrying (dunning). Access retained (D8)
  'paused',     -- provider-paused; not expected in v1 flows (no Stripe trials) but mapped
  'unpaid',     -- provider gave up, configured to mark unpaid. No access
  'canceled',   -- subscription ended/will end; access until access_expires_at (paid-through)
  'admin'       -- operator-granted bypass; never expires; events never downgrade it (D5)
);

create type public.billing_plan as enum ('monthly', 'yearly');
```

Stored status is **provider-shaped**; what the UI gates on is the **derived** gate state
(§5) — the two must never be conflated.

## 2. Table: `public.entitlements`

One row per user. The single source of truth for every surface (FR-016).

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `user_id` | `uuid` | PK; FK → `public.users(id)` on delete cascade | one row per person, never per household |
| `status` | `entitlement_status` | not null, default `'trialing'` | |
| `access_expires_at` | `timestamptz` | null | **NULL = never expires** (admin). Trial: `created_at + 31 days`. Paid: provider period end (raw — leeway is applied at derivation, one place only) |
| `plan` | `billing_plan` | null | null while trialing/admin |
| `source` | `text` | not null, default `'trial'`, check in (`'trial'`,`'stripe'`,`'operator'`) | the provider-adapter seam (D6): StoreKit would add `'apple'` |
| `stripe_customer_id` | `text` | null, unique | set on first checkout-session creation |
| `stripe_subscription_id` | `text` | null | current subscription reference |
| `last_event_at` | `timestamptz` | null | provider `created` of the last **applied** event — the out-of-order guard (§4) |
| `created_at` | `timestamptz` | not null default `now()` | trial start (FR-002: never reset) |
| `updated_at` | `timestamptz` | not null default `now()` | touched by every applied transition |

**RLS**: enabled. Exactly one policy — `entitlements_select_own`:
`for select using (user_id = auth.uid())`. **No insert/update/delete policies for any client
role** (FR-017); all writes are service-role (edge functions) or the `ensure_entitlement` RPC.

**Index**: PK suffices (all access is by `user_id` or by `stripe_customer_id` — add
`unique` index via the column constraint above).

## 3. Table: `public.billing_events`

Append-only idempotency + audit log (FR-018/021). Service-role only.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `bigint` | generated always as identity, PK | |
| `provider` | `text` | not null default `'stripe'` | adapter seam |
| `event_id` | `text` | not null, **unique** | Stripe `evt_…` — the dedup key; insert-first, conflict = already processed → ack 200 |
| `event_type` | `text` | not null | e.g. `invoice.paid` |
| `event_created_at` | `timestamptz` | not null | provider-side `created` (ordering guard input) |
| `user_id` | `uuid` | null | resolved target (null if unmatched — kept for audit) |
| `outcome` | `text` | not null | `'applied' \| 'skipped_stale' \| 'skipped_unmatched' \| 'noop'` + optional detail |
| `payload` | `jsonb` | not null | raw event body (service-role-only table; kept for audit/replay) |
| `received_at` | `timestamptz` | not null default `now()` | |

**RLS**: enabled, **zero policies** — invisible to all client roles, readable only via
service role / SQL console.

## 4. RPC: `public.ensure_entitlement() → public.entitlements`

SECURITY DEFINER (precedent: `accept_invite`). Grant execute to `authenticated` only.

Behavior (all server-side, atomic):
1. `v_user := auth.uid()`; raise if null.
2. `insert into entitlements (user_id, status, access_expires_at, source)
   values (v_user, 'trialing', now() + interval '31 days', 'trial')
   on conflict (user_id) do nothing;`
3. `return` the caller's row.

Properties: idempotent (FR-001/002 — reinstall/re-sign-in/replay cannot reset or extend);
covers new **and** pre-existing users uniformly (D4); the *only* non-service-role write path,
and it can only create the initial trial row, never modify one.

Both clients call it during bootstrap, in parallel with data loading; its return value doubles
as the entitlement fetch (one round trip).

## 5. Derived gate state (client-mirrored pure function)

Implemented three times, byte-equivalent semantics, locked by the shared literal vectors in
[contracts/entitlement-state.md](./contracts/entitlement-state.md):
core `services/billing/src/derive.ts` (canonical) → web `web/lib/entitlements.ts` (copy) →
iOS `Shared/EntitlementLogic.swift (dropped at merge — tasks.md T046)` (mirror).

```
GateState = 'admin' | 'trialing' | 'active' | 'grace' | 'lapsed'

Constants (states.ts — the ONLY definition site):
  LEEWAY_HOURS       = 48    // late-renewal / missed-event slack on trialing+active
  DUNNING_GRACE_DAYS = 14    // extra access window while past_due (Stripe default retry window)
  TRIAL_DAYS         = 31

deriveGateState(row, now):
  status 'admin'                                          → 'admin'
  access_expires_at NULL (non-admin)                      → 'lapsed'   (defensive; cannot occur via §4/§6)
  'trialing'  && now <  expires + LEEWAY                  → 'trialing'
  'active'    && now <  expires + LEEWAY                  → 'active'
  'past_due'  && now <  expires + LEEWAY + DUNNING_GRACE  → 'grace'
  'canceled'  && now <  expires            (no leeway)    → 'active'   (paid-through, FR-014; UI copy from stored status)
  'paused' | 'unpaid'                                     → 'lapsed'
  anything else / expired                                 → 'lapsed'
```

Client rules bound to the gate (spec FR-005…FR-009):
- gate computed **only** from a successfully loaded row; fetch failure → existing recovery path,
  never the paywall (FR-008);
- `'lapsed'` → blocking paywall; `'grace'` → full access + calm Settings notice (FR-026);
- clients never write any of this — "Check again" = refetch row, re-derive.

## 6. Server state machine (core `machine.ts`)

Input: current entitlement row + `NormalizedBillingEvent` (from `stripe.ts` translator;
provider-agnostic shape — the StoreKit seam):

```
NormalizedBillingEvent {
  eventId, provider: 'stripe', type: NormalizedType, eventCreatedAt,
  userId?,                       // resolved by adapter from metadata/customer mapping
  status?: EntitlementStatus,    // provider-mapped status where the event carries one
  periodEndsAt?,                 // raw provider period end
  plan?: 'monthly'|'yearly',     // resolved by adapter from price id (D10 env mapping)
  stripeCustomerId?, stripeSubscriptionId?
}
```

Guards, in order (all property-tested; SC-007):
1. **Dedup** happens *before* the machine (unique `event_id` insert; conflict → `noop`).
2. **Unmatched user** → `skipped_unmatched` (logged, no state change).
3. **Stale event**: `eventCreatedAt <= last_event_at` → `skipped_stale` (out-of-order shield).
4. **Admin wins**: current `status='admin'` → apply reference-field updates only
   (customer/subscription ids), never status/expiry (D5).

Transitions (event type → row changes; `outcome='applied'` sets `last_event_at`):

| Normalized event (from Stripe type) | status → | access_expires_at → | other |
|---|---|---|---|
| `checkout_completed` (`checkout.session.completed`) | `active` | subscription `current_period_end` (adapter retrieves the subscription — the one API fetch) | set customer/subscription ids, `plan`, `source='stripe'` |
| `payment_succeeded` (`invoice.paid`) | `active` | invoice line period end | heals `past_due` → `active` (recovery) |
| `payment_failed` (`invoice.payment_failed`) | `past_due` **only if** currently `active`/`past_due` | unchanged (FR-020: never a lapse by itself) | |
| `subscription_updated` (`customer.subscription.updated`) | provider status mapped 1:1 (`trialing→active` — we run no Stripe trials) | `current_period_end` | `plan` re-resolved (portal monthly↔yearly switch lands here) |
| `subscription_deleted` (`customer.subscription.deleted`) | `canceled` | unchanged (paid-through governs; often fires at period end) | |
| `subscription_paused` (`customer.subscription.paused`) | `paused` | unchanged | |
| `trial_will_end` (`customer.subscription.trial_will_end`) | — | — | `noop` logged (no Stripe trials in v1) |

Missed-terminal-event safety (FR-019): no transition is *required* to lapse — §5 lapses any
non-admin row at `expires (+ applicable grace)` regardless of what events arrived.

## 7. Entity relationships

```
auth.users 1─1 public.users 1─1 entitlements          (per-person; households irrelevant — spec assumption)
entitlements 1─0..1 Stripe Customer (stripe_customer_id, created lazily at first checkout)
billing_events *─0..1 entitlements (via user_id; unmatched events retained)
plans: NOT a table — two Stripe Price IDs in function secrets (D10); `billing_plan` enum only labels the row
```

## 8. Validation rules recap (test targets)

- `ensure_entitlement` twice for same user ⇒ one row, unchanged expiry (FR-002).
- No client role can insert/update/delete `entitlements` or touch `billing_events` (RLS tests in
  the migration's companion checks + asserted in the web mock-harness contract).
- Every §6 transition + every §5 branch has a dedicated core test; replay properties per
  contracts/stripe-events.md: duplicates always converge; status-carrying streams converge under
  reordering; `payment_failed` early-arrival degrades fail-safe and is corrected by the redundant
  `subscription_updated` (SC-007).
- Literal vectors (contracts/entitlement-state.md) pass byte-identically in core, web, iOS suites.
