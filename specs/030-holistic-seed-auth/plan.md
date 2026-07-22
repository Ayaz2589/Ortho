# Implementation Plan: Holistic Seed System + Env-Gated Auth (spec 030)

Read `spec.md` first. This plan maps requirements → concrete files and the build order. It gates on
the constitution (v2.0.0): web is the single canonical implementation, tokens-only design, loss
never red, test-first with regression vectors, and **production safety is absolute**.

## Architecture at a glance

```
NEXT_PUBLIC_APP_ENV ──► web/lib/app-env.ts  appEnv(): 'local'|'stage'|'prod'
                              │  (prod = deny-by-default when uncertain)
                              ├─► web/lib/test-build.ts  isTestBuild() = appEnv()!=='prod'   (unchanged truth table)
                              └─► web/lib/auth/autoLogin.ts  autoLoginEnabled(): appEnv()!=='prod' && NEXT_PUBLIC_DEV_AUTOLOGIN==='1' && creds
                                        │
web/lib/store.tsx runBootstrap() ──────┘  no session + autoLoginEnabled → signInWithPassword(seed user) → REAL backend
web/lib/supabase/client.ts             ── real client for auto-login; memory-client ONLY for bypassAuth (in-memory), now decoupled

web/test/corpus/  (spec 026 engine, extended)
  model.ts        + goals/goal_contributions/tags/transaction_tags/linked_institutions/linked_accounts/entitlements on CorpusTables + HouseholdScenario
  builders.ts     + buildGoal/buildContribution/buildTag/buildLinkedInstitution/buildLinkedAccount/buildEntitlement (reuse lib types + goals/entitlements logic)
  coverage.ts     + new Dimension entries (goals*, budget-flex/non_monthly, tags+notes, gate states, bank states, insight-trip)
  scenarios.ts    + new special scenarios; tag/notes/goals/banks/entitlements attached; realism demo household
  realism.ts      (NEW) pluggable distribution inputs from docs/research/finance-habits-budgeting-apps.md (spec 026 §9.2 seam)
  generate.ts     toTables() collects new tables; CORPUS_VERSION bump
  serialize.ts    manifest tracks new per-table counts → snapshot regenerates
  __snapshots__/corpus.snapshot.json  regenerated (npm run gen:corpus)

web/scripts/seed-corpus.ts  seedPlan + ID_COLUMNS extended (FK order) + auth.users (Admin API) + entitlements (service-role) + guard kept
web/lib/testdata/seed.ts    hand rows REMOVED → curated corpus subset (bundle-safe); memory-client unchanged surface
```

## Build order (each step ends green: `npx vitest run <area>` then full `npm test` at the end)

1. **Env signal (FR-001/002/004).** `web/lib/app-env.ts` + refactor `web/lib/test-build.ts` on top.
   Tests: `web/test/env/app-env.test.ts` (truth table incl. deny-by-default), keep
   `web/test/flags/flags.test.ts` green.
2. **Auto-login seam (FR-003/005).** `web/lib/auth/autoLogin.ts` (env-gated predicate + creds read);
   wire `web/lib/store.tsx runBootstrap()` to attempt `signInWithPassword` before the redirect;
   ensure `client.ts` returns the REAL client for auto-login and memory-client only for
   `bypassAuth`. Tests: prod-off proof + non-prod-on behavior.
3. **Corpus extension (FR-006/007/008).** Extend model/coverage/builders/scenarios; add assertions in
   `web/test/corpus/corpus.test.ts` (new dimensions non-empty, referential integrity for new FKs,
   share reconciliation unchanged). Regenerate snapshot; bump `CORPUS_VERSION`.
4. **Realism layer + demo household (FR-009/010).** `web/test/corpus/realism.ts`; designate the
   primary demo household; injectable "now".
5. **Seeder extension (FR-011..015).** `seed-corpus.ts` seedPlan/ID_COLUMNS + `auth.users` + entitlements;
   dry-run verifies per-table counts and guard behavior. (Live seed = operator step.)
6. **Dummy-data removal (FR-016/017).** Replace `testdata/seed.ts` with a corpus-derived subset; keep
   `memory-client.ts`, flags, i18n, and `web/test/**` green; clear untracked `temp/`.
7. **Docs.** `docs/web.md` (§14 harness), `docs/supabase.md`, `docs/index.md`, `web/scripts/README.md`,
   root `CLAUDE.md` active-feature pointer; `quickstart.md` Operator Runbook.
8. **Green + PR.** `npm run gen:corpus` + `npm run gen:vectors` if needed, `npm test`, `npx tsc --noEmit`.

## Key risks & mitigations

- **Snapshot blast radius.** Extending `CorpusTables` regenerates the manifest and may shift the
  232-scenario counts. Mitigate: additive scenarios, `CORPUS_VERSION` bump, review the manifest diff
  as the behavior change (spec-026 D2 discipline).
- **Production leakage.** Triple-gate auto-login (env + explicit opt-in + creds) and keep
  `appEnv()` deny-by-default; add a test asserting prod cannot auto-login and the paths eliminate.
- **RLS vs service-role.** Seeder runs as service-role (bypasses RLS); ledger still written so shares
  reconcile; `auth.users` created via Admin API so real sessions/RLS work in the app.
- **Cloud steps unavailable in sandbox.** Staging project + Vercel env are documented, not coded;
  the local path fully exercises the seam.

## Verification matrix

| Requirement | Verified by |
|---|---|
| FR-001/002/004 env + prod-deny | `web/test/env/app-env.test.ts`, flags tests |
| FR-003/005 auto-login | store bootstrap tests (prod-off + non-prod-on), client decouple test |
| FR-006/007/008 corpus | `web/test/corpus/corpus.test.ts` completeness + reconciliation |
| FR-011..015 seeder | seed-guard tests + `npm run seed:corpus -- --dry-run` counts |
| FR-016/017 dummy-data | grep no hand arrays; memory-client + flags tests green |
| SC-005/006 | `npm test`, `tsc`, gen:corpus drift, prod dead-code check |
