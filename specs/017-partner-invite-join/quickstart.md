# Quickstart / Validation: Partner Invite & Join (017)

How to prove the feature works, layer by layer. Implementation details live in
[plan.md](./plan.md) / [tasks.md](./tasks.md); contracts in [contracts/](./contracts/).

## Prerequisites

- Node 22 (`.nvmrc`), `cd web && npm install` done, suite green at baseline (731 tests).
- No live-backend access is required for anything except §4 (operator-only).

## 1. Automated suites (the primary gate — Linux-runnable)

```bash
cd web
npx tsc --noEmit          # type gate
npm test                  # full suite: baseline 731 + new 017 suites, all green
```

New/amended suites to expect green:
- `test/invites.test.ts` — codec (+ shared literal cases from contracts/invite-code.md §6)
- `test/invite-flows.test.tsx` — create / one-time reveal / list statuses / revoke (+rollback)
- `test/join-flows.test.tsx` — bootstrap choice, start-fresh equivalence (FR-024), redeem
  ok/invalid/already-member, claim picker (+lost race), persisted household pick
- `test/refresh.test.tsx` — success atomicity, failure keeps data, form preservation
- amended bootstrap/store suites — solo user unchanged (SC-004)
- `test/i18n/catalog-parity.test.ts` — picks up the ~35 new keys automatically

Golden vectors: `npm run gen:vectors && git diff --exit-code ../shared/test-vectors/`
must show **zero drift** (SC-006).

## 2. Interactive validation (web, test-data mode — no live backend)

```bash
cd web && npm run dev     # http://localhost:3000
```

1. Sign-in page → (test build) Settings → Developer → **Use test data** ON.
2. Settings → Household: as the seeded owner, the **Invite your partner** card renders;
   Create invite → a `XXXXX-XXXXX` code is revealed once with Copy / Copy link; the list
   shows it Pending with expiry. Revoke removes it.
3. Enter a code at `/join?code=AAAAA-AAAAA` → calm invalid-code message (test-data rpc
   resolves null — expected).
4. Sidebar footer (desktop ≥1024px) and Transactions header (compact width): the discreet
   Refresh control spins once and announces "Updated"; no data blanks.
5. Repeat 2–4 in each of the six languages (Settings → Language) — no English leaks on the
   new surfaces.

## 3. iOS validation (CI-only from this environment)

Push the branch → `.github/workflows/ios-ci.yml` must go green (build + XCTest incl. the new
`InviteCodecTests`), then download the `simulator-screenshots` artifact and visually check:
- Settings → Household shows **Invite your partner** (owner) + **Join a household** rows.
- Transactions list still renders (pull-to-refresh is a gesture — presence is verified by
  code review + compile; behavior by the operator device pass).

```bash
GH_TOKEN=placeholder gh run watch --exit-status
```

## 4. `[OPERATOR-PENDING]` live verification (requires network to the hosted project)

Run from a networked host with `web/.env.local` populated:

```bash
cd web
npx tsx scripts/ops/invite-probe.ts        # read-only: rails exist live (exit 0)
DRY_RUN=1 npx tsx scripts/ops/invite-smoke.ts  # prints the E2E plan
npx tsx scripts/ops/invite-smoke.ts        # mints disposable partner, redeems a real
                                           # invite, claims a scratch person, cleans up
```

Then the human two-device pass (SC-001/002/003):
1. Device A (owner): create invite, share the code.
2. Device B (partner's email): sign in → Join with a code (web) / Settings → Join a
   household (iOS) → claim your roster person.
3. Verify: partner sees the shared ledger; settle-up balance reads identically (mirrored)
   on both devices; A adds a transaction → B pull-to-refresh/Refresh → row appears ≤10s.
4. Relaunch B twice: the shared household opens every time (SC-007).

## 5. Success-criteria traceability

| SC | proven by |
|---|---|
| SC-001 | §4 human pass (timing) + §1 join-flow suite (steps exist, no dead ends) |
| SC-002 | §1 join-flows claim assertions (balances/attribution presented as "you") + §4.3 |
| SC-003 | §1 refresh suite + §4.3 timing |
| SC-004 | §1 amended bootstrap suites all green |
| SC-005 | §1 join-flows error paths ×6 languages (catalog-parity + render-locale) |
| SC-006 | §1 vector-drift check zero |
| SC-007 | §1 persisted-pick suite + §4.4 relaunches |
