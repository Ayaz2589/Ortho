# Contract: Claim → Sync → Reconcile Lifecycle (spec 028)

The state machine for a SimpleFIN connection, from token claim through recurring sync.
Pure decision logic (normalization, dedupe, reconcile, rate-limit gate) lives in the
aggregation core and is unit-tested with fixtures; the edge functions are thin adapters.

## 1. Claim (one-time, synchronous)

```
setupToken ──base64 decode──► claimURL ──POST──► accessURL
                                                    │
                              (token now consumed, single-use)
                                                    ▼
                    complete_simplefin_link(accessURL → Vault + institution row)
                                                    ▼
                         best-effort GET /accounts?balances-only=1 → linked_accounts
                                                    ▼
                              institution status = 'active'
```

- Durable checkpoint = **secret stored**. Everything after self-heals on next sync.

## 2. Sync (recurring + manual)

```
active institution
   │  manual? and within cooldown ──► rate_limited (stop)
   ▼
window = [ last_synced_at ? last_synced_at-3d : now-90d , now ]  (span ≤ 90d)
   ▼
GET /accounts?start-date&end-date&pending=1
   ▼
for each accounts[].transactions[]:
     normalize(amount) → { amount_cents (≥0), kind }
     dedupeKey = (provider_account_id, txn.id)
     ledgerId  = uuidv5(dedupeKey)
     upsert_transaction({ id: ledgerId, ..., source: 'simplefin:acct:txn' },
                        [{ person_id: default, amount_cents: full }])
   ▼
mark_simplefin_synced(institution, window.end)
```

## 3. Reconcile pending → posted

```
sync N   : txn X pending=true  → ledgerId = uuidv5(acct, X.id) → row written (pending)
sync N+1 : txn X pending=false → SAME ledgerId → upsert UPDATES the same row (posted)
           (no duplicate; kind/amount/date refreshed from the posted version)

if provider re-keys id on posting:
   overlap window re-fetches; fallback match on (account, amount_cents, |date diff| ≤ 3d)
   supersedes the pending row (fixture-pinned).
```

## 4. Idempotency & dedupe invariants (test targets)

- Re-syncing an overlapping window creates **0** new ledger rows for already-seen
  transactions (same `ledgerId` → `on conflict (id) do update`).
- A transaction id reused across two accounts yields **two distinct** ledger rows
  (dedupe key includes `provider_account_id`).
- Every written row has exactly one default share summing to the total.
- `normalize`: sign→kind mapping never flips (heaviest fixture coverage).

## 5. Disconnect

```
active/disconnected institution ──disconnect──►
   delete_institution_secret ; status='disconnected' ; disconnected_at=now
   (idempotent; imported transactions retained; future syncs skip)
```
