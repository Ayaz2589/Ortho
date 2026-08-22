# Quickstart: Widget Detail Panels (base branch)

**Feature**: 057 | **Date**: 2026-08-22 | **Plan**: [plan.md](./plan.md)

Validation guide for the base branch — US1 (frame), US2 (home equity), US3 (budgets), US10
(activity), plus the two collision-proofing measures.

---

## §1 — Automated checks

Run from `web/`:

```bash
npm test                 # full suite, including the new panel suites
npx tsc --noEmit         # types
npm test -- --coverage   # lib/ coverage bar (Constitution VI)
```

### The three that actually matter

**1. The regression lock held.**

```bash
git status --short web/test/widgets/
```

Every line must be `??` (added). A modified pre-existing suite means a widget card moved, which
FR-025 forbids and SC-007 measures. This is the single most important check on the branch — the
same invariant spec 056 tracked, and it is evidence, not ceremony.

**2. `widget-board.test.tsx` passes unmodified.**

```bash
npm test -- test/widgets/widget-board.test.tsx
```

Its "opens a detail panel … with a placeholder" case asserts `Details coming soon.` on
`defaultEnabledTitles[0]` — which is `financial-health`, the widget this feature excludes
(FR-007). It should pass untouched. If it fails, either registry order changed or financial
health gained a panel; **fix the cause, do not edit the test** without deciding that
deliberately (research D11).

**3. The budget engine did not move.**

```bash
npm test -- test/finance/budgets            # or wherever budgetStatusForMonth is pinned
npm run test:vectors                        # golden-vector drift, if the script exists
```

D8's extraction is a pure move. `budgetStatusForMonth`'s existing tests must pass unmodified and
no vector may regenerate differently.

---

## §2 — Manual validation

Needs a dev server (`npm run dev`) and a household with: **two or more people**, shared
transactions, **at least two budgets** (one carrying a balance forward, one overspent), and
**at least one mortgage** — ideally two, to exercise the second level.

### Frame (US1)

| # | Check | Expect |
|---|---|---|
| 1.1 | Click any widget with a panel, desktop width | Right slide-out, board dimmed behind |
| 1.2 | Close via the X, then the scrim, then Escape | All three dismiss it |
| 1.3 | Tab into the panel | Focus enters and stays trapped; returns to the card on close |
| 1.4 | Narrow the window below 1024px, open a panel | **Full screen** — hero and scope controls covered, no scrim |
| 1.5 | Open a panel, then resize across 1024px | Stays open and usable in both presentations |
| 1.6 | Open the financial health widget | Still `Details coming soon.` (FR-007) |
| 1.7 | Open a settings shortcut widget | Navigates; no panel (FR-006) |
| 1.8 | Set month + person, open any panel | Caption names **both**; figures match |
| 1.9 | Open a panel with more content than fits | Scrolls inside the panel; nothing clipped |

### Home equity (US2)

| # | Check | Expect |
|---|---|---|
| 2.1 | Open the panel | Payoff date and years remaining beside the equity headline |
| 2.2 | Scroll down | Upcoming payments, each split into principal and interest |
| 2.3 | Two or more mortgages | Listed separately, not summed as on the card |
| 2.4 | Select one mortgage | Its own schedule, with a **back** control returning to the list — not closing the panel |
| 2.5 | Press Escape at the second level | Steps **back** one level; a second Escape closes (D6) |
| 2.6 | Household with no mortgage | Calm explanation, not an empty table |

### Budgets (US3)

| # | Check | Expect |
|---|---|---|
| 3.1 | Open the panel | One section per budget, each listing its composing transactions |
| 3.2 | A budget carrying a balance forward | Carry history across recent months, not just this month's figure |
| 3.3 | Mid-month | A month-end projection, **worded as a projection** (FR-022) |
| 3.4 | Scope to a person with no personal limit in a category they spend in | Named as having no personal limit; **no household limit borrowed** |
| 3.5 | An overspent budget | Sand accent — **never red** |
| 3.6 | Household with no budgets | Calm prompt to set one |

### Activity (US10)

| # | Check | Expect |
|---|---|---|
| 4.1 | Open the panel | Longer feed than the card's five, newest first, grouped by date |
| 4.2 | Change the month | Feed does **not** window — and the caption does not claim a month (D5) |
| 4.3 | Scope to a person | Feed narrows to their rows |
| 4.4 | Select a row | Reaches that transaction |
| 4.5 | Route out | Goes to transactions |

---

## §3 — Requires real hardware

**Cannot be verified in a Linux sandbox or a desktop browser.** Report as unrun rather than
assumed — this is the discipline spec 056's T025 established, and quietly ticking it off is the
failure mode to avoid.

| # | Check | Expect |
|---|---|---|
| 5.1 | Open any panel on a notched iPhone (Dynamic Island) | Header clears the island; nothing under it |
| 5.2 | Scroll to the bottom | Content clears the home indicator |
| 5.3 | Rotate with a panel open | Stays open, safe areas still respected |

FR-010 is a Constitution III hard requirement, and D4 established that `Drawer` does **not**
provide it — the frame does. So this is a real check, not a formality.

---

## §4 — Collision-proofing (the six follow-ups depend on these)

| # | Check | How |
|---|---|---|
| 6.1 | All five catalogs carry a spec-057 region with a sub-block per panel, **including the six not built here** | `grep -n "spec 057" web/lib/i18n/{bn,es,ja,ko,zh}.ts` |
| 6.2 | Sub-blocks are non-adjacent and individually labelled | Read one catalog; a sandbox must be able to find its own block unambiguously |
| 6.3 | The kit was extracted **after** US2 and US3, and US10 was built **on** it | Commit order on the branch (plan Build Order steps 3→4→5) |
| 6.4 | The append-only rule is written where a sandbox will read it | [contracts/panel-contract.md](./contracts/panel-contract.md) §4 X-1 and [follow-up-brief.md](./contracts/follow-up-brief.md) |
| 6.5 | A panel's touch points really are four, one of them shared | Inspect the US10 commit — it is the model a sandbox will copy |

6.5 is worth doing honestly. US10 was built last, on the extracted kit, precisely so its diff
demonstrates what a follow-up sandbox's diff should look like. If US10 had to touch the frame,
SC-006 is not yet true and the fan-out should wait.

---

## §5 — Before merging

- [ ] §1 green, including all three "checks that matter"
- [ ] §2 walked at both a phone width and a desktop width
- [ ] §3 attempted on hardware, or **explicitly reported as unrun**
- [ ] §4 verified — the six sandboxes are blocked on this
- [ ] `docs/web.md` and `CLAUDE.md` updated
- [ ] Constitution II sanity check: the amortization table still reads calm, not crammed (plan, Constitution Check)
