# Quickstart: Reports MVP

## Run & verify (Linux sandbox OK — nothing here is macOS-only)

```bash
cd web
npm test                 # full Vitest suite (incl. new reports/ tests)
npx tsc --noEmit         # typecheck gate (a type error fails next build)
npm run dev              # http://localhost:3000 → /dashboard, toggle Overview ↔ Reports
```

The sandbox's local Supabase already has the aggregate RPCs applied
(`20260611120000_aggregates.sql`), so `npm run dev` against `web/.env.local` (local stack)
exercises the real RPCs. Seed data via `npm run seed:corpus` (guarded to local DB) for a
populated household.

## Manual acceptance walkthrough

1. Open `/dashboard`. The **Overview | Reports** segmented control is at the top; Overview is
   selected and the dashboard looks exactly as before.
2. Click **Reports**. The reports surface replaces the overview content in place (same page,
   no navigation). A range picker (Month / 3M / 6M / 1Y — only ranges the data spans) shows.
3. **Savings-rate view**: one entry per in-scope month with income, expense, and savings rate;
   a time-series chart of the rate. A shortfall month reads via sign/label — never red. A
   zero-income month shows "—".
4. **Category deep-dive**: calm donut + ranked legend (category · amount · share), highest
   first.
5. Change the range → both views re-scope; other dashboard state is preserved.
6. Click **Overview** → the original dashboard returns unchanged.
7. Empty/loading/error: on a fresh/empty window a plainspoken empty line shows; on a forced
   RPC failure a plainspoken error line + Retry shows. None are red; no skeleton shimmer.

## Bundle check (optional, needs a build)

```bash
npm run build
npm run measure:bundle   # /dashboard initial-load must not grow by recharts;
                         # the reports chart chunk loads only when Reports is opened
```

## Guard tests to watch

- `test/bundle/no-eager-recharts.test.ts` — fails if any eager module imports recharts.
- `test/reports/*` — the pure helpers, the hook, and the three views (test-first).
- `test/dashboard/mode-switch.test.tsx` — toggle behavior + Overview intact.
