#!/bin/bash
set -euo pipefail

# Run zero-cache-dev with Node (not Bun) to avoid native module issues.
# Cleans up stale processes and replica cache before starting.

ZERO_PORT="${ZERO_PORT:-4848}"
ZERO_CVR_PORT="${ZERO_CVR_PORT:-4849}"
ZERO_APP_ROUTE="${ZERO_APP_ROUTE:-effect-zero-ztunes.localhost:1355}"
ZERO_FALLBACK_APP_ORIGIN="${ZERO_FALLBACK_APP_ORIGIN:-http://localhost:4558}"

resolve_zero_api_origin() {
  if [ -n "${ZERO_API_ORIGIN:-}" ]; then
    printf '%s' "$ZERO_API_ORIGIN"
    return
  fi

  if command -v portless >/dev/null 2>&1; then
    local route_line
    local upstream
    route_line=$(portless list 2>/dev/null | grep -F "http://$ZERO_APP_ROUTE" | head -1 || true)
    upstream=$(printf '%s\n' "$route_line" | awk '{print $3}')
    if [ -n "$upstream" ]; then
      printf 'http://localhost:%s' "${upstream##*:}"
      return
    fi
  fi

  printf '%s' "$ZERO_FALLBACK_APP_ORIGIN"
}

ZERO_API_ORIGIN="$(resolve_zero_api_origin)"

# ─── Env defaults (match infra/alchemy postgres config) ─────────────────────
export ZERO_UPSTREAM_DB="${ZERO_UPSTREAM_DB:-postgres://postgres:postgres@localhost:5438/effect_zero}"
export ZERO_MUTATE_URL="${ZERO_MUTATE_URL:-$ZERO_API_ORIGIN/api/zero/mutate}"
export ZERO_QUERY_URL="${ZERO_QUERY_URL:-$ZERO_API_ORIGIN/api/zero/query}"
export ZERO_MUTATE_FORWARD_COOKIES="${ZERO_MUTATE_FORWARD_COOKIES:-true}"
export ZERO_QUERY_FORWARD_COOKIES="${ZERO_QUERY_FORWARD_COOKIES:-true}"
export ZERO_LOG_LEVEL="${ZERO_LOG_LEVEL:-debug}"
export ZERO_REPLICA_FILE="${ZERO_REPLICA_FILE:-/tmp/effect-zero-replica.db}"

# ─── Cleanup helper ──────────────────────────────────────────────────────────
cleanup_port() {
  local port="$1"
  local pids
  pids=$(lsof -ti "tcp:$port" 2>/dev/null || true)
  if [ -n "$pids" ]; then
    echo "⚠️  Killing stale process(es) on port $port: $pids"
    echo "$pids" | xargs kill -9 2>/dev/null || true
    sleep 0.5
  fi
}

# ─── Kill stale zero-cache processes on both ports ────────────────────────────
cleanup_port "$ZERO_PORT"
cleanup_port "$ZERO_CVR_PORT"

# ─── Delete stale replica cache ──────────────────────────────────────────────
# Zero caches the upstream schema in a local SQLite file. After schema changes
# the cached replica is stale and Zero will reject tables it doesn't know about.
# In dev, always start fresh.
if [ -f "$ZERO_REPLICA_FILE" ]; then
  echo "🗑️  Removing stale replica cache: $ZERO_REPLICA_FILE"
  rm -f "$ZERO_REPLICA_FILE"
fi

# ─── Activate mise for correct node version ──────────────────────────────────
if command -v mise >/dev/null 2>&1; then
  eval "$(mise activate bash 2>/dev/null)"
fi

NODE_CMD=$(which node)

if command -v mise >/dev/null 2>&1; then
  MISE_NODE22_CMD=$(
    mise ls node --json 2>/dev/null | "$NODE_CMD" -e '
      const fs = require("fs");
      const versions = JSON.parse(fs.readFileSync(0, "utf8"));
      const match = versions.find((entry) => entry.installed && /^22\./.test(String(entry.version)));
      if (match?.install_path) process.stdout.write(`${match.install_path}/bin/node`);
    '
  )
  if [ -n "${MISE_NODE22_CMD:-}" ] && [ -x "$MISE_NODE22_CMD" ]; then
    NODE_CMD="$MISE_NODE22_CMD"
  fi
fi

# ─── Locate @rocicorp/zero package ───────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Try pnpm hoisted location first, then .pnpm store
ZERO_PKG=$(find "$REPO_ROOT/node_modules/.pnpm" -type d -path "*/@rocicorp/zero" 2>/dev/null | head -1)

if [ -z "$ZERO_PKG" ]; then
  ZERO_PKG="$REPO_ROOT/node_modules/@rocicorp/zero"
fi

if [ ! -d "$ZERO_PKG" ]; then
  echo "Error: Could not find @rocicorp/zero package"
  exit 1
fi

export PATH="$REPO_ROOT/node_modules/.bin:$PATH"

ZERO_CACHE="$ZERO_PKG/out/zero/src/zero-cache-dev.js"
ZERO_CACHE_CLI="$ZERO_PKG/out/zero/src/cli.js"

if [ ! -f "$ZERO_CACHE" ]; then
  echo "Error: Could not find zero-cache-dev.js at $ZERO_CACHE"
  exit 1
fi

if [ ! -f "$ZERO_CACHE_CLI" ]; then
  echo "Error: Could not find zero-cache cli at $ZERO_CACHE_CLI"
  exit 1
fi

# zero-cache-dev.js shells out to `zero-cache`. In this workspace that bin is not
# always linked into node_modules/.bin, so provide a shim explicitly.
ZERO_CACHE_BIN_DIR="$(mktemp -d /tmp/effect-zero-zero-cache-bin.XXXXXX)"
cat >"$ZERO_CACHE_BIN_DIR/zero-cache" <<EOF
#!/bin/sh
exec "$NODE_CMD" "$ZERO_CACHE_CLI" "\$@"
EOF
chmod +x "$ZERO_CACHE_BIN_DIR/zero-cache"
export PATH="$ZERO_CACHE_BIN_DIR:$PATH"

echo "🚀 Starting zero-cache-dev on port $ZERO_PORT"
echo "   upstream: $ZERO_UPSTREAM_DB"
echo "   mutate:   $ZERO_MUTATE_URL"
echo "   query:    $ZERO_QUERY_URL"

# ─── Trap to clean up child processes on exit ────────────────────────────────
trap 'echo "Shutting down zero-cache-dev..."; rm -rf "$ZERO_CACHE_BIN_DIR"; kill 0 2>/dev/null; wait 2>/dev/null' EXIT INT TERM

exec "$NODE_CMD" "$ZERO_CACHE" "$@"
