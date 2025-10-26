#!/usr/bin/env bash
set -euo pipefail
HOOK_DIR=".git/hooks"
SRC_DIR="git-hooks"
if [ ! -d "$HOOK_DIR" ]; then
  echo "This repo doesn't look like a git repo or .git/hooks missing" >&2
  exit 1
fi
for f in "$SRC_DIR"/*; do
  fname=$(basename "$f")
  cp "$f" "$HOOK_DIR/$fname"
  chmod +x "$HOOK_DIR/$fname"
  echo "Installed hook: $fname"
done
echo "Done installing hooks."
