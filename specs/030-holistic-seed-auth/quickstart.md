# Quickstart / Operator Runbook — Holistic Seed + Env-Gated Auth (spec 030)

Read `spec.md` and `plan.md` first. This is the operator guide: how to run the holistic seed
locally, and how to stand up a staging environment with auto-login. **Production is never touched.**

## What ships in this feature (code, verified in CI)

- `lib/app-env.ts` — `appEnv(): local | stage | prod` (deny-by-default to `prod`); `isTestBuild()`
  now rides on it.
- `lib/auth/autoLogin.ts` + `store.tsx` — triple-gated auto-login against the real backend.
- `web/test/corpus/*` — the corpus extended to goals/tags/banks/entitlements + `realism.ts` demo
  household.
- `web/scripts/seed-corpus.ts` — the holistic seeder (creates `auth.users`, seeds every table).
- `lib/testdata/seed.ts` — the in-app "Use test data" seed, now generated (no hand-typed rows).

## A. Run the app on a seeded LOCAL backend with auto-login

1. **Start the local Supabase stack** and apply migrations:
   ```bash
   supabase start                      # http://127.0.0.1:54321
   supabase db reset                   # applies supabase/migrations/*
   ```
2. **Point the web app at the local stack** in `web/.env.local`:
   ```bash
   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<local anon key from `supabase status`>
   SUPABASE_SERVICE_ROLE_KEY=<local service_role key from `supabase status`>
   # spec 030 — environment + auto-login (LOCAL/STAGE ONLY; never set in prod):
   NEXT_PUBLIC_APP_ENV=local
   NEXT_PUBLIC_DEV_AUTOLOGIN=1
   NEXT_PUBLIC_DEV_AUTOLOGIN_EMAIL=seed@ortho.test
   NEXT_PUBLIC_DEV_AUTOLOGIN_PASSWORD=ortho-seed-password
   # the seeder must mint the SAME credentials for the demo owner:
   SEED_USER_EMAIL=seed@ortho.test
   SEED_USER_PASSWORD=ortho-seed-password
   ```
3. **Seed the demo household** (creates the `auth.users` seed user + populates every screen):
   ```bash
   cd web
   npm run seed:corpus -- --dry-run    # preview per-table counts + guard verdict (no writes)
   npm run seed:corpus                 # seed the demo household (idempotent)
   npm run seed:corpus -- --corpus     # ALSO seed the full edge-coverage corpus (~236 households)
   ```
   The safe-target guard refuses any non-local URL unless `--i-understand-this-is-not-local` AND
   `SEED_ALLOW_REMOTE=1` are both set.
4. **Run the app** (`npm run dev`). It detects `appEnv() === 'local'`, auto-signs-in
   `seed@ortho.test` against the local backend, and lands on a fully populated Dashboard — no OTP,
   real RLS/RPCs/edge functions.

## B. Stand up a dedicated STAGING environment

Staging is a first-class, isolated environment that behaves like production but is auto-signed-in on
seed data and never touches the production project.

1. **Create a dedicated staging Supabase project** (separate ref from prod
   `brujhxmtzfgowimprueo`). Apply migrations to it (`supabase link` + `supabase db push`, or the
   `supabase-migrations.yml` lane pointed at the staging ref).
2. **Set the staging Vercel environment variables** (Vercel › Project › Settings › Environment
   Variables, scoped to the *Preview*/staging environment only — never Production):
   - `NEXT_PUBLIC_APP_ENV=stage`
   - `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` → the **staging** project
   - `NEXT_PUBLIC_DEV_AUTOLOGIN=1`, `NEXT_PUBLIC_DEV_AUTOLOGIN_EMAIL`, `NEXT_PUBLIC_DEV_AUTOLOGIN_PASSWORD`
3. **Seed the staging project** from a trusted machine (NOT CI) against the staging URL with the loud
   double opt-in:
   ```bash
   SEED_ALLOW_REMOTE=1 SEED_USER_EMAIL=<stage seed email> SEED_USER_PASSWORD=<stage seed pw> \
     npm run seed:corpus -- --corpus --i-understand-this-is-not-local
   ```
4. **Verify production is untouched:** the Production Vercel environment must have
   `NEXT_PUBLIC_APP_ENV=prod` (or leave it unset — `NEXT_PUBLIC_VERCEL_ENV=production` already
   resolves to `prod`) and MUST NOT set any `NEXT_PUBLIC_DEV_AUTOLOGIN*` var. With `appEnv() === 'prod'`
   the auto-login and test-data code paths dead-code-eliminate.

## Safety invariants (do not violate)

- **Never** set `NEXT_PUBLIC_DEV_AUTOLOGIN*` on the production Vercel environment.
- **Never** run `seed:corpus` against the production Supabase project; the guard refuses it, and the
  double opt-in must only ever target a throwaway local/staging project.
- The seed user's password is a disposable credential owning only seed data on a non-prod backend.

## Follow-ups (not in this feature)

- Force-realization coverage for the remaining insight rules (MoM delta, outlier, 30-day trend,
  mortgage affordability) as labelled corpus dimensions with realization tests (the goal off-track
  insight is already realization-tested; see `spec.md` FR-008).
- Optional: re-anchor the edge corpus dates to the seed run's "now" so edge scenarios are also
  visible in the current month (today they stay pinned to the fixed epoch by design).
