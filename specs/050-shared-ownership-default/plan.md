# Implementation Plan: Shared Ownership by Default

**Branch**: `feat/050-053-household-wiring` | **Date**: 2026-08-16 | **Spec**: [spec.md](./spec.md)

## Summary

Flip the default owner set for *new* expense and income transactions from "the logged-in person" to
"every active household person, split evenly", gate it behind a per-device preference, and add a
one-tap **Who is this for?** control (Everyone / Just me) so narrowing never requires the picker.

All of the machinery exists — `computeShares`, `orderedOwnerIds`, the owner picker, the atomic write.
This changes which owner set the form *starts* with and adds two presets.

## Technical Context

**Language/Version**: TypeScript 5, React 19

**Primary Dependencies**: none added

**Storage**: `localStorage` key `ortho.sharedByDefault` (per device, mirrors `ortho.textSize`)

**Testing**: Vitest + Testing Library

**Constraints**: no migration; existing transactions must never be re-attributed; one-person
households must be behaviorally unchanged.

## Constitution Check

| Principle | Status |
|---|---|
| I — Tokens only | Pass. Presets reuse the existing chip/segmented control styles. |
| II — Calm over dense | Pass. Two presets replace a mandatory picker detour; net fewer interactions. |
| IV — Plainspoken voice | Pass. "Who is this for?" / "Everyone" / "Just me". |
| VI — Test-driven | Pass. Default-resolution is a pure function tested before the form is touched. |

No violations.

## Design

### Pure resolver — `web/lib/defaultOwner.ts` (extended)

```ts
/** Owner set a NEW transaction starts with. Existing transactions never call this. */
export function resolveDefaultOwnerIds(
  currentPersonId: string | null | undefined,
  activePeople: { id: string }[],
  currentUserId: string | null | undefined,
  sharedByDefault: boolean
): string[]
```

- fewer than 2 active people → `[resolveDefaultOwnerId(...)]` (today's behavior, byte-identical)
- `sharedByDefault === false` → same single-owner result
- otherwise → every active person id

Keeping this beside the existing `resolveDefaultOwnerId` means the form and CSV import share one
rule, exactly as they already share the single-owner one.

### Preference — `web/components/settings/sharedByDefault.ts`

`read()` / `write(boolean)`, `localStorage` key `ortho.sharedByDefault`, default **true**. Mirrors
`textSize.ts` in shape. No boot script needed — it affects form state, not paint.

### Form — `web/components/web/TxForm.tsx`

- `initialOwners` calls `resolveDefaultOwnerIds` when **not** editing and there is no source
  transaction. The `editing` and copy-from-source branches are untouched (FR-005, FR-Edge).
- New **Who is this for?** row, rendered only when `householdMembers.length > 1` and the kind is not
  `transfer`. Two presets plus the existing picker.
- Preset state is *derived*, not stored: "Everyone" is active when the owner set equals all active
  people; "Just me" when it is exactly `[currentPersonId]`; neither otherwise.

### CSV import — `web/lib/csv/csvImportModels.ts`

`toDraft` takes the resolved default owner **list** instead of a single id. `useCsvImport.ts`'s
`[currentPersonId]` fallback follows the same rule.

### Settings

`Settings → Household` gains the preference row, hidden for one-person households.

## Project Structure

```text
web/lib/defaultOwner.ts                       # extended
web/components/settings/sharedByDefault.ts    # new
web/components/web/TxForm.tsx                 # default + presets
web/lib/csv/csvImportModels.ts                # list-aware default
web/lib/csv/useCsvImport.ts                   # matching fallback
web/app/(app)/settings/household/page.tsx     # preference row
web/lib/i18n/*.ts                             # 5 catalogs

web/test/transactions/shared-ownership-default.test.tsx   # new
```

## Test Strategy (TDD order)

1. `resolveDefaultOwnerIds` unit tests — solo, multi, preference off, removed people excluded.
2. Form tests — default owner set, preset behavior, editing an existing transaction is untouched.
3. Share-sum property — owner sets of size 1..6 over non-divisible amounts always sum to the total.
4. CSV draft default test.
5. Full existing suite green, unmodified — the proof that solo behavior did not move.
