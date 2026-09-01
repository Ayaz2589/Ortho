# Quickstart: validating Savings & Debts

**Feature**: `specs/059-savings-debts-redesign` | **Branch**: `feat/059-savings-debts-redesign`

## Prerequisites

```bash
cd web && npm install     # only if node_modules is absent
```

## 1 — Automated gates (all must pass)

```bash
cd web
npx tsc --noEmit                                   # types
npm test                                           # full suite
npm run test:tz                                    # timezone suite (TZ=America/New_York)
npm run gen:vectors && git diff --exit-code ../shared/test-vectors
npm run build                                      # static export
```

**`gen:vectors` producing no diff is a hard gate, not a formality.** This feature adds a projection
engine beside the vectored `goals.ts` rather than editing it (research R1). A diff in
`shared/test-vectors/goals.json` means `goalProgress`/`goalPacing` were touched — revert and re-add
the behaviour in `goalProjection.ts` instead.

Targeted suites while iterating:

```bash
npx vitest run test/finance/goalProjection.test.ts        # the engine
npx vitest run test/goals/                                # card, ledger, detail page
npx vitest run test/widgets/goals.test.tsx test/widgets/panels/goals-panel.test.tsx
npx vitest run test/i18n/                                 # catalog completeness
```

## 2 — Engine spot-check (no browser needed)

The projection is pure, so it can be checked directly:

```bash
cd web && npx tsx -e "
import { goalProjection } from './lib/finance/goalProjection'
const g = { id:'g1', kind:'debt_payoff', target_cents:1750000, target_date:null, created_at:'2026-02-01T00:00:00Z' }
const c = Array.from({length:7},(_,i)=>({ id:'c'+i, goal_id:'g1', amount_cents:60000, date:\`2026-0\${i+2}-01\`, created_at:'' }))
console.log(goalProjection(g, c, new Date(2026,7,15)))
"
```

Expect `available: true`, `basis: 'cadence'`, `paymentsToGo: 23`, and a `finishDate` in July 2028 —
the handoff's worked example.

## 3 — Manual walk (the part tests cannot cover)

Run the app and sign in to a household that has at least one debt-payoff item and one savings item,
each with three or more contributions:

```bash
cd web && npm run dev
```

> Ask the host to publish the port if it isn't reachable:
> `sbx ports <sandbox-name> --publish 3000:3000/tcp`

### 3a — Planning section
1. Open **Planning**. The section header reads **Savings & Debts** — the word "Goals" appears nowhere.
2. The aggregate sentence states a monthly commitment, an amount behind you, and a combined total.
3. A savings card's bar **grows from the left**; a debt card's bar is **anchored right** and shorter
   the more has been paid. Confirm you can tell the two apart *without reading a word*.
4. Each card's last line names a finish month and a payment/deposit count.
5. **No contribution rows are visible** on a collapsed card.

### 3b — The disclosure
6. Tap the "N contributions · every Nth" disclosure. The list unfolds in place; the cards below move
   down smoothly, not abruptly.
7. Open a second card's disclosure — the first collapses.
8. Edit a row's amount inline. The card's headline, bar, and total row all update, and you never left
   Planning.
9. With the OS set to reduce motion, the disclosure opens instantly with no animation.

### 3c — Detail page
10. Open one item. Five blocks render: projected finish (with a what-if table), progress toward
    target, pace against plan, consistency, contributions.
11. In the what-if table, an earlier date is marked as sooner in sage; a later one is plain. **Nothing
    is red.**
12. The progress chart's line ends at a dot at today, with a dashed projection running to the target
    line. The x-axis reads start → today → projected finish.

### 3d — Not-enough-history
13. Create a new item and add **one** contribution. Its card reads "Not enough history to project
    yet"; no month and no payment count appear. Open it: the four analysis blocks collapse to that
    same line, and the contributions block still lists the one row.

### 3e — Dashboard
14. Open the **Dashboard**. The widget is titled **Savings & Debts** and each row uses the
    type-appropriate headline and bar direction.
15. Click it. The panel opens with the same vocabulary, and the finish month it states for an item
    **matches** the Planning card for that item.

### 3f — Overflow and language
16. Narrow the browser to 360px (or use a phone). Nothing scrolls sideways on Planning, the detail
    page, or the panel. A long item name truncates rather than pushing the amount off screen.
17. Switch language in Settings to each of বাংলা / Español / 日本語 / 한국어 / 简体中文. Every string in
    the section, the detail page, the widget, and the panel is translated — no English leaks.

### 3g — Themes
18. Toggle light and dark. Both read correctly; nothing is red in either.

## 4 — What to report as unrun

The real-iOS check needs hardware this environment does not have. If no device is available, report
step 19 as **UNRUN** — do not tick it.

19. On a physical iPhone, confirm the detail page and the panel respect the safe areas (Dynamic Island
    and home indicator) and that the disclosure animation does not stutter.

## Rollback

No migration, so rollback is a code revert with no data step:

```bash
git revert <merge-sha>
```

Stored `goals` and `goal_contributions` rows are untouched by this feature (SC-010), so a revert
restores the previous UI over exactly the same data.
