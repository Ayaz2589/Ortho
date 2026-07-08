# Developer Tooling & Day-to-Day Workflow (Makefile, root config, .claude, specs/)

This doc covers the **root-level developer tooling** of the Ortho monorepo: the `Makefile` (bank-statement import + transaction CRUD CLI targets), the root `.gitignore` strategy, the `.claude/` skills and context-summary system, the `specs/` + `.specify/` Spec-Kit (Spec-Driven Development) process, and the root-level Node artifacts. It is the "how to work in this repo day-to-day" guide. For the app subsystems themselves see `./web.md`, `./ios.md`, `./supabase.md`, `./shared.md`.

## 1. Purpose

Ortho is one product on three surfaces (iOS canonical, web mirror, terminal CLI) over one Supabase backend. The root of the repo holds the glue that keeps day-to-day work orderly:

- **`Makefile`** — the operator's entry point to the deterministic (no-LLM) bank-statement import CLI and terminal transaction CRUD, both of which live in `web/scripts/import/` but are invoked from the repo root.
- **`.gitignore`** — root-level ignore policy; each app subdirectory keeps its own `.gitignore`.
- **`.claude/`** — project-local Claude Code skills (design guide, session-continuity, Spec Kit commands) and per-session context summaries.
- **`specs/` + `.specify/`** — GitHub Spec Kit artifacts: every feature moves through `specify → plan → tasks → implement`, recorded as a numbered directory under `specs/`, governed by the project constitution at `.specify/memory/constitution.md`.
- **`CLAUDE.md`, `README.md`, `PARITY.md`** — agent/contributor working notes, project overview, and the cross-surface parity audit ledger.

## 2. Stack & key dependencies

- **Node 22** — pinned by the root `.nvmrc` (contents: `22`). All Make targets shell into `web/` and run `npx tsx`, so they use `web/node_modules` (there is **no root `package.json`**).
- **`tsx`** — TypeScript runner used by every Make target (`npx tsx web/scripts/import/cli.ts` / `tx.ts`), resolved from `web/`'s dependencies.
- **GNU Make** — plain `make`, no exotic features beyond `$(if ...)` conditionals.
- **Spec Kit `0.10.3.dev0`** — recorded in `.specify/init-options.json` (`"integration": "claude"`, sequential feature numbering, bash scripts). The bundled `speckit` workflow requires `speckit_version >= 0.8.5` (`.specify/workflows/speckit/workflow.yml`).
- **Supabase JS client + email-OTP auth** — the CLI signs in the same way the apps do (8-digit emailed OTP), or uses `SUPABASE_SERVICE_ROLE_KEY` with `ADMIN=1`.

## 3. Directory map (root-level tooling only)

```
Ortho/
├── Makefile                  # ingest / ingest-help / tx-list / tx-add / tx-edit / tx-rm / repair-dates
├── .nvmrc                    # "22" — Node version for all JS tooling
├── .gitignore                # root + cross-cutting ignores (subdirs have their own)
├── CLAUDE.md                 # agent working notes: points to the CURRENT plan + session continuity
├── README.md                 # project overview, getting-started, workflow summary
├── PARITY.md                 # cross-surface parity matrix (web / iOS / CLI), audit ledger
├── .claude/
│   ├── skills/               # TRACKED in git — project skills (one SKILL.md each)
│   │   ├── ortho-web/        # web design-system guide (tokens, layout, drawer patterns)
│   │   ├── remember/         # writes a session summary to context-summaries/, prompts to clear
│   │   └── speckit-*/        # 10 Spec Kit command skills (specify, plan, tasks, implement, …)
│   ├── context-summaries/    # GITIGNORED — per-session handoffs; latest.md = most recent
│   └── settings.local.json   # GITIGNORED — machine-local Claude settings
├── .specify/                 # TRACKED — Spec Kit config & machinery
│   ├── memory/constitution.md    # THE project constitution (design + testing principles)
│   ├── feature.json              # points at the current feature dir (specs/020-…)
│   ├── templates/                # spec / plan / tasks / checklist / constitution templates
│   ├── scripts/bash/             # create-new-feature.sh, setup-plan.sh, setup-tasks.sh,
│   │                             # check-prerequisites.sh, common.sh
│   ├── workflows/speckit/        # bundled "Full SDD Cycle" workflow (specify→plan→tasks→implement)
│   ├── extensions/agent-context/ # refreshes agent context after specify/plan (hooks in extensions.yml)
│   └── integrations/             # claude.manifest.json, speckit.manifest.json
├── specs/                    # one numbered dir per feature, 001 … 020 (non-sequential; 016–018 skipped)
│   └── NNN-short-name/       # spec.md, plan.md, research.md, data-model.md,
│                             # quickstart.md, tasks.md, contracts/, checklists/
├── node_modules/.vite/       # stray Vitest cache from a root-level run — ignorable, gitignored
├── temp/                     # gitignored local scratch / screenshots
└── .history-backup/          # gitignored bare repos: pre-monorepo git histories
    ├── ortho-ios.git         #   recover with: git --git-dir=.history-backup/ortho-ios.git log
    └── ortho-web.git
```

## 4. The Makefile — every target

Defined at `Makefile` (repo root). Variables at the top: `WEB := web`, `CLI := scripts/import/cli.ts`, `TX := scripts/import/tx.ts`. All targets `cd web` and run `npx tsx`, so **`web/npm install` must have been run first** and env comes from `web/.env.local`. All targets are `.PHONY`.

### `make ingest FILE=<path.pdf|csv> [BANK=td] [DRY_RUN=1] [YES=1] [ADMIN=1]`
Imports a bank-statement PDF/CSV into the shared Supabase database via `web/scripts/import/cli.ts` (design: `specs/004-bank-statement-import/`). `FILE` is **required** (the target errors with a usage line otherwise) and is resolved to an absolute path before the `cd web` so relative paths survive. Flags map 1:1 to CLI flags:
- `BANK` — force a bank profile id (`td` | `apple` | `amex` | `chase`); default auto-detects from the file.
- `DRY_RUN=1` — parse + preview + reconcile, **no DB writes**. Always run this first.
- `YES=1` — accept suggested categories/owners (skips per-row review); still confirms before writing.
- `ADMIN=1` — authenticate with `SUPABASE_SERVICE_ROLE_KEY` instead of the email-OTP sign-in.

Pipeline (per `web/scripts/import/README.md`): `extract → detect bank → parse (profile) → categorize → flag exclusions → reconcile → review → dedupe → confirm → persist`. PDF sections are reconciled against the statement's **printed subtotals — a mismatch blocks the import (exit code 4)**. Chase CSV has no control total, so reconciliation reports `n/a`. Re-running the same statement imports nothing (duplicate detection). Written rows are identical to app-entered transactions.

### `make ingest-help`
Prints the usage/env cheat-sheet for `ingest` (no side effects). Use it to recall the flag/env contract without opening the README.

### `make tx-list [MONTH=YYYY-MM] [QUERY=text] [CATEGORY=a,b] [SOURCE=a,b] [OWNER=name] [KIND=expense|income|transfer] [LIMIT=N] [ADMIN=1]`
Read-only, **household-wide** listing via `web/scripts/import/tx.ts list` (design: `specs/005-transaction-crud-cli/`, semantics aligned with the apps in `specs/013-post-audit-closeout/`). Only the MONTH window narrows in SQL; everything else runs through the apps' shared `filterTransactions` — free-text `QUERY`, comma multi-select `CATEGORY`/`SOURCE`, `OWNER` by household-person name. Hitting `LIMIT` (default 200) prints an explicit truncation notice. Same OTP/ADMIN auth as `ingest`.

### `make tx-add MERCHANT='..' AMOUNT='12.34' [DATE=YYYY-MM-DD] [CATEGORY=..] [KIND=..] [SOURCE='..'] [ADMIN=1]`
Creates one transaction (`tx.ts add`). The Makefile passes only the variables you set; the CLI prompts/validates the rest.

### `make tx-edit ID=<uuid> [ADMIN=1]`
Interactively edits one transaction (`tx.ts edit`). `ID` is **required** (usage error otherwise).

### `make tx-rm ID=<uuid> [DRY_RUN=1] [ADMIN=1]`
Deletes one transaction (`tx.ts rm`). `ID` is **required**; `DRY_RUN=1` previews without deleting.

### `make repair-dates [APPLY=1] [ADMIN=1]`
One-time audit/repair of legacy transaction timestamps carrying the pre-2026-07-02 evening
wall-clock signature (00:00–04:00Z) via `web/scripts/maintenance/repair-legacy-dates.ts`
(design: `specs/013-post-audit-closeout/contracts/repair-legacy-dates.md`). **Dry run by
default** — reports each affected row's inferred America/New_York day and proposed
noon-UTC value, writes nothing. `APPLY=1` prints the same report, then requires typing
`repair` at a prompt; each write is guarded by the row's original date (race-safe,
idempotent — a re-run reports 0 repairable). Ambiguous rows are always excluded and
listed for the operator.

### Environment required by all targets (in `web/.env.local`)
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — always required.
- `IMPORT_EMAIL` — sign-in mode (default): the tool emails an **8-digit OTP** you type at the prompt; no password is ever stored. If unset, you're prompted for the email too.
- `SUPABASE_SERVICE_ROLE_KEY` — only for `ADMIN=1` (cross-account attribution; bypasses RLS).

These targets are Node-only — they run fine on **Linux** (no Xcode needed). They do, however, hit the real shared Supabase backend, so `DRY_RUN=1` is the safe default in any sandbox.

## 5. Root `.gitignore` strategy

The root `.gitignore` states its policy in its own header: **app subdirectories keep their own `.gitignore` files** (`web/.gitignore`, `iOS/.gitignore`, `supabase/.gitignore`); the root file covers only root-level and cross-cutting concerns:

- `.DS_Store` / `**/.DS_Store` — macOS cruft.
- `temp/` — local scratch / screenshots.
- `.history-backup/` — **pre-monorepo git histories** of the once-separate iOS and web repos, kept as local bare repos (`ortho-ios.git`, `ortho-web.git`). Recover with `git --git-dir=.history-backup/ortho-web.git log`. Never tracked.
- `.claude/settings.local.json` — machine-local agent prefs (while `.claude/skills/` and `.specify/` **are** tracked).
- `.claude/context-summaries/` — per-session handoffs written by the `remember` skill; local artifacts, force-addable with `git add -f` if one is ever worth keeping.
- Safety nets duplicated from the subdirs: `**/node_modules/`, `web/.next/`, `web/tsconfig.tsbuildinfo`.
- `Ortho-web/` — a stray directory that a dev server still running from the pre-rename path can recreate; if it appears, stop that server and restart from `web/`.

## 6. `.claude/` — skills and session continuity

### Skills (tracked, one `SKILL.md` per directory under `.claude/skills/`)
- **`ortho-web`** — the web design & UX guide. Encodes the design system (tokens in `colors_and_type.css` / `web/app/globals.css`, one sage + one sand accent, hairlines over borders, "room to breathe not room to cram") and desktop patterns (sidebar nav, master–detail, right-side drawer). Read it before any web UI work.
- **`remember`** — session-continuity: summarizes the current session into `.claude/context-summaries/{YYYY-MM-DD-HHmm}.md` (UTC timestamp) plus `latest.md`, then prompts to clear context. Invoke when context is filling (>75%).
- **`speckit-*` (10 skills)** — the Spec Kit commands: `speckit-specify`, `speckit-clarify`, `speckit-plan`, `speckit-tasks`, `speckit-implement`, `speckit-analyze`, `speckit-checklist`, `speckit-constitution`, `speckit-taskstoissues`, `speckit-agent-context-update`. These drive the SDD cycle (section 7).

### Context summaries (gitignored)
`​.claude/context-summaries/latest.md` is the most recent session handoff; dated files alongside it are older ones. The root `CLAUDE.md` instructs: **at session start, read `latest.md` if it exists** to recover prior state (work done, decisions, pending items). Summaries record commits made, key decisions (e.g. "demo data removed from iOS — do NOT reintroduce"), and gotchas — treat them as authoritative recent history.

### Root `CLAUDE.md`
It points at (1) the **current plan** — `specs/020-drift-reconciliation/plan.md` for technologies, structure, and shell commands; (2) the deep-dive docs (`docs/index.md` and the per-subsystem guides); (3) the iOS CI workflow that provides compile/test feedback; and (4) the session-continuity rule above. When the active feature changes, this pointer changes with it (and `.specify/feature.json` tracks the same thing: `{"feature_directory": "specs/020-drift-reconciliation"}`).

## 7. `specs/` + `.specify/` — the Spec Kit process (overview)

Features move through **Spec-Driven Development**: `specify → plan → tasks → implement`, each step a skill, each artifact committed. Seventeen features exist so far (`specs/001-desktop-layout` … `specs/020-drift-reconciliation`); numbering is **non-sequential** — 016–018 were skipped, so the latest is `020` (see `.specify/feature.json`).

A mature feature directory contains:

```
specs/NNN-short-name/
├── spec.md          # requirements + user stories (from speckit-specify)
├── plan.md          # implementation plan incl. a Constitution Check gate (speckit-plan)
├── research.md      # resolved unknowns / decisions (R1, R2, …)
├── data-model.md    # entities, migrations, invariants
├── quickstart.md    # how to exercise the feature
├── contracts/       # data shapes, function signatures, vector schemas, UI contracts
├── checklists/      # e.g. requirements.md (speckit-checklist)
└── tasks.md         # dependency-ordered task list `[ID] [P?] [Story?]` (speckit-tasks),
                     # checked off by speckit-implement
```

Key mechanics:
- **Constitution gate.** Every `plan.md` contains an explicit "Constitution Check" against `.specify/memory/constitution.md` (six principles: tokens-only design system; calm-over-dense; right form factor per canvas; plainspoken voice/money formatting; accessibility; **test-driven & regression-safe** — money/date logic never ships without golden-vector coverage). The gate must PASS before research/design proceeds.
- **Branch-per-feature.** `.specify/scripts/bash/create-new-feature.sh` creates the numbered branch + directory; `check-prerequisites.sh`, `setup-plan.sh`, `setup-tasks.sh` support the later steps. `plan.md` records the branch name (e.g. `012-household-reimbursement`).
- **Hooks.** `.specify/extensions.yml` installs the `agent-context` extension with `after_specify` and `after_plan` hooks that run `speckit.agent-context.update` (refreshes the managed section of the agent context file).
- **Workflow bundle.** `.specify/workflows/speckit/workflow.yml` defines the "Full SDD Cycle" that chains the four core commands with review gates; `.specify/workflows/workflow-registry.json` registers it.
- **Templates.** New artifacts are stamped from `.specify/templates/{spec,plan,tasks,checklist,constitution}-template.md`.
- **Tasks discipline.** `tasks.md` phases: Setup → Foundational (blocking) → per-user-story phases; `[P]` marks parallelizable tasks (different files). Tests precede implementation (Constitution VI). Task T001 of a feature typically re-verifies the baseline (`cd web && npm test` green, iOS `xcodebuild test` green).

Verification convention (from `README.md`): favor **typecheck + tests + visual review**; never run a production build or a second dev server while a shared dev server is up.

## 8. Root Node artifacts

- **There is no root `package.json` and no root npm workspace.** All JS dependencies live in `web/package.json`; the Makefile reaches them by `cd web && npx tsx …`.
- **`node_modules/.vite/vitest/`** at the root is a stray Vitest cache from a run launched at the repo root; it is harmless, contains no packages, and is covered by the `**/node_modules/` ignore. Run tests from `web/`, not the root.
- **`.nvmrc` = `22`** — run `nvm use` at the root (or in `web/`) before any Make target or web test run; spec plans explicitly require Node ≥ 22 for `vitest` / `gen:vectors`.

## 9. Key files to read first

1. `Makefile` — all seven targets and their flag→CLI mapping.
2. `README.md` — project overview, monorepo layout, getting-started per subsystem, workflow summary.
3. `CLAUDE.md` — pointer to the current plan + the session-continuity rule.
4. `PARITY.md` — the parity matrix across web/iOS/CLI and the audit ledger; states which shared modules/vectors pin each capability.
5. `.specify/memory/constitution.md` — the six governing principles (design + testing); every plan gates on it.
6. `.gitignore` — the root ignore policy and its rationale comments.
7. `.claude/skills/ortho-web/SKILL.md` — the web design system guide.
8. `.claude/skills/remember/SKILL.md` — how session summaries are produced.
9. `.claude/context-summaries/latest.md` — the most recent session handoff (local only).
10. `web/scripts/import/README.md` — full CLI documentation (supported banks, pipeline, exit codes, env).
11. `specs/020-drift-reconciliation/plan.md` — the current feature's plan (exemplar of the plan format + Constitution Check).
12. `specs/020-drift-reconciliation/tasks.md` — exemplar of the task format and phase ordering.
13. `.specify/feature.json` — which feature directory is current.
14. `.specify/extensions.yml` — the after-specify/after-plan agent-context hooks.
15. `.nvmrc` — the Node pin.

## 10. How to run things

```bash
# One-time setup (Linux OK; Node 22)
nvm use                       # honors root .nvmrc (22)
cd web && npm install         # the Makefile depends on web/node_modules
# create web/.env.local with NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
#   IMPORT_EMAIL (OTP sign-in) and optionally SUPABASE_SERVICE_ROLE_KEY (ADMIN=1)

# Import a statement (ALWAYS preview first)
make ingest FILE=~/statements/td-may.pdf DRY_RUN=1
make ingest FILE=~/statements/td-may.pdf            # real write, interactive review
make ingest-help                                    # cheat-sheet

# Transaction CRUD from the terminal
make tx-list MONTH=2026-06 CATEGORY=dining,coffee
make tx-add MERCHANT='Coffee' AMOUNT='4.50' CATEGORY=dining
make tx-edit ID=<uuid>
make tx-rm ID=<uuid> DRY_RUN=1
```

Everything above is Linux-compatible. The **iOS side of the repo is macOS/Xcode-only** (`xcodebuild test -scheme Ortho-iOS`), so in a Linux sandbox restrict verification to `cd web && npm test`, `npx tsc --noEmit`, and the CLI in `DRY_RUN=1` mode.

## 11. Conventions & patterns

- **Root Makefile, web implementation.** CLI code lives in `web/scripts/import/` so it can reuse the shared TypeScript finance modules (`web/lib/splits.ts`, `web/lib/finance/money.ts`); the Makefile is a thin, flag-forwarding wrapper.
- **Required-variable guard pattern.** Targets that need a value (`FILE`, `ID`) start with `@test -n "$(VAR)" || { echo 'Usage: …'; exit 1; }`.
- **`$(if $(VAR),--flag '$(VAR)')`** — optional flags are only passed when the Make variable is set; boolean flags use `$(if $(filter 1,$(VAR)),--flag)`.
- **Deterministic, no-LLM tooling.** The importer is rule-based and reconciles against printed subtotals; determinism is a feature-level requirement, not incidental.
- **OTP over passwords.** All CLI auth is 8-digit email OTP (matching both apps) or explicit service-role admin mode; no credentials in files.
- **Docs live next to code.** Each spec dir is self-contained; the CLI has its own README under `web/scripts/import/`; skills are self-describing `SKILL.md` files.
- **Commit style** (from history): conventional-commit-ish `type(scope): summary`, e.g. `fix(ios): …`, `docs(parity): …`, `chore(web): …`.

## 12. Gotchas

- **No root `package.json`** — `npm install` at the root does nothing useful; install in `web/`. The Make targets fail with module-resolution errors if `web/node_modules` is missing.
- **`FILE` path resolution** — `make ingest` converts `FILE` to an absolute path *before* `cd web`; if you bypass Make and run `npx tsx scripts/import/cli.ts` directly from `web/`, relative paths resolve from `web/`, not the repo root.
- **These commands write to the real shared database** (production Supabase used by both apps). Use `DRY_RUN=1` first, always. Reconciliation mismatch exits with code 4 and writes nothing; duplicate re-imports are no-ops.
- **`ADMIN=1` bypasses RLS** via the service-role key — only for cross-account attribution; keep the key out of git (it lives only in `web/.env.local`).
- **Node/sandbox quirk** — spec plans note that `vitest` and `gen:vectors` (tsx/vitest IPC) need the Bash sandbox disabled and Node ≥ 22 when run by an agent.
- **Never run a second dev server / production build while a shared dev server is up** (README workflow rule). Also, a dev server left running from the pre-rename path recreates a stray `Ortho-web/` dir — stop it and restart from `web/`.
- **`.claude/context-summaries/` is gitignored** — a fresh clone/sandbox will NOT have `latest.md`; don't be surprised when the CLAUDE.md session-continuity step finds nothing.
- **`CLAUDE.md` and `.specify/feature.json` point at the *current* feature** — check both before assuming which spec is active; they must be updated when a new feature starts.
- **`.history-backup/`** contains full bare git repos of the pre-monorepo projects — do not delete it casually (it is the only local copy of that history), and never commit it.
- **CLI parity caveats** (from `PARITY.md`): the CLI is *not* part of the golden-vector harness; it has known partial-parity marks (non-atomic parent+shares write, date/timezone handling, filtering) — don't assume it behaves identically to the apps in edge cases.

## 13. Cross-links

- **`./web.md`** — the CLI implementation (`web/scripts/import/cli.ts`, `tx.ts`, `db/`, `engine/`, `profiles/`) and the shared finance modules it reuses (`web/lib/splits.ts`, `web/lib/finance/money.ts`); `web/.env.local` env contract; `web/scripts/gen-vectors.ts` (golden-vector generator).
- **`./ios.md`** — the canonical app; spec tasks routinely have parallel web/iOS tracks; iOS verification (`xcodebuild test`) is macOS-only.
- **`./supabase.md`** — the tables the CLI writes (`transactions`, `transaction_shares`), the enum types spec migrations extend, and RLS that the OTP-auth path is subject to (and `ADMIN=1` bypasses).
- **`./shared.md`** — `shared/test-vectors/*.json`, the golden vectors that Constitution VI requires for any money/date logic a spec introduces.
