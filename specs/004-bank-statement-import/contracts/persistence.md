# Contract: Persistence (must mirror the web store exactly — FR-021)

Imported rows must be indistinguishable from app-entered rows. The CLI reproduces `web/lib/store.tsx` `txRecord` + `writeShares` semantics.

## transactions insert
```ts
// one row per included, non-duplicate ParsedTransaction
{
  id,                 // generated uuid
  household_id,       // null (personal) | operator's household uuid (shared)
  merchant,           // cleaned
  category,           // TransactionCategory enum
  kind,               // 'expense' | 'income'
  scope,              // 'personal' (1 owner) | 'shared' (>1 owner)
  amount_cents,       // integer cents >= 0
  source,             // profile.source, e.g. 'TD Bank'
  date,               // ISO timestamptz (noon local)
  created_by,         // authed user id (sign-in) or chosen holder id (admin)
}
```
Invariant (DB-enforced): `scope='shared' ⇔ household_id != null`; `scope='personal' ⇔ household_id = null`.

## transaction_shares insert (only when scope='shared')
```ts
// mirrors writeShares: delete-then-insert per transaction
owner_ids.map(uid => ({
  transaction_id: id,
  user_id: uid,
  percent: effectiveSplits(tx)[uid] ?? 0,   // reuse web/lib/format.ts effectiveSplits
}))
```
- Even split: `splits=null` → `effectiveSplits` yields `100/owner_count` each (same rounding as web).
- Custom split: `splits={uid:pct}` with `Σ pct === 100`.
- Personal scope writes **no** shares (owners/splits are creator-only; device-local splits are out of scope and never written — matches `savePersonalShare` not touching Supabase for them).

## Write order & safety
1. Insert `transactions` row.
2. If `scope='shared'`, insert its `transaction_shares` rows.
3. On any error: stop, report, leave already-written rows (best-effort; report partial count). No silent failure.
- Dry-run performs **none** of the above.
- Duplicates (per dedupe key) are filtered out **before** step 1.

## Auth modes (D10)
- **Sign-in** (default): `@supabase/supabase-js` `createClient(URL, ANON_KEY)` then `auth.signInWithPassword`. RLS applies; `created_by` must be the signed-in user; shared splits require the user to be a household member (satisfied for the operator's own household).
- **Admin** (`ADMIN=1`): `createClient(URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken:false, persistSession:false } })` (mirrors `web/lib/supabase/admin.ts`); RLS bypassed; allows `created_by` = another user for cross-account attribution.

## Lookups (read-only)
- `select id,name from users` → resolve holder/owner names to ids, present picker.
- operator household: `household_members` joined to `households` for the authed user; co-owners = other members. If none with ≥2 members → multi-owner disabled (FR-020).
