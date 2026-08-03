# Ortho — web

The Ortho household-finance web app, part of the [Ortho monorepo](../README.md). This is **the
canonical implementation** of Ortho: every product surface lives here, and the same bundle is what
ships to iOS. See [`../docs/web.md`](../docs/web.md) for the subsystem deep dive and
[`../docs/index.md`](../docs/index.md) for how web, Supabase, shared code, and the frozen iOS app
fit together.

## Architecture

- **Next.js 16 static export.** `output: 'export'` in [`next.config.ts`](./next.config.ts) — the
  app builds to static HTML/JS with no Next.js server at runtime.
- **Same bundle ships to iOS.** That static export is wrapped natively by Capacitor
  ([`web/ios/App/`](./ios/App)) — there is no separate iOS app to maintain (spec 021).
- **Self-hosted Lato font** via `next/font/local` — the exact `.ttf` files the iOS app bundles
  ([`app/fonts/*.ttf`](./app/fonts), wired up in [`app/layout.tsx`](./app/layout.tsx)), no Google
  Fonts CDN.
- **`app/page.tsx` is only a client redirect** to `/dashboard`; the real app lives under
  `app/(app)/`.

## Scripts

Defined in [`package.json`](./package.json):

| Script                  | What it does                                                              |
| ----------------------- | ------------------------------------------------------------------------ |
| `npm run dev`           | Local dev server (`next dev`).                                            |
| `npm run build`         | Static export build (`next build`) — the deployable/iOS-packaged output. |
| `npm test`              | Vitest (`vitest run`). **CI gate.**                                       |
| `npm run test:coverage` | Vitest with V8 coverage.                                                  |
| `npm run test:tz`       | Timezone regression suite (`vitest.tz.config.ts`).                        |
| `npm run gen:vectors`   | Regenerate `shared/test-vectors`. **CI gate** — the shared parity vectors must not drift. |
| `npm run gen:corpus`    | Generate the demo/test corpus.                                           |
| `npm run seed:corpus`   | Seed a demo household from the corpus.                                   |
| `npm run measure:bundle`| Report the production bundle size.                                       |

This is a **TDD repo**: `npm test` and `npx tsc --noEmit` are both CI gates, and new behavior lands
with tests first.

## Structure

Routes live under `app/(app)/`:

- **`dashboard`** — the toggleable widget board (widgets configured per-browser in
  Settings → Widgets).
- **`transactions`** (+ `new`, `edit`), **`budgets`**, **`goals`**, **`housing`** (+ `new`,
  `edit`).
- **`settings`** and its subroutes: `deposit-accounts`, `data`, `widgets`, `cards`,
  `linked-banks`, `currency`, `language`, `appearance`, `planning`, `account`, `household`,
  `subscription`.

See [`../docs/web.md`](../docs/web.md) for the full walkthrough of the store, finance helpers,
i18n catalogs, and per-route detail rather than re-listing everything here.

## Deploy

`npm run build` produces the static export. **Deploys are driven by CI**, not one-click Vercel:
[`.github/workflows/web-deploy.yml`](../.github/workflows/web-deploy.yml) (production) and
[`web-deploy-staging.yml`](../.github/workflows/web-deploy-staging.yml) (staging).
[`vercel.json`](./vercel.json) explicitly disables Vercel's own `main` auto-deploy so the CI
pipeline is the single source of truth.
