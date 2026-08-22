# Contract: the frame ↔ panel boundary

**Feature**: 057 | **Date**: 2026-08-22

> **If you are building a widget panel in a sandbox, read this file first.** It is the whole
> agreement between the shared frame and your panel. Everything it does not forbid, you own.

---

## 1. What a panel is

A **propless component** registered on one widget:

```ts
// lib/widgets/registry.tsx
{
  id: 'top-merchants',
  title: 'Top merchants',
  description: '…',
  defaultEnabled: true,
  Body: TopMerchantsBody,
  Panel: TopMerchantsPanel,   // ← your one shared line
}
```

It takes no props for the same reason `Body` takes none: a prop on this field changes the type
for every widget in order to serve some of them.

---

## 2. What the frame gives you

The frame (`WidgetPanel`) is already rendered around your panel. You inherit all of this and
must not rebuild any of it:

| You get | Provided by |
|---|---|
| The widget's title in a header | `WidgetPanel` via `DrawerHeader` |
| A close control, scrim click, Escape | `Drawer` |
| Focus trap; focus returns to the card on close | `Drawer` / `useFocusTrap` |
| Dialog semantics (`role="dialog"`, `aria-modal`, label) | `Drawer` |
| Right slide-out ≥1024px, **full-screen below** | `Drawer` + `fullBleedOnMobile` |
| Safe-area insets in the full-screen presentation | `WidgetPanel` (D4) |
| A bounded, scrolling content region | `WidgetPanel` (D7) |
| The scope caption | `WidgetPanel` — you declare which axes you honour |
| An optional second level with a back affordance | `WidgetPanel` (D6) |
| A route-out footer | `WidgetPanel` — you supply the destination |

**You are inside both scope providers.** Call `useDashboardScopeContext()` and
`useScopedTransactions(transactions)` directly. Do not accept, derive, or re-plumb scope
(FR-012).

---

## 3. What you must provide

| # | Requirement | Spec |
|---|---|---|
| C-1 | Declare which scope axes you honour, so the caption is honest. Omitting an axis you ignore is required, not optional. | FR-013, FR-014 |
| C-2 | An empty state, consistent with your card's. A card saying "No budgets yet." must not open onto a blank frame. | FR-020 |
| C-3 | At least one thing the card demonstrably cannot show. A longer version of the card is not a panel. | FR-016 |
| C-4 | A route out, where a fuller destination exists. Summarise and hand off; do not rebuild the destination. | FR-018 |
| C-5 | Copy in all five catalogs, in **your reserved sub-block only**. | FR-023, D9 |
| C-6 | Tests: behaviour and accessible DOM, written first. | Constitution VI |

---

## 4. What you must never do

| # | Prohibition | Why |
|---|---|---|
| X-1 | **Modify an existing kit primitive.** Add a new one in a new file instead. | D10 — the kit is append-only across parallel branches. Six concurrent mutators recreate the collision the kit prevents. |
| X-2 | **Edit another panel's catalog sub-block**, or append outside your own. | D9 — the pre-carving is the entire reason your merge is clean. |
| X-3 | **Touch `WidgetBoard`, `Widget`, `WidgetPanel`, or `dashboard/page.tsx`.** | These are the shared frame. If you believe you need a frame change, stop and raise it — it affects five other branches in flight. |
| X-4 | **Change any widget card's output.** | FR-025. `git status --short web/test/widgets/` should show only files you added; a modified pre-existing suite means a card moved. |
| X-5 | **Write financial data from the panel.** | FR-019. Routing to a screen that writes is fine; acting in place is not. |
| X-6 | **Fetch anything.** | FR-017. Derive from loaded data, as the cards do. |
| X-7 | **Introduce a colour, or show a loss/overspend/debt in red.** | FR-021, Constitution I. |
| X-8 | **State a projection as fact.** | FR-022. |

---

## 5. The one panel with a trap in it

**US7 — who owes whom.** Your panel MUST read the **whole** household ledger and narrow only
its *output*. It MUST NOT call `useScopedTransactions`.

`projectForPerson` rewrites every row to `{ amount_cents: <their share>, owner_ids: [personId] }`.
A debt exists precisely *because* one person paid for something others co-own — so projection
deletes the very relationship the debt derives from. Fed projected rows, `outstandingBalances`
finds a ledger of solo expenses, nets every pair to zero, and calmly renders **"All settled up."**
for a household that owes money.

That is a plausible wrong number, not a crash, and no test will catch it unless you write one.
`HouseholdBalancesBody` carries a ⚠️ comment warning off exactly this "make it consistent with
its siblings" refactor, and `test/widgets/household-balances.test.tsx` has a guard case. Your
panel inherits both. (FR-015, data-model P-4.)

---

## 6. Shape of a panel

```tsx
'use client'

/**
 * <Widget> detail panel (spec 057, US<n>).
 *
 * Answers: "<the question the card cannot answer>".
 * Scope: honours <time | people | both | neither> — see D5.
 */
export function ExamplePanel() {
  const { transactions: all, formatMoney, t } = useApp()
  const transactions = useScopedTransactions(all)     // people axis, if honoured
  const { interval, periodLabel } = useDashboardScopeContext()  // time axis, if honoured

  const rows = useMemo(() => /* derive */, [transactions, interval])

  if (rows.length === 0) return <PanelEmpty>{t('…')}</PanelEmpty>   // C-2

  return (
    <>
      {/* your content */}
    </>
  )
}
```

You render **content only**. The header, caption, scroll region, footer and back affordance are
the frame's — do not render your own.

---

## 7. Definition of done

- [ ] Tests written first, passing, and covering the empty state and both scope cases where the panel honours the people axis
- [ ] `git status --short web/test/widgets/` shows only files you added (X-4)
- [ ] Your diff touches exactly one shared line (the registry entry) plus your own catalog sub-block
- [ ] No kit primitive modified (X-1)
- [ ] Copy present in all five catalogs
- [ ] Verified at a phone width and a desktop width
- [ ] `npm test` green, `tsc --noEmit` clean, no golden-vector drift
