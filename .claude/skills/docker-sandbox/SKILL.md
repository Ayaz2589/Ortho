---
name: docker-sandbox
description: Start and manage Docker Sandboxes (the `sbx` CLI) for the Ortho repo — one isolated microVM per feature for parallel or overnight agent work. Covers sbx run/create/ls/stop/rm, running multiple named sandboxes for the SAME repo, clone vs branch vs direct mode, daemon/container isolation (nothing is shared between sandboxes), reaching shared services via host.docker.internal + network policy, Supabase in multi-sandbox setups, and git push/PR from a sandbox. Use when the user wants to spin up sandboxes, run agents in parallel, or set up an overnight multi-feature workflow.
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

(The one-time install is host-side too: `brew install docker/tap/sbx` on macOS,
`winget install -h Docker.sbx` on Windows, the apt path on Ubuntu 24.04+, then
`sbx login`. Pick the **Balanced** network policy at login.)

## When invoked

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
