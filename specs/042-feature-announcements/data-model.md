# Data Model: Feature-Announcement Popup

No database schema — this feature introduces no tables, columns, or migrations. The "data" is a code-level
registry plus a per-device browser-storage ledger. Types below live in `web/components/announcements/`.

## Entity: Announcement (code registry)

A declarative "what's new" entry. Authored in `registry.ts`; part of the shipping feature's code.

| Field           | Type                                            | Notes                                                        |
| --------------- | ----------------------------------------------- | ------------------------------------------------------------ |
| `id`            | `string`                                        | Stable, unique key; used as the seen-ledger id. Never reused. |
| `titleKey`      | `string`                                        | i18n key (English string) for the feature title.            |
| `descriptionKey`| `string`                                        | i18n key for the 1–2 sentence description.                  |
| `cta.labelKey`  | `string`                                        | i18n key for the CTA button label.                          |
| `cta.route`     | `string`                                        | In-app route the CTA navigates to (e.g. `/welcome/financial-profile`). |
| `isRelevant?`   | `(ctx: AnnouncementContext) => boolean`         | Optional. Absent ⇒ always relevant. Gates on app state.     |

```ts
export interface Announcement {
  id: string
  titleKey: string
  descriptionKey: string
  cta: { labelKey: string; route: string }
  isRelevant?: (ctx: AnnouncementContext) => boolean
}

/** Minimal slice of the app store the relevance predicate may read. */
export interface AnnouncementContext {
  userFinancialProfile: unknown | null
}

export const ANNOUNCEMENTS: Announcement[]  // ordered; first unseen+relevant one shows
```

**Validation / invariants**:
- `id` is unique across the array (guarded by a registry unit test).
- Every `titleKey` / `descriptionKey` / `cta.labelKey` exists in all five i18n catalogs (guarded by the
  i18n test).
- Order is meaningful: the host shows the **first** unseen+relevant entry.

### Seeded entry (spec 041 Financial Health)

```ts
{
  id: 'financial-health',
  titleKey: 'Financial health',
  descriptionKey: "See how your money's doing with a calm 0–100 score — answer a few questions to start.",
  cta: { labelKey: 'Set up financial health', route: '/welcome/financial-profile' },
  isRelevant: (ctx) => ctx.userFinancialProfile == null,
}
```

## Entity: Seen ledger (per-device, localStorage)

Records which announcement ids this browser has seen. Not user-scoped; per-device by design (spec
Assumptions). Managed by `announcementsSeen.ts` (mirrors `textSize.ts`: guarded, never throws).

- **Storage key**: `ortho.announcementsSeen`
- **Value shape**: JSON-encoded `string[]` of seen ids, e.g. `["financial-health"]`. Missing/corrupt/
  unreadable ⇒ treated as `[]` (everything unseen).

```ts
export function readSeenAnnouncements(): string[]        // guarded; [] on any error
export function hasSeenAnnouncement(id: string): boolean
export function markAnnouncementSeen(id: string): void   // best-effort append (deduped); ignores throw
export function nextUnseenAnnouncement(
  list: Announcement[],
  ctx: AnnouncementContext,
): Announcement | null                                   // first entry: !seen && (isRelevant ?? true)
```

**State transitions**: an id is `unseen` → `seen` exactly once, on the first CTA-take **or** dismiss. There
is no "unsee" (clearing browser storage resets the ledger, which is acceptable per-device behavior).

## Relationships

- `AnnouncementHost` (component) reads `ANNOUNCEMENTS` + the ledger + `AnnouncementContext` (from `useApp()`)
  and renders at most one `Announcement` via `Drawer`.
- No relationship to any DB entity. The Financial Health tables (spec 041) are untouched; only the *entry
  point* into that feature's flow changes.
</content>
