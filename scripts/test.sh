#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"

export TMPDIR="$DIR/.tmp"
export npm_config_cache="$DIR/.cache/npm"

echo "============================================================"
echo "  🧪 [1/4] Running Comprehensive Test Suite (100+ Assertions)"
echo "============================================================"
npm run test --workspace=apps/api

echo ""
echo "============================================================"
echo "  📹 [2/4] Running Multi-User WebRTC Video Conferencing Audit"
echo "============================================================"
npm run test:webrtc --workspace=apps/api

echo ""
echo "============================================================"
echo "  🎯 [3/4] Running E2E 5-User Real-World Scenario"
echo "============================================================"
npm run test:e2e --workspace=apps/api

echo ""
echo "============================================================"
echo "  👥 [4/4] Running 100-Tester High-Concurrency Stress Suite"
echo "============================================================"
npm run test:load --workspace=apps/api

echo ""
echo "============================================================"
echo "  🎉 ALL AUDIT & STRESS TEST SUITES PASSED SUCCESSFULLY!"
echo "============================================================"
