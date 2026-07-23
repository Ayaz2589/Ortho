# Environments & deploy — local · stage · prod

Read this when working on the **deploy pipeline, CI/CD, or the environment model** — how a
change reaches production, how to ship to (or stand up) staging, which env vars live where, and
which Git branch drives which environment. Companion docs: [web.md](./web.md) (the app + its
Vercel settings + `appEnv()`/auto-login code), [supabase.md](./supabase.md) (schema/migrations +
the validate lane), [ios.md](./ios.md) (Capacitor + TestFlight).

Design origin: **spec 030** (holistic seed + env-gated auth) added the first-class `stage`
environment; the **2026-07-19 prod outage** (new code shipped against an un-migrated schema) drove
the migrate-before-deploy prod pipeline. Both landed 2026-07-22/23.

---

## 1. The three environments at a glance

| | **local** | **stage** | **prod** |
|---|---|---|---|
| `appEnv()` | `local` | `stage` | `prod` |
| Git branch | — (dev machine) | `main` (auto) | `main` (manual promote) |
| Supabase project | local stack (`127.0.0.1:54321`) | `oozwqzsfbtkzywsxrzdq` | `brujhxmtzfgowimprueo` |
| Vercel environment | — | custom env **`staging`** | **Production** |
| Live URL | `localhost:3000` | `ortho-env-staging-ayaz2589s-projects.vercel.app` | `ortho-murex-eight.vercel.app` |
| Auto-login | ✅ | ✅ (seed user) | ❌ (locked) |
| Seed/demo data | ✅ | ✅ | ❌ (real users) |
| Web deploy | `npm run dev` | `web-deploy-staging.yml` — **auto** on push to `main` | `web-deploy.yml` — **manual** (`workflow_dispatch`) |
| DB migrations | `supabase db reset` | `web-deploy-staging.yml` `migrate` job | `web-deploy.yml` `migrate` job |

**Deploy model:** merging to `main` **auto-deploys staging** (migrate-before-deploy); **prod is a
manual promotion** of that same code (`web-deploy.yml` ▸ Run workflow). `main` is the integration
line — it never ships to prod on its own, so `main` can legitimately sit ahead of prod.

**Production safety is the hard invariant:** every non-prod affordance (auto-login, test-data,
seeding) is provably impossible in prod (§2, §3). prod is *deny-by-default*.

---

## 2. The environment discriminator — `web/lib/app-env.ts`

`appEnv(): 'local' | 'stage' | 'prod'` collapses every build/runtime signal into one value.
Resolution order (first hit wins):

1. **`NEXT_PUBLIC_APP_ENV`** — the explicit per-environment signal (`local|stage|prod` only). Set
   in each Vercel environment and in `web/.env.local`.
2. **`NEXT_PUBLIC_VERCEL_ENV`** — `production→prod`, `preview→stage`, `development→local`.
3. **`NODE_ENV`** — `development`/`test`→local, `production`→prod.
4. **Deny by default → `prod`.** Anything we can't positively prove is non-prod is treated as prod.

Because every input is a build-time constant, a prod build **dead-code-eliminates** the
local/stage machinery. We set `NEXT_PUBLIC_APP_ENV` **explicitly** in every Vercel environment
rather than leaning on signal #2 — notably prod deploys via `vercel build --prebuilt`, which does
*not* reliably inject Vercel's own `VERCEL_ENV`, so prod is made explicit (with deny-by-default as
the backstop). `isTestBuild()` (spec 015) rides on `appEnv() !== 'prod'`.

## 3. Auto-login (local + stage only) — `web/lib/auth/autoLogin.ts`

In non-prod, the app can sign a known **seed user** into the *real* backend automatically, skipping
OTP — so a developer or the staging site opens already authenticated and fully populated, still
exercising real RLS/RPCs/edge functions. **Triple-gated** (all build-time constants):

1. `appEnv() !== 'prod'`, **and**
2. `NEXT_PUBLIC_DEV_AUTOLOGIN === '1'`, **and**
3. `NEXT_PUBLIC_DEV_AUTOLOGIN_EMAIL` + `NEXT_PUBLIC_DEV_AUTOLOGIN_PASSWORD` both set.

The password is a **disposable seed-only credential** owning only throwaway data on a non-prod
backend. **Never set any `NEXT_PUBLIC_DEV_AUTOLOGIN*` var on the prod Vercel environment.**

---

## 4. Production

- **Supabase:** project `brujhxmtzfgowimprueo`. Migrations applied by CI (never by hand — that was
  the outage cause).
- **Vercel:** **Production** environment, branch-tracked to `main`, alias `ortho-murex-eight.vercel.app`.
  Env vars: `NEXT_PUBLIC_APP_ENV=prod` (expected per `web-deploy.yml`'s activation notes — **verify
  it is actually set in the Production scope**; prod is deny-by-default regardless, so this is
  belt-and-suspenders), `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` → the prod
  project. **No `NEXT_PUBLIC_DEV_AUTOLOGIN*`.** Root Directory = `web`.
- **Deploy pipeline — `.github/workflows/web-deploy.yml` (owns prod, MANUAL):** trigger it
  deliberately (Actions ▸ "Web deploy (prod)" ▸ Run workflow, or `gh workflow run web-deploy.yml`,
  from `main`). Two jobs:
  1. **`migrate`** — `supabase link` + `supabase db push` against `SUPABASE_PROJECT_REF` (concurrency
     `prod-schema-write`, `cancel-in-progress: false` — never interrupt a migration). Optional
     approval gate via the `prod-web-deploy` environment (ungated until reviewers are added).
  2. **`deploy`** (`needs: migrate`) — Vercel CLI (`vercel pull --environment=production` →
     `vercel build --prod` → `vercel deploy --prebuilt --prod`), CLI **pinned `vercel@56.5.0`**
     (concurrency `prod-deploy`, `cancel-in-progress: true` — newest push wins).

  **Schema always lands before the code that needs it** — this is the migrate-before-deploy guard
  that closes the 2026-07-19 race. A failed `migrate` blocks the deploy.
- **Vercel Git auto-deploy for `main` is DISABLED** — `web/vercel.json` commits
  `{ "git": { "deploymentEnabled": { "main": false } } }`, so Vercel's integration no longer races
  the migration. (There is no dashboard toggle for this; the file is the switch.) Preview/branch
  deploys still auto-deploy.
- **`.github/workflows/supabase-migrations.yml` is now VALIDATE-ONLY** — it rejects bad filenames
  and duplicate 14-digit version prefixes on every PR/push; its old prod-`migrate` job was retired
  when `web-deploy.yml` took over (no more double `db push`).

## 5. Staging

A first-class isolated environment that behaves like prod but auto-signs-in on seed data and never
touches the prod project.

- **Supabase:** dedicated project `oozwqzsfbtkzywsxrzdq` (AWS us-east-1) — physically separate from
  prod. **New-format API keys** (`sb_publishable_…` anon / `sb_secret_…` service-role); both work
  (the secret key drives the admin seed). Supabase's native GitHub integration is **not connected**
  — our CLI lanes own migrations; branching is deliberately unused.
- **Vercel:** a **custom environment named `staging`** (Settings → Environments), deployed by
  `web-deploy-staging.yml` via the Vercel CLI (`--target=staging`) on every push to `main` — **not**
  by Git branch-tracking. URL `ortho-env-staging-ayaz2589s-projects.vercel.app` (custom-env alias pattern:
  `ortho-env-<envname>-<team>.vercel.app`, **not** the `-git-<branch>-` preview alias). Env vars,
  scoped to the `staging` env — **all PLAIN, not "Sensitive"** (see §9):
  ```
  NEXT_PUBLIC_APP_ENV=stage
  NEXT_PUBLIC_SUPABASE_URL=https://oozwqzsfbtkzywsxrzdq.supabase.co
  NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_…
  NEXT_PUBLIC_DEV_AUTOLOGIN=1
  NEXT_PUBLIC_DEV_AUTOLOGIN_EMAIL=seed@ortho.test
  NEXT_PUBLIC_DEV_AUTOLOGIN_PASSWORD=ortho-seed-password
  ```
- **DB migrations — `web-deploy-staging.yml` `migrate` job:** on push to `main`, `supabase db push`
  against `SUPABASE_STAGING_PROJECT_REF` runs FIRST and the staging web deploy is gated behind it
  (`needs: migrate`) — the same migrate-before-deploy guard as prod. Concurrency
  `staging-schema-write`, `cancel-in-progress: false`. (The old standalone
  `supabase-migrations-staging.yml` lane was folded into this and removed.)
- **Seed data:** the demo household (spec 030) — 1 household, 2 users, ~68 transactions, 2 goals,
  seeded from a trusted machine (§8). Owner `seed@ortho.test` is the auto-login user.

## 6. Local

```bash
supabase start                 # http://127.0.0.1:54321
supabase db reset              # replays supabase/migrations/* (seed.sql is a no-op)
```
`web/.env.local` (gitignored): `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY` (from `supabase status`),
`NEXT_PUBLIC_APP_ENV=local`, and the `NEXT_PUBLIC_DEV_AUTOLOGIN*` + `SEED_USER_*` block. Seed with
`npm run seed:corpus` (§8), then `npm run dev` → auto-logs-in on a populated Dashboard. Full local
runbook: `specs/030-holistic-seed-auth/quickstart.md §A`.

---

## 7. GitHub Actions config (repo → Settings → Secrets and variables → Actions)

| Kind | Name | Value / purpose | Used by |
|---|---|---|---|
| Variable | `SUPABASE_PROJECT_REF` | `brujhxmtzfgowimprueo` (prod) | `web-deploy.yml` |
| Variable | `SUPABASE_STAGING_PROJECT_REF` | `oozwqzsfbtkzywsxrzdq` (stage) | `web-deploy-staging.yml` |
| Variable | `VERCEL_ORG_ID` | `team_Wwk1YYk6ezPG2UUbCMdI49ts` | `web-deploy(-staging).yml` |
| Variable | `VERCEL_PROJECT_ID` | `prj_ihPJ6iduQg7cAQ8UZ2gvZqPl5yoK` | `web-deploy(-staging).yml` |
| Secret | `SUPABASE_ACCESS_TOKEN` | account-scoped PAT (links any project) | prod + stage lanes |
| Secret | `SUPABASE_DB_PASSWORD` | prod DB password | `web-deploy.yml` |
| Secret | `SUPABASE_STAGING_DB_PASSWORD` | stage DB password | `web-deploy-staging.yml` |
| Secret | `VERCEL_TOKEN` | Vercel deploy token (step-scoped) | `web-deploy(-staging).yml` |

Every workflow is gated to `github.repository == 'Ayaz2589/Ortho'` and its ref, and skips **green**
(not red) until its identifiers are configured — so merging an inert lane changes nothing.

## 8. How to ship

- **To staging (automatic):** merge to `main`. `web-deploy-staging.yml` migrates the staging DB then
  deploys the web app to the `staging` env. Watch: `GH_TOKEN=placeholder gh run watch <id> --exit-status`.
- **To prod (manual promotion):** once it looks right on staging, run `web-deploy.yml` deliberately —
  Actions ▸ "Web deploy (prod)" ▸ **Run workflow** (from `main`), or `gh workflow run web-deploy.yml`.
  It migrates prod then deploys the same `main` code. `main` never ships to prod on its own.
- **Seed / re-seed staging** (trusted machine — needs the service-role key, **never CI**):
  ```bash
  cd web
  SEED_ALLOW_REMOTE=1 \
  NEXT_PUBLIC_SUPABASE_URL=https://oozwqzsfbtkzywsxrzdq.supabase.co \
  SUPABASE_SERVICE_ROLE_KEY=<stage sb_secret_… key> \
  SEED_USER_EMAIL=seed@ortho.test SEED_USER_PASSWORD=ortho-seed-password \
    npm run seed:corpus -- --i-understand-this-is-not-local   # add --dry-run to preview
  ```
  The safe-target guard refuses a non-local URL unless **both** `SEED_ALLOW_REMOTE=1` and
  `--i-understand-this-is-not-local` are set. Demo-only by default; add `--corpus` for the ~236
  edge households (owned by other users — invisible to the auto-login user, so usually skip).

## 9. Gotchas

- **Vercel "Sensitive" env vars break the build.** Sensitive vars are **not** available at
  `next build`, so `NEXT_PUBLIC_*` values inline as empty strings → the Supabase client throws
  `Invalid supabaseUrl` during prerender (this cost one failed staging build). All 6 staging vars
  must be **plain**. "Sensitive" is pointless for `NEXT_PUBLIC_*` anyway — they ship in the public
  browser bundle regardless.
- **`main` drives BOTH stage and prod, but differently.** A `main` push auto-deploys staging
  (`web-deploy-staging.yml`); prod only moves when you manually run `web-deploy.yml`. So `main` can
  legitimately be ahead of prod — that promotion gap is by design; don't expect a `main` merge to
  change prod.
- **Custom-env URL ≠ preview URL.** A custom environment uses `ortho-env-<envname>-<team>.vercel.app`,
  not the `ortho-git-<branch>-<team>.vercel.app` alias — don't guess the preview form.
- **Root Directory = `web`** is the #1 first-deploy failure on Vercel (the repo root is not the app).
- **New-format keys.** Staging uses `sb_publishable_`/`sb_secret_` keys (not the legacy anon/
  service_role JWTs). If the app ever rejects a publishable key, the legacy anon JWT is still in
  Supabase → Settings → API as a fallback.
- **The `staging` git branch is retired.** Staging deploys from `main` now, so the old `staging`
  branch is vestigial — delete it and don't push to it (nothing migrates or deploys from it anymore).

## 10. Cross-links

- [./web.md](./web.md) §16 — the app's Vercel settings, `appEnv()`/auto-login code, build commands.
- [./supabase.md](./supabase.md) §8 — the validate lane + migration discipline.
- `.github/workflows/web-deploy.yml` (prod, manual), `web-deploy-staging.yml` (stage, auto on
  `main`), `supabase-migrations.yml` (validate-only) — each has an inline runbook header.
- `specs/030-holistic-seed-auth/quickstart.md` — the original local (§A) + staging (§B) runbooks.
