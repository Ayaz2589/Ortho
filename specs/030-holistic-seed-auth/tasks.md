# Tasks: Holistic Seed System + Env-Gated Auth (spec 030)

Dependency-ordered. `[P]` = parallelizable with siblings. Each phase ends green.

## Phase A — Environment signal & production safety
- [ ] T001 Add `web/lib/app-env.ts`: `appEnv(): 'local'|'stage'|'prod'` from `NEXT_PUBLIC_APP_ENV`
      → `NEXT_PUBLIC_VERCEL_ENV` → `NODE_ENV`, **deny-by-default to `prod`**; `isLocal/isStage/isProd`.
- [ ] T002 Refactor `web/lib/test-build.ts` `isTestBuild()` = `appEnv() !== 'prod'` (same truth table).
- [ ] T003 [P] Tests `web/test/env/app-env.test.ts` (truth table + deny-by-default) + keep
      `web/test/flags/flags.test.ts` green.

## Phase B — Auto-login seam (real backend)
- [ ] T004 Add `web/lib/auth/autoLogin.ts`: `autoLoginEnabled()` (env + `NEXT_PUBLIC_DEV_AUTOLOGIN==='1'`
      + creds) and `autoLoginCreds()` (`NEXT_PUBLIC_DEV_AUTOLOGIN_EMAIL`/`_PASSWORD`).
- [ ] T005 Decouple `web/lib/supabase/client.ts`: memory-client only for `bypassAuth`; real client for
      auto-login.
- [ ] T006 Wire `web/lib/store.tsx runBootstrap()`: on no session + `autoLoginEnabled()` →
      `signInWithPassword` then continue; else existing redirect.
- [ ] T007 [P] Tests: prod cannot auto-login (dead-code/gate), non-prod attempts sign-in; store
      bootstrap covered.

## Phase C — Holistic corpus generator
- [ ] T008 Extend `web/test/corpus/model.ts`: add `goals/goal_contributions/tags/transaction_tags/
      linked_institutions/linked_accounts/entitlements` to `CorpusTables` + `HouseholdScenario`.
- [ ] T009 Add builders in `web/test/corpus/builders.ts` (reuse `lib/types` + `lib/finance/goals`,
      `lib/entitlements`). Transactions gain `tags`/`notes`.
- [ ] T010 Extend `web/test/corpus/coverage.ts`: new `Dimension`s (goals*, budget-flex/non_monthly,
      tags-notes, gate states, bank states, insight-trip).
- [ ] T011 Extend `web/test/corpus/scenarios.ts`: special scenarios per new dimension + attach new
      rows to the family; primary demo household.
- [ ] T012 `web/test/corpus/realism.ts` (NEW): pluggable distributions from the research doc.
- [ ] T013 `generate.ts` `toTables()` collects new tables; bump `CORPUS_VERSION`; extend
      `serialize.ts` manifest counts.
- [ ] T014 Extend `web/test/corpus/corpus.test.ts` assertions; regenerate snapshot (`npm run gen:corpus`).

## Phase D — Real-DB seeder
- [ ] T015 Extend `web/scripts/seed-corpus.ts` `seedPlan`/`ID_COLUMNS` for new tables (FK order).
- [ ] T016 Create `auth.users` (Admin API, known password, email confirmed) + insert `entitlements`
      (service-role). Keep `checkSeedTarget` guard.
- [ ] T017 [P] Verify `npm run seed:corpus -- --dry-run` counts + guard; update `seed-guard` tests if needed.

## Phase E — Remove hand-authored dummy data
- [ ] T018 Replace `web/lib/testdata/seed.ts` hand arrays with a curated corpus-derived subset
      (bundle-safe); keep `memory-client.ts` surface, flags, i18n, tests green.
- [ ] T019 Clear untracked `temp/`; confirm no hand-authored fake arrays remain under `web/lib/`.

## Phase F — Docs & ship
- [ ] T020 Update `docs/web.md`, `docs/supabase.md`, `docs/index.md`, `web/scripts/README.md`,
      root `CLAUDE.md` active-feature pointer; write `quickstart.md` Operator Runbook (staging
      Supabase + Vercel env vars + seed credentials).
- [ ] T021 Full green: `npm run gen:corpus`, `npm run gen:vectors` (if touched), `npm test`,
      `npx tsc --noEmit`. Commit + PR.
