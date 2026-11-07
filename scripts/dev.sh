#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"

export TMPDIR="$DIR/.tmp"
export npm_config_cache="$DIR/.cache/npm"

mkdir -p "$TMPDIR" "$npm_config_cache" "$DIR/database"

echo "============================================================"
echo "  🚀 Starting ClubRoom Video Meeting Ecosystem"
echo "  💾 Storage Partition: $DIR"
echo "============================================================"

# Seed check
npm run seed --workspace=apps/api

# Run API and Web in parallel
npx concurrently -k -p "[{name}]" -n "API,WEB" -c "cyan.bold,magenta.bold" \
  "npm run dev:api" \
  "npm run dev:web"

