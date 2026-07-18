#!/usr/bin/env bash
# Bootstrap a fresh Docker Sandbox to build/run/test Ortho. Run INSIDE the sandbox,
# from anywhere in the repo. Idempotent. It does the gitignored setup a clone/branch
# sandbox is missing:
#   - (optional) create + switch to a feature branch
#   - install web deps (npm ci)
#   - start an ISOLATED local Supabase stack (Docker) for THIS sandbox only
#   - write the gitignored web/.env.local FROM that stack (the file a clone lacks)
# Nothing here touches your shared/hosted Supabase project.
#
# Usage (inside the sandbox):
#   ./.claude/skills/docker-sandbox/bootstrap-sandbox.sh [--force] [branch-name]
#     branch-name  optional; e.g. feat/ledger-atomic-persistence
#     --force      proceed even if this looks like the HOST (guards against
#                  clobbering your real web/.env.local by mistake)
set -euo pipefail

force=0
if [ "${1:-}" = "--force" ]; then force=1; shift; fi
branch="${1:-}"

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$repo_root"

# Host guard: this starts Supabase and rewrites web/.env.local — meant for a sandbox.
if [ "$force" -ne 1 ] && [ -z "${SANDBOX_VM_ID:-}" ] && command -v sbx >/dev/null 2>&1; then
  echo "This looks like the HOST (sbx present, SANDBOX_VM_ID unset)." >&2
  echo "bootstrap-sandbox.sh is meant to run INSIDE a sandbox — it starts a local" >&2
  echo "Supabase stack and overwrites web/.env.local. Re-run with --force to override." >&2
  exit 1
fi

for bin in node npm supabase; do
  command -v "$bin" >/dev/null 2>&1 || { echo "error: '$bin' not found in this sandbox." >&2; exit 1; }
done

if [ -n "$branch" ]; then
  git checkout -b "$branch" 2>/dev/null || git checkout "$branch"
  echo "==> on branch $(git branch --show-current)"
fi

echo "==> installing web deps (npm ci)"
( cd web && npm ci )

echo "==> starting local Supabase (Docker; no-op if already running)"
if ! supabase start >/dev/null 2>&1; then
  supabase status >/dev/null 2>&1 || { echo "error: 'supabase start' failed — is Docker running in this sandbox?" >&2; exit 1; }
fi

echo "==> writing web/.env.local from the local stack"
[ -f web/.env.local ] && cp web/.env.local "web/.env.local.bak.$$" && echo "   (backed up existing web/.env.local)"
tmp="$(mktemp)"
supabase status -o env \
  --override-name api.url=NEXT_PUBLIC_SUPABASE_URL \
  --override-name auth.anon_key=NEXT_PUBLIC_SUPABASE_ANON_KEY \
  --override-name auth.service_role_key=SUPABASE_SERVICE_ROLE_KEY 2>/dev/null \
  | grep -E '^(NEXT_PUBLIC_SUPABASE_URL|NEXT_PUBLIC_SUPABASE_ANON_KEY|SUPABASE_SERVICE_ROLE_KEY)=' \
  > "$tmp" || true

if [ "$(grep -c . "$tmp")" -lt 3 ]; then
  echo "error: couldn't read all three local Supabase vars from 'supabase status -o env'." >&2
  echo "       Is the local stack fully up? Raw status:" >&2
  supabase status >&2 || true
  rm -f "$tmp"; exit 1
fi
mv "$tmp" web/.env.local

echo "   wrote web/.env.local (values hidden):"
sed -E 's/=(.*)$/=<hidden>/' web/.env.local | sed 's/^/     /'
url="$(grep '^NEXT_PUBLIC_SUPABASE_URL=' web/.env.local | cut -d= -f2- | tr -d '"')"
case "$url" in
  http://127.0.0.1:*|http://localhost:*|http://\[::1\]:*) echo "   ✓ target is local: $url" ;;
  *) echo "   ⚠️  target is NOT local ($url) — check your local stack." >&2 ;;
esac

echo
echo "✓ Sandbox bootstrapped. web/.env.local points at this sandbox's own local Supabase."
echo "  Next: cd web && npm test        # run the suite"
echo "        npm run dev               # run the app against the local DB"
echo "        (§9.3) add your migration, then: supabase db reset   # replay migrations"
