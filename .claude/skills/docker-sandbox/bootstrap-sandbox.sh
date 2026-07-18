#!/usr/bin/env bash
# Bootstrap a fresh Docker Sandbox to build/run/test Ortho. Run INSIDE the sandbox,
# from the WRITABLE workspace clone (NOT /run/sandbox/source — that's a read-only
# mount of the host repo). Idempotent. It does the setup a fresh clone is missing:
#   - installs the Supabase CLI if the sandbox image lacks it (→ ~/.local/bin)
#   - (optional) creates + switches to a feature branch
#   - installs web deps (npm ci)
#   - starts an ISOLATED local Supabase stack (Docker) for THIS sandbox only
#   - writes the gitignored web/.env.local FROM that stack (keys auto-extracted)
# Nothing here touches your shared/hosted Supabase project.
#
# Usage (inside the sandbox, from the writable clone root):
#   ./.claude/skills/docker-sandbox/bootstrap-sandbox.sh [--force] [branch-name]
set -euo pipefail

force=0
if [ "${1:-}" = "--force" ]; then force=1; shift; fi
branch="${1:-}"

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$repo_root"

# Guard 1 — READ-ONLY mount (the /run/sandbox/source trap). In a clone-mode sandbox
# the writable private clone is at the workspace path; /run/sandbox/source is a
# read-only host mount. Writing there fails confusingly, so refuse up front.
writetest=".sbx-writetest.$$"
if ! ( : > "$writetest" ) 2>/dev/null; then
  echo "error: this checkout is READ-ONLY ($repo_root)." >&2
  echo "  You're on the read-only host mount (likely /run/sandbox/source)." >&2
  echo "  Run this from your sandbox's WRITABLE workspace clone — the directory you" >&2
  echo "  land in when you 'sbx run', i.e. the path sbx printed as 'Workspace', NOT" >&2
  echo "  /run/sandbox/source." >&2
  exit 1
fi
rm -f "$writetest"

# Guard 2 — host guard: this rewrites web/.env.local, so don't run it on the host by
# accident (which would clobber your real env file).
if [ "$force" -ne 1 ] && [ -z "${SANDBOX_VM_ID:-}" ] && command -v sbx >/dev/null 2>&1; then
  echo "This looks like the HOST (sbx present, SANDBOX_VM_ID unset)." >&2
  echo "bootstrap-sandbox.sh is meant to run INSIDE a sandbox. Re-run with --force to override." >&2
  exit 1
fi

for bin in node npm curl; do
  command -v "$bin" >/dev/null 2>&1 || { echo "error: '$bin' not found in this sandbox." >&2; exit 1; }
done

# Ensure the Supabase CLI — the sandbox image ships Node + Docker but NOT supabase.
# Install the stable release binary to ~/.local/bin (on PATH, no sudo needed).
export PATH="$HOME/.local/bin:$PATH"
if ! command -v supabase >/dev/null 2>&1; then
  echo "==> Supabase CLI not found — installing to ~/.local/bin"
  arch="$(uname -m)"
  case "$arch" in
    x86_64|amd64) arch=amd64 ;;
    aarch64|arm64) arch=arm64 ;;
    *) echo "error: unsupported arch '$arch' — install supabase manually." >&2; exit 1 ;;
  esac
  mkdir -p "$HOME/.local/bin"
  tmpd="$(mktemp -d)"
  curl -fsSL "https://github.com/supabase/cli/releases/latest/download/supabase_linux_${arch}.tar.gz" -o "$tmpd/s.tar.gz"
  tar -xzf "$tmpd/s.tar.gz" -C "$tmpd"
  install -m 0755 "$tmpd/supabase" "$HOME/.local/bin/supabase"
  [ -f "$tmpd/supabase-go" ] && install -m 0755 "$tmpd/supabase-go" "$HOME/.local/bin/supabase-go"
  rm -rf "$tmpd"
  # keep ~/.local/bin on PATH for later shells in this sandbox (best-effort)
  if ! grep -qs 'HOME/.local/bin' /etc/sandbox-persistent.sh 2>/dev/null; then
    echo 'export PATH="$HOME/.local/bin:$PATH"' | sudo tee -a /etc/sandbox-persistent.sh >/dev/null 2>&1 || true
  fi
  echo "   installed Supabase CLI $(supabase --version 2>/dev/null || echo '(version?)')"
fi

# Optional feature branch (clone mode checks out the host's ref; it does NOT branch).
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
