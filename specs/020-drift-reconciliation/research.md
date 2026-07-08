# Research & Decisions: Drift Reconciliation

Most "unknowns" for this feature are *directional* (which side is canonical, how to fix without collateral drift), not exploratory. Decisions below resolve every open choice; there are no remaining NEEDS CLARIFICATION.

## D1 — Canonical alignment direction per parity divergence

**Decision**: iOS is canonical for *presentation*; the *correct/stricter* implementation is canonical for date/validation logic. Per item:

| Item | Canonical | Change |
|---|---|---|
| GBP display name | iOS 'UK Pound' | web `currency.ts` → 'UK Pound' |
| CNY symbol | fixed table 'CN¥' | web keeps a fixed table; iOS stops locale-deriving (use fixed table) |
| insights money decimals | iOS (always 2) | web `insights.ts` usd() → min 2 |
| money negative sign / leadingPlus / rate guard | web semantics (U+2212, `+` only when >0, guard rate≤0) | iOS `Money.swift` mirrors web sign/plus; **web** `money.ts` guard `rate===0`→`rate<=0` (matches iOS `rate>0`) |
| split sharePercent rounding | round-half-away-from-zero (Swift) | web `splits.ts` uses away-from-zero rounding for the percent |
| monthBounds validation | web (strict `^\d{4}-\d{2}$`) | iOS `TransactionFilters` monthBounds adds strict validation |
| query trim charset | web (JS `.trim()` incl. newlines) | iOS uses `.whitespacesAndNewlines` |
| availableSources sort | web (localized, case-insensitive) | iOS uses a localized case-insensitive comparator |
| lease due-day overflow | web (clamps to month length) | iOS `LeaseInfo.daysUntilNextRent` clamps day to month length |

**Rationale**: The constitution names iOS the canonical product, so *how money looks* follows iOS. But where iOS holds an actual bug (rent-due off-by-one, month-string laxness), correctness wins over "canonical." Direction is recorded so implementers don't guess.

## D2 — How to pin previously vector-blind behaviors

**Decision**: Add three NEW golden vectors — `currency-names.json`, `currency-symbols.json`, `lease.json` — because names/symbols/lease math are entirely uncovered and lease has no test at all. For micro-divergences that are **display-string only** and don't fit the numeric vector shape (money sign, leadingPlus, rate-guard, sharePercent rounding), pin them with **parity unit tests on each platform** rather than forcing awkward vector cases. Add filter edge cases (query-trim, mixed-case source sort) to `transaction-filters.json` (intentional regen). The month-string-rejection case is asserted by a unit test on both sides (a thrown error doesn't fit the vector's `{input→expected}` rows).

**Rationale**: Golden vectors are the durable cross-language lock and are the right tool for names/symbols/lease. But the vector harness models value equality, not exceptions or pure display strings; forcing those in would distort the vectors. A per-platform unit test that asserts the same expected string/behavior gives equivalent regression protection where a vector doesn't fit. Every newly-aligned behavior ends up with *some* deterministic test.

**Alternatives considered**: (a) Vector everything → rejected: exceptions and locale-y display strings don't serialize cleanly. (b) Fix code without new tests → rejected: violates Constitution VI and lets the drift recur (the whole reason we're here).

## D3 — Occupancy migration without disturbing the housing-net-rental vector

**Decision**: Add `units.occupied boolean not null default true`; backfill `occupied = (tenant_name is not null AND btrim(tenant_name) <> '')` so every existing unit's occupancy equals today's inferred value. The pure functions `occupiedRentCents`/`netRentalCents` already operate on `RentUnit = { rentCents, occupied }`; only the **mapping** `rentUnitsFrom` changes — it reads `u.occupied` instead of calling `isUnitOccupied(tenant_name)`. Therefore `housing-net-rental.json` stays **byte-identical** (it tests the pure functions, whose inputs already carry explicit `occupied`), and no property's displayed net changes at migration.

**Rationale**: The 019 design already split occupancy resolution (mapping) from the net math (pure). Introducing an explicit column is a mapping-layer swap — the cleanest possible change, with zero vector drift and zero net change. `isUnitOccupied` is retained only for the backfill/legacy-read reference.

**Alternatives considered**: Keep inference and only add a UI hint → rejected: doesn't fix silent income loss (FR-012); the deferred 019 US5 explicitly needs the column.

## D4 — Seed-config honesty (`[db.seed]`)

**Decision**: Create `supabase/seed.sql` as an empty, commented file so the declared `sql_paths=["./seed.sql"]` points at a real file, and `enabled=true` becomes true-in-fact (a no-op seed, matching today's "reset yields no data" while giving future seeds a home).

**Rationale**: Least-surprising truth-up; keeps the capability wired. Setting `enabled=false` is the equally-valid alternative; either satisfies FR-005. Chose the file so the config line isn't dangling.

## D5 — OTP length source of truth

**Decision**: Set `supabase/config.toml [auth.email] otp_length = 8` to match every client and doc (clients hard-gate ≥8). Verify `otp_expiry` and `[auth.sessions] timebox="720h"` while there; the hosted project already uses 8 (documented), so this only fixes the local stack.

**Rationale**: All three clients and all docs already assume 8; the config is the sole outlier and the one making local sign-in impossible.

## D6 — iOS CI batching

**Decision**: Land all Swift changes (P3 parity mirrors, P4 `Unit.occupied` + toggle + xcstrings, P6 comments) plus the pbxproj wiring for the three new vectors in ONE push, then watch `ios-ci.yml`. Only re-push if CI reports a missing-vector-in-bundle error (the known failure mode for a new vector not wired into Copy Bundle Resources).

**Rationale**: Each CI run is ~15 min; batching avoids serial round-trips. The web side + vectors are fully green locally before the iOS push, so CI is the *only* unknown and we want to spend it once.

## D7 — Doc/count refresh timing

**Decision**: Do P7 (counts, pointers, trees, PARITY reconcile) LAST, after all code lands, and reconfirm each figure by command (`wc -l`, `ls | wc -l`, the vitest summary) rather than trusting the audit's numbers — the audit's counts were a snapshot and this feature changes some of them (test count grows, new vectors, new files).

**Rationale**: Counts must reflect the final tree, and several fixes in this feature move them.
