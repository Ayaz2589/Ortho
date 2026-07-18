---
name: docker-sandbox
description: Start and manage Docker Sandboxes (the `sbx` CLI) for the Ortho repo — one isolated microVM per feature for parallel or overnight agent work. Covers sbx run/create/ls/stop/rm, running multiple named sandboxes for the SAME repo, clone vs branch vs direct mode, daemon/container isolation (nothing is shared between sandboxes), reaching shared services via host.docker.internal + network policy, Supabase in multi-sandbox setups, git push/PR from a sandbox, and bootstrapping a fresh sandbox so it has everything to get going (GitHub secret, Claude login, the gitignored web/.env.local, network policy). Use when the user wants to spin up sandboxes, run agents in parallel, set up an overnight multi-feature workflow, or asks whether a new sandbox has the credentials/keys it needs.
user-invocable: true
argument-hint: "[optional: feature name(s) to spin up sandboxes for, e.g. 'auth checkout analytics']"
---

# docker-sandbox skill

Spin up and manage **Docker Sandboxes** — isolated microVMs (own filesystem,
Docker daemon, and network) that run a coding agent against the Ortho repo. The
main use is **parallel / overnight feature work**: one named sandbox per feature,
each on its own branch, with no chance of two agents clobbering each other's edits.

Reference: Docker Sandboxes docs — https://docs.docker.com/ai/sandboxes/ and the
`sbx` CLI reference — https://docs.docker.com/reference/cli/sbx/. When a flag isn't
covered here, `sbx <cmd> --help` on the host is the source of truth.

## ⚠️ Read this first: `sbx` runs on the HOST, not inside a sandbox

A Claude Code session (like this one) usually runs **inside** a sandbox, where the
`sbx` binary is not available. **You cannot create sandboxes from inside one.** So
this skill's job is to hand the user the exact commands to run in their **host
terminal** (macOS/Windows/Linux), plus the workflow and the gotchas. Present the
commands in a copyable block and tell the user to run them on the host. Do not try
to execute `sbx ...` from a Bash tool call inside the sandbox — it will fail.

### Environment guard — do this FIRST, every invocation

Before emitting anything, detect whether you are inside a sandbox:

```bash
command -v sbx >/dev/null 2>&1 && echo "sbx: present" || echo "sbx: ABSENT"
echo "SANDBOX_VM_ID=${SANDBOX_VM_ID:-<unset>}"
```

- **Inside a sandbox** — `sbx` is **ABSENT**, or `SANDBOX_VM_ID` is set (e.g.
  `claude-Ortho`). You are a passenger: **do NOT run any `sbx …` command.** Prepend
  this banner, verbatim (substituting the real id), to every command block you emit:

  > 🖥️ **Run these on your HOST terminal — not here.** This Claude Code session is
  > inside sandbox `<SANDBOX_VM_ID>`, where `sbx` isn't installed, so it cannot
  > create sandboxes (and would only spawn *sibling* VMs on the host, never a nested
  > one). Copy the commands below into your host shell.

- **On the host** — `sbx` is **present** and `SANDBOX_VM_ID` is unset. You *may* run
  the commands directly, but creating/removing sandboxes is consequential: show the
  block and get an explicit go-ahead first, and **never auto-run `sbx rm`**.

(The one-time install is host-side too: `brew install docker/tap/sbx` on macOS,
`winget install -h Docker.sbx` on Windows, the apt path on Ubuntu 24.04+, then
`sbx login`. Pick the **Balanced** network policy at login.)

## When invoked

0. **Guard: detect the environment (always first).** Run the check in "Environment
   guard" above. If inside a sandbox (`sbx` absent / `SANDBOX_VM_ID` set), switch to
   "emit for host" mode and **prepend the HOST-ONLY banner** to any command block —
   do not execute `sbx`. If on the host, you may offer to run the commands after an
   explicit go-ahead.
1. If the user named one or more features (via arguments or the message), emit the
   ready-to-run block that creates **one clone-mode, uniquely-named sandbox per
   feature** for this repo (recipe below), then tell them to run it on the host.
2. If they just want "a sandbox," give the single-sandbox command.
3. If they're asking a conceptual question (can I run several? do they share
   containers? how do I reconnect?), answer from the "Facts" section below.
4. Always surface the two load-bearing caveats: **unique `--name` per sandbox**, and
   **push before you `sbx rm`** (removal deletes a clone-mode sandbox's private clone).

## Can I run multiple sandboxes for the same repo? — Yes

`--name` identifies a sandbox **independent of the working directory**, so several
independently-named sandboxes can target the same workspace. Without `--name`,
re-running `sbx run` in the same path just **re-attaches** to the existing sandbox
instead of making a new one. So the rule is simple: **one unique `--name` per
concurrent sandbox.**

```console
# From the repo root — two sandboxes, same project, different names:
$ sbx run claude --name feature ~/dev/Ortho
$ sbx run claude --name spike   ~/dev/Ortho
```

## Modes: direct vs clone vs branch (pick per how isolated you need to be)

| Mode | Flag | Working tree | Use it when |
|---|---|---|---|
| **direct** | *(default)* | your real host repo dir, mounted **read-write** | a single agent, or read-only/clearly-separate-file work |
| **clone** | `--clone` | an **in-container git clone** of the host repo (wired back via a git-daemon) — fully isolated | **parallel agents** that both edit code; overnight fan-out |
| **branch** | `--branch` | a git **worktree** under `<repo>/.sbx/` sharing the host's `.git` object DB | Ortho's already-documented mode (see repo `CLAUDE.md` "Git Worktrees" + "Pushing to GitHub…") |

- **Avoid multiple `direct`-mode sandboxes on one repo** — they all mount the same
  files, so two agents will overwrite each other. Use `--clone` (or `--branch`) for
  concurrency.
- **Clone mode is fixed at create time.** To switch an existing sandbox to clone
  mode, `sbx rm` it and recreate with `sbx create --clone`.
- **Clone mode is rejected from inside a Git worktree other than the main one** —
  run `sbx create --clone` from the primary checkout, not from a `.sbx/…` worktree.

## Recommended workflow — one named clone-mode sandbox per feature

```console
# On the HOST, from the Ortho repo (or pass the path as the last arg):
$ cd ~/dev/Ortho

# Create one isolated sandbox per feature (backgrounded), unique names:
$ sbx create --clone --name auth-feature      claude .
$ sbx create --clone --name checkout-feature  claude .
$ sbx create --clone --name analytics-feature claude .

# See them all:
$ sbx ls

# Enter one (agent optional once it exists — read from the sandbox spec):
$ sbx run --name auth-feature
```

Or create-and-enter in one step: `sbx run --clone claude --name auth-feature .`

**Inside each sandbox**, tell the agent to branch before editing (clone mode checks
out whatever ref the host had checked out; it does **not** auto-create a branch):

> Create and switch to branch `feat/auth`, then implement the auth feature. Commit
> and push to your branch and open a PR before this sandbox is removed.

One branch per sandbox keeps the PRs clean:
`auth-feature → feat/auth`, `checkout-feature → feat/checkout`, etc.

## Bootstrapping a fresh Ortho sandbox (make it productive)

A fresh `--clone` or `--branch` sandbox has the tracked source but **not** the repo's
gitignored secrets (`web/.env.local`, `CI-SETUP.local.md`, …), and its agent isn't
logged in yet. So "does a new sandbox have everything to get going?" → **not
automatically.** Run this checklist. Steps are tagged **[host]** (your host shell,
via `sbx`) or **[in-sandbox]** (inside the sandbox).

### One-time host setup — so every FUTURE sandbox inherits it
```console
# [host] GitHub push/PR for all future sandboxes (the proxy injects the creds, so
#        `gh auth status` still shows "not logged in" inside — that's expected):
$ sbx secret set -g github -t "$(gh auth token)"
# [host] allow project domains the default "Balanced" policy may block — only if the
#        agent reaches them (e.g. the hosted Supabase host, Plaid):
$ sbx policy allow network -g <your-supabase-project-host>
```
Claude agent auth is **per sandbox**: run `/login` inside each, or store an API key
as a secret so the `claude` agent starts authenticated.

### Per-sandbox bootstrap — the gitignored bits git won't clone
```console
# [in-sandbox] install deps
$ cd web && npm ci

# [in-sandbox] recreate web/.env.local — it's GITIGNORED, so it is NOT in a clone or
#   a fresh worktree. Two ways:
#   A) isolated LOCAL stack (best for parallel DB work, e.g. §9.3 atomic persistence):
$ supabase start          # Docker; prints the local URL + anon/service-role keys
#      then write web/.env.local:
#        NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
#        NEXT_PUBLIC_SUPABASE_ANON_KEY=<local anon key>
#        SUPABASE_SERVICE_ROLE_KEY=<local service-role key>
#   B) point at the shared hosted project (copy values from your host's
#      web/.env.local or CI-SETUP.local.md) — see "Ortho note — Supabase" below for
#      the concurrency tradeoffs (prefer a per-agent schema).

# [in-sandbox] if the bootstrap doc was copied in, read it first — it has the local
#   credentials + CI usage guide for a fresh sandbox:
$ test -f CI-SETUP.local.md && echo "read CI-SETUP.local.md"
```

### Verify it's ready
```console
# [in-sandbox]
$ cd web && npm test                  # suite runs (no network needed)
$ git push -u origin <branch>         # succeeds via the injected GitHub creds
$ npm run seed:corpus -- --dry-run    # spec-026 guard shows the local target
```
If `git push` prompts for a username, the github secret isn't set for this sandbox —
run `sbx secret set <sandbox-name> github -t "$(gh auth token)"` on the host (the
per-sandbox form takes effect immediately; the `-g` global form applies to newly
created sandboxes).

## What is and isn't shared between sandboxes

Each sandbox is **fully isolated**: its own Docker daemon, network, containers,
images, build cache, and named volumes. **Containers started in sandbox A are
invisible to sandbox B**, and sandboxes can't talk over a shared sandbox network.
Running the same `docker compose` in two sandboxes launches **two independent
copies** of every service.

They *can* share: the host source (in direct mode), the same Compose files, and
**external services reachable over the network** (a hosted DB, Supabase, an API).

### Sharing a service across sandboxes
Run the shared service on the **host** Docker daemon and reach it from each sandbox
via `host.docker.internal:<port>` (sandboxes can't use the host's `localhost`).
The **network policy must allow that host:port** — see the repo `CLAUDE.md`
("Accessing services on the host" + `sbx policy allow`).

```console
# host: shared infra
$ docker compose up -d postgres redis
# in each sandbox's app config: host.docker.internal:5432 / :6379
```

## Ortho note — Supabase in a multi-sandbox setup

Ortho's local Supabase stack runs in Docker (`supabase start`), so it is **per
sandbox** — a stack started in one sandbox is invisible to the others. Three
options for parallel agents:

1. **Own local stack per sandbox** — each runs `supabase start` (ports are internal
   to each sandbox, so no collision). Isolated but heaviest; run migrations per DB.
2. **Shared hosted project** — point every sandbox's `web/.env.local` at the hosted
   Supabase URL. Simplest, but concurrent agents share one DB → **watch for
   conflicting migrations / shared data**. Prefer separate schemas or DBs per agent.
3. **Shared Postgres on host Docker** — reach it via `host.docker.internal:54322`
   with a network-policy allow. Shared but outside the sandboxes.

For migration-heavy parallel work, isolate the database per sandbox (option 1 or a
per-sandbox schema). Note the spec-026 seed CLI (`npm run seed:corpus`) **only
writes to a local target** by design, so it's safe to run inside any sandbox
pointed at that sandbox's own local stack.

## Git push / PR from a sandbox

Pushing and opening PRs from a sandbox is the expected end of each feature. The
repo `CLAUDE.md` has the full guide — key points:
- Git auth is injected by the sandbox proxy; `gh auth status` showing "not logged
  in" is normal and does **not** mean push will fail.
- If `git push` fails with a username prompt, the host needs a GitHub token secret:
  `sbx secret set <sandbox-name> github -t "$(gh auth token)"` (or `-g` globally).
- For a `--branch`-mode sandbox whose `origin` points at the local sandbox source,
  add the real GitHub remote before pushing — see `CLAUDE.md` "Pushing to GitHub and
  raising a PR from a `--branch` sandbox".

## Lifecycle & cleanup

```console
$ sbx ls                     # list sandboxes (one entry per sandbox, even with N worktrees)
$ sbx run --name auth-feature   # reconnect from any directory
$ sbx stop auth-feature      # stop but preserve state
$ sbx rm auth-feature        # remove permanently (clone-mode: deletes its private clone!)
$ sbx rm --force auth-feature   # force-remove during an active session
```

**Push or fetch anything you need BEFORE `sbx rm`** — removing a clone-mode sandbox
deletes its private clone and any unpushed commits with it.

## Quick reference (host commands)

```console
# create / run
sbx run claude --name <name> [path]         # create+enter (direct mode)
sbx run --clone claude --name <name> [path]  # create+enter (clone mode)
sbx create --clone --name <name> claude .    # create backgrounded (clone mode)
sbx run --name <name>                        # reconnect (agent optional)
# manage
sbx ls
sbx stop <name>
sbx rm [--force] <name>
# access / policy (host services, ports, secrets — see repo CLAUDE.md)
sbx policy ls
sbx policy allow network -g <domain>
sbx ports <name> --publish 8080:8080/tcp
sbx secret set <name> github -t "$(gh auth token)"
```

## Sources
- [Docker Sandboxes](https://docs.docker.com/ai/sandboxes/) · [Usage](https://docs.docker.com/ai/sandboxes/usage/) · [Get started](https://docs.docker.com/ai/sandboxes/get-started/) · [`sbx` CLI reference](https://docs.docker.com/reference/cli/sbx/)
- Repo `CLAUDE.md` — "Network access", "Publishing ports", "Accessing services on the host", "Git Authentication", "Git Worktrees", and the `--branch` push/PR flow.
