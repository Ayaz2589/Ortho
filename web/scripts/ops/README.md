# Operator scripts (`web/scripts/ops/`)

Operator-run verification for features whose live checks cannot run from a dev
sandbox (no network route to the hosted Supabase project). Run these from a
networked host with `web/.env.local` populated. All are deliberate about
writes: the probe is read-only; the smoke creates only scratch rows and
deletes them afterwards.

## Spec 017 — partner invite & join

```bash
cd web
npx tsx scripts/ops/invite-probe.ts          # read-only: invite rails exist live (exit 0)
DRY_RUN=1 npx tsx scripts/ops/invite-smoke.ts  # print the E2E plan, write nothing
npx tsx scripts/ops/invite-smoke.ts          # live E2E: mint scratch owner+partner,
                                             # real invite → accept_invite → guarded
                                             # claim → re-redeem refused → cleanup
```

- `invite-probe.ts` — verifies `pending_invites` (+ its columns), the
  `accept_invite` RPC, and `household_people.linked_user_id` via the PostgREST
  swagger root. If anything is missing, it names it and exits 1 — do not
  enable the feature against that backend (see
  `supabase/migrations/20260521120000_initial_schema.sql`).
- `invite-smoke.ts` — needs `SUPABASE_SERVICE_ROLE_KEY` (GoTrue admin). The
  disposable partner uses password auth purely for the script's session; the
  apps themselves are OTP-only. Every scratch row (household cascade, both
  auth users) is removed in `finish()` even on failure.

Both are `[OPERATOR-PENDING]` deliverables of spec 017 (FR-026) — the feature
ships verified by the mocked suites + test-data mode; these close the live
loop. See `specs/017-partner-invite-join/quickstart.md` §4.
