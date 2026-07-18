#!/usr/bin/env bash
# Set the GitHub push credential for Docker Sandboxes — HOST-ONLY (uses `sbx`).
#
# Fixes the recurring "I can't push from a new sandbox" blocker. Run on your HOST,
# from the repo root. Token is read (in order) from: $GITHUB_TOKEN → ./.secrets
# (gitignored) → `gh auth token`. The token is passed to `sbx secret set`, which
# injects it at the proxy — it never lands on the sandbox filesystem, and this
# script never prints it.
#
# Usage:
#   ./.claude/skills/docker-sandbox/set-github-secret.sh -g              # global: ALL future sandboxes (recommended)
#   ./.claude/skills/docker-sandbox/set-github-secret.sh <sandbox-name>  # one existing sandbox (takes effect immediately)
set -euo pipefail

target="${1:-}"
if [ -z "$target" ]; then
  echo "usage: $0 <sandbox-name> | -g" >&2
  exit 2
fi

if ! command -v sbx >/dev/null 2>&1; then
  echo "error: sbx not found. Run this on your HOST, not inside a sandbox." >&2
  exit 1
fi

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

token="${GITHUB_TOKEN:-}"
if [ -z "$token" ] && [ -f "$repo_root/.secrets" ]; then
  # shellcheck disable=SC1091
  set -a; . "$repo_root/.secrets"; set +a
  token="${GITHUB_TOKEN:-${GH_TOKEN:-}}"
fi
if [ -z "$token" ] && command -v gh >/dev/null 2>&1; then
  token="$(gh auth token 2>/dev/null || true)"
fi
if [ -z "$token" ]; then
  echo "error: no GitHub token. Set GITHUB_TOKEN, add it to .secrets, or run 'gh auth login'." >&2
  exit 1
fi

case "$target" in
  -g|--global)
    sbx secret set -g github -t "$token"
    echo "✓ Global GitHub secret set — every FUTURE sandbox inherits push access."
    ;;
  *)
    sbx secret set "$target" github -t "$token"
    echo "✓ GitHub secret set for sandbox '$target' — push works now (no restart needed)."
    ;;
esac
