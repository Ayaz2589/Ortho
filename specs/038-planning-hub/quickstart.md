# Quickstart: Planning Hub

## Run

```bash
cd web
npm install                     # (+ Linux native-binary fix from docs/web.md if in a sandbox)
npm run dev                     # http://localhost:3000 → open /planning
```

## Verify (manual)

1. **Destination** — Planning appears in the desktop sidebar and the mobile tab bar (after
   Transactions), routes to `/planning`, and shows as current when active.
2. **Old link redirects** — visiting `/settings/planning` lands on `/planning`; Planning no longer
   appears in the Settings list or Settings secondary nav.
3. **Hero** — "Left to plan" for the current month shows income − budgeted − goal contributions with
   the three components beneath; an over-committed month reads as attention (never red).
4. **Month scope** — stepping the month bar forward/back (including a future month) recomputes every
   figure; "This month" returns to the current month.
5. **Budgets** — overall spent-vs-budgeted bar + top at-risk categories with remaining/over and
   rollover carry; "View all budgets" opens `/budgets`. No budgets → calm empty state with the link.
6. **Goals** — progress + on/off-track + projected/due + suggested monthly (when behind); behind
   goals first; "View all goals" opens `/goals`. No goals → calm empty state with the link.
7. **Sinking funds** — non-monthly categories list their set-aside amount; hidden when there are
   none.

Tip: run with the in-memory demo data (`ortho.flags` → `useTestData`, per docs/web.md §14) to see a
populated hub without a backend.

## Test

```bash
cd web
npm test -- test/planning/planSummary.test.ts     # pure math (TDD, injected dates)
npm test -- test/web/planning-hub.test.tsx         # hub composition + empty states + links
npm test -- test/nav.test.tsx                      # Planning destination present
npm test                                           # full suite
npx tsc --noEmit                                   # type gate
```

All planning math is pure with an injected `now` — never asserts against the real clock.
