# Contract: Entitlement gate derivation (cross-surface lock)

**Status**: BINDING. Three implementations must agree byte-for-byte on these semantics:

1. `services/billing/src/derive.ts` — canonical (used by nothing at runtime on clients; the
   package's public truth, tested in `services/billing/test/derive.test.ts`)
2. `web/lib/entitlements.ts` — hand-copied TS (tested in `web/test/entitlements.test.ts`)
3. `iOS/Ortho-iOS/Shared/EntitlementLogic.swift` — hand-mirrored Swift (tested in
   `Ortho-iOSTests/EntitlementLogicTests.swift`)

The lock mechanism is the 017 `InviteCodec` pattern, **not** a golden vector (no money/date
engine; FR-030): each suite embeds the **identical literal vector table** below and additionally
asserts the canonical serialization digest, so any drift in vectors or serialization fails the
drifted surface's suite.

## Inputs

```
status:            'trialing'|'active'|'past_due'|'paused'|'unpaid'|'canceled'|'admin'
accessExpiresAt:   ISO-8601 UTC timestamp or null
now:               ISO-8601 UTC timestamp (injected — never the real clock; Constitution VI)
```

## Constants (single definition site per surface; values BINDING)

```
LEEWAY_HOURS       = 48
DUNNING_GRACE_DAYS = 14
TRIAL_DAYS         = 31        // used by ensure_entitlement(); listed here for completeness
```

## Rules (evaluate top-down, first match wins; all comparisons STRICT `<`)

```
1. status == 'admin'                                            → 'admin'
2. accessExpiresAt == null                                      → 'lapsed'    // defensive; §4 RPC/machine never produce it for non-admin
3. status == 'trialing' && now < expires + LEEWAY_HOURS         → 'trialing'
4. status == 'active'   && now < expires + LEEWAY_HOURS         → 'active'
5. status == 'past_due' && now < expires + LEEWAY_HOURS
                                   + DUNNING_GRACE_DAYS         → 'grace'
6. status == 'canceled' && now < expires        // NO leeway    → 'active'
7. otherwise                                                    → 'lapsed'
```

Boundary semantics: expiry instants are **exclusive** (`now == expires + window` ⇒ lapsed) —
vectors V05/V16 pin this on both sides of the second.

## Literal vectors (embed VERBATIM in all three suites; `now` = `2026-07-05T12:00:00Z`)

| id | status | accessExpiresAt | expected |
|---|---|---|---|
| V01 | admin | null | admin |
| V02 | admin | 2020-01-01T00:00:00Z | admin |
| V03 | trialing | 2026-07-20T00:00:00Z | trialing |
| V04 | trialing | 2026-07-04T12:00:00Z | trialing |
| V05 | trialing | 2026-07-03T12:00:00Z | lapsed |
| V06 | trialing | 2026-07-03T11:59:59Z | lapsed |
| V07 | trialing | null | lapsed |
| V08 | active | 2026-08-01T00:00:00Z | active |
| V09 | active | 2026-07-04T00:00:00Z | active |
| V10 | active | 2026-07-01T00:00:00Z | lapsed |
| V11 | active | null | lapsed |
| V12 | past_due | 2026-07-10T00:00:00Z | grace |
| V13 | past_due | 2026-07-01T00:00:00Z | grace |
| V14 | past_due | 2026-06-18T00:00:00Z | lapsed |
| V15 | canceled | 2026-07-10T00:00:00Z | active |
| V16 | canceled | 2026-07-05T12:00:00Z | lapsed |
| V17 | canceled | 2026-07-05T11:59:59Z | lapsed |
| V18 | paused | 2026-08-01T00:00:00Z | lapsed |
| V19 | unpaid | 2026-08-01T00:00:00Z | lapsed |

## Canonical serialization + digest (assert in each suite)

Serialization: one line per vector, `id|status|expiresOrNull|expected`, joined by `\n`
(no trailing newline), UTF-8.

```
sha256 = 88715c8317256e5c6162e6479e3451e94bff56edbc70c0853c1fd0aaa36a48e2
```

Rationale for notable vectors: V02 admin ignores expiry entirely (D5); V04/V05 pin the 48h
leeway window edge to the second; V13 is past_due 4.5 days past expiry — inside the 16-day
grace envelope (48h + 14d); V14 is past it → lapsed even though no terminal Stripe event ever
arrived (FR-019); V15–V17 pin canceled paid-through with **no** leeway (FR-014).

## Client behavior bound to the derived state (restated from data-model §5; BINDING)

- Derivation runs only on a **successfully loaded** row; load failure routes to the existing
  recovery UI, never the paywall (FR-008).
- `lapsed` ⇒ blocking paywall (FR-006/007). `grace` ⇒ full access + calm Settings notice
  (FR-026). `admin` ⇒ no subscription UI beyond the Settings "no subscription needed" row.
- Clients never mutate entitlement state; "Check again" = refetch + re-derive (FR-017).
