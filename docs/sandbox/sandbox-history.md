# Sandbox history — Ortho

> Registry of `sbx` Docker Sandboxes for this project. Maintained host-side by the
> [docker-sandbox](../../.claude/skills/docker-sandbox/SKILL.md) +
> [kill-sandbox](../../.claude/skills/kill-sandbox/SKILL.md) skills; reconciled
> against `sbx ls` on every run. Host-local (sandboxes are per-machine), so this
> reflects the fleet on the machine that last reconciled it. Do not hand-edit the
> tables or edit this file from inside a sandbox. Last reconciled: 2026-08-11.

## Active (not killed)

| Sandbox | Branch | Feature | Mode | Created | Last seen |
|---|---|---|---|---|---|
| _(none — no Ortho sandboxes live)_ | | | | | |

## Killed (history)

| Sandbox | Branch | Feature | Created | Killed | Unpushed at kill? | Notes |
|---|---|---|---|---|---|---|
| ledger-atomic | _(main)_ | §9.3 ledger atomic persistence | 2026-07-18 | 2026-07-18 | no | inspected clean (on main, 0 unpushed); recreated fresh once, then removed |
| finance-correctness | feat/finance-model-correctness | §9.4 finance-model correctness | 2026-07-18 | 2026-07-18 | _(unknown)_ | removed outside skill (before this registry existed) |
| multi-currency | feat/multi-currency-strategy | §9.5 multi-currency decision | 2026-07-18 | 2026-07-18 | _(unknown)_ | removed outside skill (before this registry existed) |
| capacitor-uploads | fix/web-scan-fallback | web scan fallback fix (receipt/statement scan on web) | 2026-07-18 | 2026-07-18 | _(unknown)_ | removed outside skill (before this registry existed) |
| goals | feat/savings-goals | §3.1 savings / debt-payoff goals | 2026-07-18 | 2026-07-19 | no | clean (up to date with origin/feat/savings-goals); killed via `/kill-sandbox all` |
| tags-notes | feat/transaction-tags | §4.4 transaction tags & notes | 2026-07-18 | 2026-07-19 | no | clean (up to date with origin/feat/transaction-tags); killed via `/kill-sandbox all` |
| budget-rollover | feat/budget-rollover | §4.1 flexible budgeting (rollover slice) | 2026-07-18 | 2026-07-19 | no | clean (up to date with origin/feat/budget-rollover); killed via `/kill-sandbox all` |
| reports-mvp | feat/reports-mvp | §5.1 advanced reports (minimal) | 2026-07-18 | 2026-07-19 | no | clean (up to date with origin/feat/reports-mvp); killed via `/kill-sandbox all` |
| feat-026-review | 026-seed-data-harness | pre-existing — spec-026 seed-harness review | _(unknown)_ | 2026-07-19 | no | clean (merged; up to date with origin/026-seed-data-harness); killed via `/kill-sandbox all` |
| claude-Ortho | main | pre-existing dev sandbox — direct-mode (host-mounted) | _(unknown)_ | 2026-08-11 | _(unknown)_ | vanished from `sbx ls` — removed outside skill; fleet fully turned over |
| mobile-scroll-nav-fix | feat/income-deposit-accounts | spec 033 — income deposit accounts (committed row was mismatched — name/branch didn't align) | 2026-07-30 | 2026-08-11 | _(unknown)_ | vanished from `sbx ls` — removed outside skill |
