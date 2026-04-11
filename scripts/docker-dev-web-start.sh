#!/bin/sh
set -eu

LOCKFILE="package-lock.json"
STAMP_DIR="node_modules/.lt316-dev"
STAMP_FILE="$STAMP_DIR/package-lock.sha256"

mkdir -p "$STAMP_DIR"

current_hash="$(sha256sum "$LOCKFILE" | awk '{print $1}')"
installed_hash=""

if [ -f "$STAMP_FILE" ]; then
  installed_hash="$(cat "$STAMP_FILE")"
fi

if [ ! -d "node_modules/openai" ] || [ "$current_hash" != "$installed_hash" ]; then
  echo "[lt316-admin:web] package-lock changed or node_modules is incomplete; running npm ci"
  npm ci
  mkdir -p "$STAMP_DIR"
  printf "%s" "$current_hash" > "$STAMP_FILE"
fi

exec npm run dev -- --hostname 0.0.0.0 --port 3000
