# Quickstart: Goal Detail & Contribution Editing (spec 045)

How to validate this feature end to end. Commands run from `web/`.

## Prerequisites

```bash
cd web
npm install
npm run dev            # http://localhost:3000
```

A household with at least two goals, one of them dated and behind pace, and one goal with
several contributions across at least three different months. `npm run seed:corpus` produces a
suitable household if you need one.

## Automated gates

```bash
npx tsc --noEmit                 # UNPIPED — must be clean
npm test                         # full suite green
npm run test:tz                  # date-sensitive suites under a shifted timezone
npm run gen:vectors              # then: git diff --exit-code shared/ → MUST be empty
npm run build                    # static export succeeds
```

`gen:vectors` showing no diff is the load-bearing check that this feature added presentation and
one write path, not new money math: `goalProgress`/`goalPacing` are untouched, and the new series
are deliberately not vectored (research R6).

Targeted suites while working:

```bash
npx vitest run test/finance/goalSeries.test.ts        # the pure series
npx vitest run test/goals                             # cards, detail page, contribution editing
npx vitest run test/web/planning-hub.test.tsx         # the hub's goals section
npx vitest run test/bundle/no-eager-recharts.test.ts  # recharts stays dynamic
npx vitest run test/i18n                              # all five catalogs
```

## Manual validation

Do these in a real browser — there is no browser in the sandbox, so this section is the part CI
cannot cover.

### Story 1 — the hub's goal cards

1. Open `/planning`. Each goal is its own card with a progress bar, saved-of-target, remaining,
   status, and its most recent contributions.
2. A behind-pace goal shows its monthly catch-up amount in calm sand. **Confirm nothing is red.**
3. Off-track goals sort above on-track ones.
4. Press "Add contribution" on a card, save, and confirm that card's figures move without a page
   change.
5. Confirm there is no "View all goals" link — the only way into goals is a specific goal.

### Story 2 — the detail page

6. Open a goal from its card. The URL is `/planning/goals?id=<uuid>`.
7. **Reload the page.** It must render the same goal, not a 404 and not a bounce to Planning.
   This is the check that the query-parameter decision (research R1) actually holds.
8. The page shows saved-of-target, progress, remaining, target date, and pace status.
9. The cumulative chart rises to the headline saved figure, with a straight pace line for a dated
   goal. **Read the last point against the headline — they must match.**
10. The per-month chart shows one bar per month across the goal's span, with gaps as zero bars.
11. Open an **undated** goal: the cumulative chart draws with no pace line and no projection copy.
12. Open a goal with **no contributions**: a calm empty state, not an empty chart frame.
13. Edit the goal from the detail page; saving returns you to the updated detail page.
14. Delete the goal; you land on `/planning` and it is gone.
15. Paste `/planning/goals?id=does-not-exist` — you land on `/planning`, with no error screen.

### Story 3 — contribution editing

16. On the detail page, edit a contribution's amount from $50 to $75. The saved total rises by
    **exactly $25**; the bar, remaining, and both charts follow.
17. Edit a contribution's date into a month with no other contributions. The per-month chart
    gains that month.
18. Clear the amount, or enter 0. Save is blocked and the stored contribution is unchanged.
19. Delete a single contribution. It leaves the ledger and the saved total drops by exactly its
    amount — the goal itself survives.
20. **The FX check.** Switch the display currency to GBP (Settings → Currency), open a
    contribution for editing, change nothing, and save. The saved total must be **byte-identical**
    to before. This is the round-trip drift guard (FR-021); it is the one manual step most likely
    to catch a real regression.

### Cross-canvas

21. Repeat 6–9 and 16 at phone width (≤639px): the charts and the ledger stay readable and there
    is **no horizontal page scroll**.
22. Check the detail page in dark mode — the pace line must stay visible against the saved series
    in both themes.
23. Confirm on the Capacitor iOS shell that opening a goal from the hub works and that the
    in-app back gesture returns to Planning. (macOS + Xcode only; otherwise rely on
    `capacitor-ios-ci.yml` for the build and note this as unverified.)

## Rollback

No migration, so rollback is a plain revert of the branch. `updateContribution` is additive; the
only destructive change is the loss of the goals index page, which the per-goal cards replace.
