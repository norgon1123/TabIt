#!/usr/bin/env bash
# Bootstrap a git worktree so it can actually run.
#
# Git worktrees share history but NOT ignored artifacts, so a fresh worktree has no
# .venv and no frontend/node_modules. Agents then fail on "vite: command not found"
# or a missing import, and burn a whole session on `npm ci`. This makes that automatic.
#
# Strategy: symlink the root checkout's deps rather than reinstalling them.
#   - .venv is ~5GB (torch); node_modules ~150MB. With 20+ worktrees, per-worktree
#     installs would cost 100GB+.
#   - Sharing is safe for imports: `app` resolves from the worktree's own cwd/rootdir,
#     because setuptools' editable finder is appended AFTER PathFinder on sys.meta_path.
#     (Verified: bare `pytest` in a worktree using the root venv imports the WORKTREE's
#     app/, not the root's.)
#   - If this worktree's dependency manifests differ from the root's, the symlink would
#     be wrong -- so we detect that and do a real install here instead.
#
# Idempotent. Safe to run on every session start.
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
common_dir="$(git rev-parse --git-common-dir)"
# --git-common-dir is the root checkout's .git; its parent is the root checkout.
main_root="$(cd "$(dirname "$(cd "$common_dir" && pwd)")" && pwd)"

if [ "$repo_root" = "$main_root" ]; then
  exit 0  # Not a worktree -- the root checkout owns its own deps.
fi

cd "$repo_root"
say() { printf '[setup-worktree] %s\n' "$1"; }

# Same manifest as the root? Then the root's installed deps are correct for us.
same_file() { [ -f "$1" ] && [ -f "$2" ] && cmp -s "$1" "$2"; }

# ---- Python -----------------------------------------------------------------
if [ -e .venv ]; then
  :  # already set up
elif same_file pyproject.toml "$main_root/pyproject.toml" && [ -d "$main_root/.venv" ]; then
  ln -s "$main_root/.venv" .venv
  say "linked .venv -> root checkout (pyproject.toml matches)"
  say "  NOTE: this venv is SHARED. Do not run 'pip install -e .' from this worktree --"
  say "  it would repoint the root's editable install at this branch. See AGENTS.md."
else
  say "pyproject.toml differs from root (or root has no .venv) -- building a private venv"
  python -m venv .venv
  ./.venv/bin/pip install -q -e ".[dev]"
  say "created a private .venv for this worktree"
fi

# ---- Frontend ---------------------------------------------------------------
if [ -e frontend/node_modules ]; then
  :  # already set up
elif same_file frontend/package.json "$main_root/frontend/package.json" \
  && same_file frontend/package-lock.json "$main_root/frontend/package-lock.json" \
  && [ -d "$main_root/frontend/node_modules" ]; then
  ln -s "$main_root/frontend/node_modules" frontend/node_modules
  say "linked frontend/node_modules -> root checkout (package.json + lockfile match)"
else
  say "frontend manifests differ from root -- running npm ci (this takes a minute)"
  (cd frontend && npm ci --silent)
  say "installed frontend/node_modules for this worktree"
fi

# ---- Runtime prereq ---------------------------------------------------------
command -v ffmpeg >/dev/null 2>&1 || \
  say "WARNING: ffmpeg is not on PATH -- uploads will succeed but analysis jobs will fail."

say "ready."
