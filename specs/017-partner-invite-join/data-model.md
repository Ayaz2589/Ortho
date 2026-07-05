# Data Model: Partner Invite & Join (017)

Zero schema changes — every entity below already exists in
`supabase/migrations/20260521120000_initial_schema.sql` (and
`20260616120000_household_people_and_value_splits.sql` for `household_people`).
This document pins how the feature READS and WRITES them, plus the new client-side types.

## Existing tables (as used by this feature)

### `pending_invites` (initial_schema.sql:57-68)

| column | type | feature usage |
|---|---|---|
| `id` | uuid PK default gen_random_uuid() | revoke target; list key |
| `household_id` | uuid → households ON DELETE CASCADE | invite's household |
| `email` | text NULL | **unused** (out-of-band sharing; stays NULL) |
| `role` | `role` enum default 'member' | always `'member'` from the UI |
| `token_hash` | text NOT NULL UNIQUE | lowercase-hex SHA-256 of the **canonical** code (contracts/invite-code.md) |
| `expires_at` | timestamptz NOT NULL | `now + 7 days` at creation (client-computed ISO) |
| `created_by` | uuid → users ON DELETE RESTRICT | `auth.uid()` of the owner |
| `created_at` | timestamptz default now() | list ordering (newest first) |
| `redeemed_at` | timestamptz NULL | status derivation |

**RLS** (initial_schema.sql:326-338): select/insert/delete all `is_household_owner(household_id)`.
No UPDATE policy → revoke is DELETE. Members receive zero rows.

**Client-side status derivation** (never stored):
`redeemed_at != null` → **redeemed**; else `expires_at <= now` → **expired**; else **pending**.
Revoked invites simply cease to exist (deleted).

### `household_members` (initial_schema.sql:48-55)

| column | feature usage |
|---|---|
| `household_id, user_id` | composite PK — the membership |
| `role` (`owner` \| `member`) | gates invite UI (FR-004) and the person auto-create vs claim step (R5/R7) |
| `created_at` | deterministic ordering for the fallback pick (FR-018) |

Written ONLY by: today's `startFresh` path (role `owner`, unchanged) and the
`accept_invite` RPC (role from the invite = `member`). The feature adds **no** direct
client write to this table.

### `household_people` (household_people_and_value_splits.sql:20-35)

| column | feature usage |
|---|---|
| `linked_user_id` uuid NULL → users, `unique(household_id, linked_user_id)` | the **claim**: `UPDATE … SET linked_user_id = auth.uid() WHERE id = :chosen AND linked_user_id IS NULL` (0 rows ⇒ lost race, FR edge case) |
| `removed_at` | claim picker offers only `removed_at IS NULL AND linked_user_id IS NULL` rows |
| `name, initial, color_key, sort_order` | "continue as a new person" insert (existing `addPerson` shape, linked to self) |

### `households`, `users`

Read-only for this feature (name display; profile ensure is unchanged).

### RPC `accept_invite(p_token text) returns uuid` (initial_schema.sql:500-537)

security definer; requires `auth.uid()`; single failure message
`'Invite is invalid, redeemed, or expired'`; idempotent membership insert; unconditional
`redeemed_at` stamp; returns `household_id`. See research.md R3.

## New client-side types

### Web — `web/lib/types.ts`

```ts
export interface PendingInvite {
  id: string
  household_id: string
  role: 'owner' | 'member'
  expires_at: string        // ISO
  created_at: string        // ISO
  redeemed_at: string | null
  // token_hash is deliberately NOT surfaced to UI state (FR-005)
}

export type InviteStatus = 'pending' | 'redeemed' | 'expired'
export type MembershipRole = 'owner' | 'member'
```

### Web — `web/lib/invites.ts` (pure codec)

```ts
generateInviteCode(): string            // canonical 10-char Crockford32
formatInviteCode(c: string): string     // 'XXXXX-XXXXX' for display
canonicalizeInviteCode(input: string): string  // uppercase, O→0, I/L→1, strip non-alnum
hashInviteCode(canonical: string): Promise<string> // lowercase hex sha256 (Web Crypto)
inviteStatus(i: {expires_at, redeemed_at}, now: Date): InviteStatus
joinLink(origin: string, code: string): string  // `${origin}/join?code=XXXXX-XXXXX`
```

### iOS — `Shared/InviteCodec.swift` (hand-mirror of the above; CryptoKit SHA256)

```swift
enum InviteCodec {
  static func generate(using rng: inout some RandomNumberGenerator) -> String
  static func format(_ canonical: String) -> String
  static func canonicalize(_ input: String) -> String
  static func hashHex(_ canonical: String) -> String
  static func status(expiresAt: Date, redeemedAt: Date?, now: Date) -> InviteStatus
}
```

### iOS — `Services/InvitesAPI.swift`

```swift
struct PendingInvite: Codable, Identifiable { id, householdID, role, expiresAt, createdAt, redeemedAt }
struct InvitesAPI {
  func fetch(householdID: UUID) async throws -> [PendingInvite]
  func create(householdID: UUID, tokenHash: String, expiresAt: Date, createdBy: UUID) async throws -> PendingInvite
  func revoke(id: UUID) async throws
  func redeem(canonicalToken: String) async throws -> UUID   // .rpc("accept_invite")
  func role(householdID: UUID, userID: UUID) async throws -> String
}
```

## State additions (per surface, one state layer each)

### Web store (`lib/store.tsx`)

| state | type | notes |
|---|---|---|
| `membershipStatus` | `'unknown' \| 'none' \| 'member'` | `'none'` renders `HouseholdGate` |
| `currentRole` | `MembershipRole \| null` | from the picked membership row |
| `invites` | `PendingInvite[]` | owners only (RLS yields [] for members) |
| `needsPersonClaim` | boolean (derived) | member-role ∧ no person linked to me |
| `refreshing` | boolean | refresh in flight (never reuses boot `loading`) |

| method | behavior |
|---|---|
| `startFresh()` | today's exact create path + set preference |
| `redeemInvite(code)` | canonicalize → rpc → map error / already-member / success(set preference, reload) |
| `claimPerson(sel)` | guarded update or insert; refresh people |
| `createInvite()` | generate+hash+insert; returns raw code for ONE-TIME display; optimistic list add |
| `revokeInvite(id)` | optimistic delete + rollback |
| `refresh()` | R8 semantics |

Persistence: `localStorage['preferredHouseholdId']`.

### iOS AppState

| addition | notes |
|---|---|
| `currentRole: Role?` | from `findOrCreate` (now returns role) |
| `invites: [PendingInvite]` | fetched with household data (owners get rows) |
| `joinHousehold(code:)`, `claimPerson(…)`, `createInvite()`, `revokeInvite(id:)` | optimistic + `dataError`, all `testDataEnabled`-guarded |
| persisted pick | existing `currentHouseholdID` UserDefaults key, now preferred inside `findOrCreate` |

## State machine — join & claim (both surfaces)

```
signed-in
  └─ memberships = fetch all (role, created_at)
       ├─ none (web) ──→ GATE: [Join with a code] ──ok──→ member(role=member)
       │                  └──── [Start fresh] ─────────→ member(role=owner)   (today's path)
       ├─ none (iOS) ──→ auto-create (frozen behavior) → member(role=owner)
       └─ some ──→ pick preferred ?? first(created_at) → member(role=r)
member(role=owner) ──→ ensure linked person (auto-create, unchanged) → ready
member(role=member) ─→ linked person? ──yes──→ ready
                              └──no──→ CLAIM: pick unlinked-active OR create new
                                        ├─ update 0 rows (race) → re-pick
                                        └─ ok → ready
ready ──(iOS Settings join / web /join link)──→ redeem → (already-member? calm notice)
                                                    └─ new household → set preference → reload → claim check
```

## Invariants preserved

- Per-owner shares still sum to `amount_cents` — untouched (no split/balance code changes).
- `transfer` semantics untouched.
- Exactly one linked person per (household, user) — enforced by the existing unique
  constraint + the claim guard.
- Test-data mode never reaches the live backend — all new mutations sit behind the same
  guards as existing ones.
- No raw token at rest anywhere (state holds it only in the ephemeral reveal; FR-005).
