#!/usr/bin/env bash
# pr-build-body.sh — canonical PR body generator for Ortho.
#
# Every LLM-generated PR body MUST be produced by this script so all PRs share
# one shape. Do not hand-write or append to PR bodies; if a section is missing,
# add a flag here instead.
#
# Usage:
#   .claude/scripts/pr-build-body.sh \
#     --summary "bullet 1" --summary "bullet 2" \
#     --test "step 1" --test "step 2" \
#     [--breaking "note"]... \
#     [--spec "specs/NNN-feature-dir"]... \
#     [--link "free-form linked item"]...
#
# Rules:
#   --summary  1-4 required   what the PR does (the what, not the how)
#   --test     1-5 required   reviewer-verifiable steps (rendered as checkboxes)
#   --breaking optional       each becomes a bullet under "## Breaking changes"
#   --spec     optional       a specs/NNN-…/ dir this PR implements (linked)
#   --link     optional       any other linked item (rendered verbatim)
set -euo pipefail

summaries=()
tests=()
breaking=()
specs=()
links=()

err() { echo "pr-build-body.sh: $*" >&2; exit 1; }

while [ $# -gt 0 ]; do
  case "$1" in
    --summary)  [ $# -ge 2 ] || err "--summary needs a value"; summaries+=("$2"); shift 2 ;;
    --test)     [ $# -ge 2 ] || err "--test needs a value";    tests+=("$2");     shift 2 ;;
    --breaking) [ $# -ge 2 ] || err "--breaking needs a value"; breaking+=("$2"); shift 2 ;;
    --spec)     [ $# -ge 2 ] || err "--spec needs a value";    specs+=("$2");     shift 2 ;;
    --link)     [ $# -ge 2 ] || err "--link needs a value";    links+=("$2");     shift 2 ;;
    -h|--help)  grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *)          err "unknown flag: $1 (see --help)" ;;
  esac
done

[ ${#summaries[@]} -ge 1 ] || err "at least one --summary is required"
[ ${#summaries[@]} -le 4 ] || err "at most 4 --summary bullets (got ${#summaries[@]})"
[ ${#tests[@]} -ge 1 ]     || err "at least one --test is required"
[ ${#tests[@]} -le 5 ]     || err "at most 5 --test steps (got ${#tests[@]})"

echo "## Summary"
for s in "${summaries[@]}"; do echo "- $s"; done

if [ ${#breaking[@]} -gt 0 ]; then
  echo ""
  echo "## Breaking changes"
  for b in "${breaking[@]}"; do echo "- $b"; done
fi

echo ""
echo "## Test plan"
for t in "${tests[@]}"; do echo "- [ ] $t"; done

if [ ${#specs[@]} -gt 0 ] || [ ${#links[@]} -gt 0 ]; then
  echo ""
  echo "## Linked"
  for sp in "${specs[@]}"; do echo "- Spec: [\`${sp%/}/\`](${sp%/}/)"; done
  for l in "${links[@]}"; do echo "- $l"; done
fi

echo ""
echo "🤖 Generated with [Claude Code](https://claude.com/claude-code)"
