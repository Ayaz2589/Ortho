# Phase 1 Data Model: Content-shaped loading skeletons

This feature adds no server/database entities. The only persisted state is a small client-side
record used to size placeholders. Everything else is ephemeral UI.

## Entity: RememberedSkeletonCounts (client, `localStorage`)

A single JSON object under the key `ortho.skeletonCounts`.

| Field | Type | Meaning | Rules |
|---|---|---|---|
| `transactions` | integer ≥ 0 | rows at end of last successful ledger load | validated, clamped `[0, CAP]` |
| `goals` | integer ≥ 0 | goal cards at last successful load | validated, clamped `[0, CAP]` |
| `housing` | integer ≥ 0 | property cards at last successful load | validated, clamped `[0, CAP]` |
| `tags` | integer ≥ 0 | tags at last successful load (for any tag-list surface) | validated, clamped `[0, CAP]` |
| `reportsSavings` | integer ≥ 0 | savings-rate rows at last `ready` reports fetch | validated, clamped `[0, CAP]` |
| `reportsCategories` | integer ≥ 0 | ranked-category rows at last `ready` reports fetch | validated, clamped `[0, CAP]` |

- **CAP** = 24. **Per-surface DEFAULT** (used when no valid value stored): a small number tuned to
  roughly fill a viewport for that surface (e.g. transactions ≈ 8, goals ≈ 3, housing ≈ 2,
  reports rows ≈ 6). Defaults live with each skeleton, not in storage.
- Only fields written by a successful load appear; unknown/extra fields are ignored on read.
- The object is a **UX hint only** — never a source of truth. Wrong/stale values only change a
  placeholder's height.

### Validation (read path — `readSkeletonCount(key, fallback)`)

1. If `localStorage` is unavailable or the key is absent → return `fallback`.
2. If the stored blob is not JSON / not an object → return `fallback`.
3. Read `blob[key]`. If it is not a finite number, not an integer, or `< 0` → return `fallback`.
4. Clamp the valid value to `[0, CAP]` and return it.

Never throws; any failure resolves to `fallback`.

### Write path — `writeSkeletonCount(key, n)`

1. No-op if `localStorage` unavailable (caught silently).
2. Coerce `n` to a non-negative integer; clamp to `[0, CAP]`.
3. Merge into the existing object (preserving other fields) and persist.

### Render-time rule

A skeleton renders `max(1, count)` rows/cards so a recorded 0 still shows a minimal placeholder
(never a blank screen mid-load). This clamp lives in the skeleton component, not in storage.

## Ephemeral UI state (not persisted)

- **Loading signal**: the store's existing `loading: boolean` (bootstrap) and
  `useReportsData`'s `status: 'loading' | 'ready' | 'error'` — unchanged; this feature only
  changes what is *rendered* while they indicate loading.
- **Current route**: `usePathname()` result, read by `RouteSkeleton` to pick a shape — not stored.
