# Route & URL Contract: Mobile new/edit pages

The UI contract this feature exposes: four new client routes and the form-factor branching rule.
All routes live under `web/app/(app)/` and inherit the authenticated Shell + store.

## Routes

| Path | File | Purpose | Rendered when |
|------|------|---------|---------------|
| `/transactions/new` | `app/(app)/transactions/new/page.tsx` | Add a transaction (blank / copy / settle-up) | `<1024px`; redirects to `/transactions` at `≥1024px` |
| `/transactions/edit` | `app/(app)/transactions/edit/page.tsx` | Edit a transaction by id | `<1024px`; redirect if `≥1024px` or id not found |
| `/housing/new` | `app/(app)/housing/new/page.tsx` | Add a property (kind step → form) | `<1024px`; redirects to `/housing` at `≥1024px` |
| `/housing/edit` | `app/(app)/housing/edit/page.tsx` | Edit a property by id | `<1024px`; redirect if `≥1024px` or id not found |

## Query parameters

- `/transactions/new?copyFrom=<txId>` — prefill from an existing transaction (copy).
- `/transactions/new?from=<personId>&to=<personId>&amount=<cents>` — settle-up transfer prefill.
- `/transactions/edit?id=<txId>` — edit target.
- `/housing/new?kind=<PropertyKind>` — optional; skip the in-page kind picker.
- `/housing/edit?id=<propertyId>` — edit target.

Parsing/validation and fallbacks: see `data-model.md`. All params are read client-side via
`new URLSearchParams(window.location.search)` in a mount effect (never `useSearchParams()`).

## Form-factor branching contract (entry points)

Every add/edit trigger obeys:

```text
if (isExpanded)  → open the existing in-place tray/drawer (today's setState)   // desktop: UNCHANGED
else             → router.push(<page url with intent params>)                  // mobile: navigate
```

Entry points covered:

| Trigger | Location | Desktop (≥1024) | Mobile (<1024) |
|---------|----------|-----------------|----------------|
| Activity header "＋" / empty-state add | `transactions/page.tsx` (`openAdd`) | open tray (setState) | `push('/transactions/new')` |
| Transaction row "Copy" | `transactions/page.tsx` (`openCopy`) | open tray copying | `push('/transactions/new?copyFrom=<id>')` |
| "Settle up" | `transactions/page.tsx` (`openSettle`) | open tray transfer | `push('/transactions/new?from=&to=&amount=')` |
| Transaction detail sheet "Edit" | `TransactionDetailModal.tsx` | (n/a — detail is mobile-only sheet) | `push('/transactions/edit?id=<id>')` and close the sheet |
| Housing add "＋" | `housing/page.tsx` | open kind picker → Drawer | `push('/housing/new')` |
| Housing "Edit" | `housing/page.tsx` | open Drawer editing | `push('/housing/edit?id=<id>')` |

> Desktop call sites are byte-for-byte unchanged (`TransactionsDesktop.tsx` / `HousingDesktop.tsx` are not
> edited). Only the *mobile* branches in the shared list pages / detail sheet gain a `router.push`.

## Redirect (guard) contract

- Loading any of the four routes at `≥1024px` ⇒ `router.replace()` to the list route.
- `/transactions/edit` or `/housing/edit` with a missing/unresolvable `id` ⇒ `router.replace()` to the list.
- Redirects use `replace` (not `push`) so the invalid page is not left in history.

## Navigation-after-action contract

- Save (single) ⇒ `router.push(list)`.
- Save-and-add-another (transactions) ⇒ stay on page, `resetForAnother()`.
- Cancel / back control ⇒ `router.push(list)`.
