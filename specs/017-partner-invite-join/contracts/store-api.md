# Contract: Store / State Surface (017)

The observable contracts the tests assert (Constitution VI: public contracts + accessible
DOM, never internals). Types in data-model.md.

## Web `useApp()` additions

| member | contract |
|---|---|
| `membershipStatus` | `'unknown'` during boot; `'none'` ⇒ the app shell renders the household gate INSTEAD of tab content; `'member'` ⇒ normal app. Never `'none'` for any user with ≥1 membership. |
| `currentRole` | `'owner'` for every pre-017 user and after Start fresh; `'member'` after a join. Drives invite-card visibility (owners only) and the claim gate. |
| `invites` | Sorted newest-first. For members: always `[]`. Contains NO token material (FR-005). |
| `needsPersonClaim` | `true` iff `membershipStatus==='member' && currentRole==='member'` and no active person row has `linked_user_id === currentUserId`. While true, the shell renders the claim step INSTEAD of tab content (re-presentation, FR-016). |
| `refreshing` | `true` only between `refresh()` invocation and settle. Boot `loading` is NEVER set by refresh. |
| `startFresh()` | Produces exactly the pre-017 create sequence: `households` insert (uuid, owner_id=me, name 'Home') → `household_members` insert (role 'owner') → linked-person ensure → full load. Sets `preferredHouseholdId`. |
| `redeemInvite(code)` | Resolves `{ok:true, householdId}` on success (preference set, memberships reloaded, data loaded); `{ok:false, reason:'invalid'}` for the RPC's single failure; `{ok:false, reason:'already-member'}` when the returned household was already held (no state change beyond the consumed code). NEVER throws; NEVER leaves a partial join (membership without loaded household). |
| `claimPerson(sel)` | `sel = {personId}` → guarded UPDATE (`linked_user_id IS NULL`); 0 rows ⇒ `{ok:false, reason:'taken'}` and people are refreshed. `sel = {name, colorKey}` → insert new linked person. Success flips `needsPersonClaim` to false without reload. |
| `createInvite()` | Owners only (UI-gated; RLS backstops). Resolves the RAW display code exactly once; state gains the invite row (no hash/code retained). Optimistic; rollback + error banner on failure. |
| `revokeInvite(id)` | Optimistic remove; rollback + error banner on failure. |
| `refresh()` | On success: all household collections replaced consistently (single React batch after all reads). On failure: NO collection mutated, error banner set, `refreshing` false. Open form state (any component-local state) untouched by contract — refresh only replaces store collections. |

## Web routes & chrome

| surface | contract |
|---|---|
| `proxy.ts` | Unauthed request to path P (non-auth, non-api) redirects to `/sign-in?next=<encodeURIComponent(P+query)>`. |
| `/sign-in` | After OTP verify: `router.replace(next)` iff `next` starts `'/'` and not `'//'`; else `/dashboard`. |
| `/join?code=…` | Authed page. Pre-fills the code (display or canonical accepted). Renders confirm → `redeemInvite`. All three outcomes have distinct calm copy; success routes to `/dashboard` (claim gate intercepts if needed). |
| Household gate | Shown when `membershipStatus==='none'`: two real buttons — Join with a code (code input) / Start fresh — plus a quiet sign-out. Shown when `needsPersonClaim`: claim picker (unlinked active people + "Continue as a new person"). |
| RefreshControl | `<button aria-label="Refresh">` in Sidebar footer (≥640px) and compact Transactions header; disabled while `refreshing`; announces completion via `aria-live="polite"`. |

## iOS AppState / API additions

| member | contract |
|---|---|
| `HouseholdsAPI.findOrCreate(for:preferredID:)` | Reads ALL memberships (role, ordered by created_at); picks preferredID when still a membership, else first; creates (owner) only when none exist — byte-compatible with today for every existing user. Returns `(id, name, role)`. |
| `AppState.currentRole` | Mirrors web semantics. Gates the `ensureAccountPerson` auto-create (owner only) and invite UI. |
| `AppState.joinHousehold(code:)` | Canonicalizes; `InvitesAPI.redeem`; on success sets `currentHouseholdID` (persists), reloads name/role/data; already-member and invalid map to calm alerts; `testDataEnabled` short-circuits with the invalid-code copy. |
| `AppState.claimPerson(…)` | Same guarded-update semantics as web; failure surfaces `dataError`; success clears the claim need. |
| `AppState.createInvite()/revokeInvite(id:)` | Optimistic + rollback + `dataError`; owner-gated in UI. Raw code returned once for the reveal sheet. |
| Transactions ledger | `.refreshable` awaits `loadAllFromServer()`; failure surfaces the existing `dataError`; data never blanks. |

## i18n contract

Every user-facing string introduced by this feature exists (a) as a literal `t('…')`/
`Text("…")`/`Localizer.tr("…")` key, (b) in ALL five web catalogs, (c) in
`Localizable.xcstrings` for all six languages when the key is used on iOS. The
catalog-parity suite is the enforcement (no new mechanism).

## PARITY.md contract

New rows: "Partner invite & join" (✅ web / ✅ iOS / — CLI) and "Manual data refresh"
(✅ web / ✅ iOS / — CLI), with the invite-code convention noted as a hand-mirrored contract
(this file) and the per-canvas divergence (web pre-bootstrap gate vs iOS Settings-only
redeem; iOS refresh is per-collection at completion vs web single-batch) recorded under
deliberate divergences.
