# Sandbox history — Ortho

> Registry of `sbx` Docker Sandboxes for this project. Maintained host-side by the
> [docker-sandbox](../../.claude/skills/docker-sandbox/SKILL.md) +
> [kill-sandbox](../../.claude/skills/kill-sandbox/SKILL.md) skills; reconciled
> against `sbx ls` on every run. Host-local (sandboxes are per-machine), so this
> reflects the fleet on the machine that last reconciled it. Do not hand-edit the
> tables or edit this file from inside a sandbox. Last reconciled: 2026-08-23.

## Active (not killed)

| Sandbox | Branch | Feature | Mode | Created | Last seen |
|---|---|---|---|---|---|
| panels-base | feat/057-widget-detail-panels | spec 057 — widget detail panels (base — **PR #119 MERGED**; kept as scratch/merge-executor until US7 lands) | clone | 2026-08-22 | 2026-08-23 running |
| panel-balances | feat/057-panel-household-balances | spec 057 — US7 Who-owes-whom detail panel (follow-up; branched off base; **in flight** — the trap panel) | clone (-m 4g) | 2026-08-22 | 2026-08-23 running |

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
| household | feat/057-widget-detail-panels | spec 057 — widget detail panels (**planning** sandbox; produced the plan/spec on PR #119) | 2026-08-22 (inferred) | 2026-08-22 | no | clean (up to date with origin/feat/057-widget-detail-panels, 0 unpushed); planning done + pushed as PR #119; removed via `/kill-sandbox` |
| panel-pace | feat/057-panel-spending-pace | spec 057 — US4 Spending-pace detail panel (follow-up) | 2026-08-22 | 2026-08-22 | no | complete; pushed to origin/feat/057-panel-spending-pace (baee16c, 1 commit: panel+test+registry+i18n); PR later MERGED to main; removed after confirming on GitHub |
| panel-savings | feat/057-panel-savings-trends | spec 057 — US5 Savings-trends detail panel (follow-up) | 2026-08-22 | 2026-08-22 | no | complete; pushed to origin/feat/057-panel-savings-trends (a986539); PR later MERGED to main; removed after confirming on GitHub |
| panel-merchants | feat/057-panel-top-merchants | spec 057 — US6 Top-merchants detail panel (follow-up) | 2026-08-22 | 2026-08-22 | no | complete; pushed to origin/feat/057-panel-top-merchants (061c2a9); PR later MERGED to main; removed after confirming on GitHub |
| panel-housing | feat/057-panel-housing-costs | spec 057 — US8 Housing-costs detail panel (follow-up) | 2026-08-22 | 2026-08-23 | no | complete; **PR #123 MERGED** to main (7020811, clean rebase); removed via `/kill-sandbox` after confirming merged |
| panel-goals | feat/057-panel-goals | spec 057 — US9 Goals detail panel (follow-up) | 2026-08-22 | 2026-08-23 | no | complete; **PR #124 MERGED** to main (rebased + union-resolved i18n → 57ab210); removed via `/kill-sandbox` after confirming merged |
