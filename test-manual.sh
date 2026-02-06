#!/bin/bash
# Pi Mesh - Manual Integration Test
#
# Prerequisites:
# - Pi installed and available in PATH
# - This extension installed: pi install ./path/to/pi-mesh
# - A .pi/ directory exists in cwd (or a parent)
#
# Usage: bash test-manual.sh

set -e

echo "=== Pi Mesh Manual Integration Test ==="
echo ""

# Clean up any leftover mesh state
MESH_DIR=".pi/mesh"
if [ -d "$MESH_DIR" ]; then
  echo "Cleaning up old mesh state..."
  rm -rf "$MESH_DIR"
fi

echo "Step 1: Start Session A (background)"
echo "  Run in terminal 1:"
echo "    PI_AGENT=zero PI_AGENT_NAME=test-a pi"
echo ""
echo "  Then in the session:"
echo "    mesh_peers({})"
echo "    mesh_reserve({ paths: ['src/auth/'], reason: 'testing' })"
echo ""

echo "Step 2: Start Session B (background)"
echo "  Run in terminal 2:"
echo "    PI_AGENT=zero PI_AGENT_NAME=test-b pi"
echo ""
echo "  Then in the session:"
echo "    mesh_peers({})  // Should see test-a"
echo "    // Try editing src/auth/login.ts - should be BLOCKED"
echo ""

echo "Step 3: Test messaging"
echo "  In Session A:"
echo "    mesh_send({ to: 'test-b', message: 'hello from A' })"
echo "  In Session B:"
echo "    // Should receive message"
echo "    mesh_send({ to: 'test-a', message: 'hello back', urgent: true })"
echo "  In Session A:"
echo "    // Should be interrupted by urgent message"
echo ""

echo "Step 4: Test overlay"
echo "  In either session:"
echo "    /mesh"
echo "  Verify: Agents tab shows both, Feed tab shows events, Chat works"
echo ""

echo "Step 5: Cleanup"
echo "  Exit both sessions (Ctrl+C or /exit)"
echo "  Verify: $MESH_DIR/registry/ is empty (registrations cleaned up)"
echo "  Verify: $MESH_DIR/feed.jsonl has join/leave events"
echo ""

echo "Step 6: Check unit tests"
echo "  bun test"
echo ""

echo "=== End of test plan ==="
