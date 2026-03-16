#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ZERO_CACHE_URL="${VITE_PUBLIC_ZERO_CACHE_URL:-http://localhost:4848}"
API_BASE_URL="${EFFECT_ZERO_API_BASE_URL:-http://effect-zero-api.localhost:1355}"
API_INTERNAL_URL="${EFFECT_ZERO_API_INTERNAL_URL:-}"
PORTLESS_NAME="${PORTLESS_NAME:-effect-zero-ztunes}"
LOCAL_API_HOST="${EFFECT_ZERO_API_INTERNAL_HOST:-}"

if [ -z "$LOCAL_API_HOST" ]; then
  LOCAL_API_HOST="$(ipconfig getifaddr en0 2>/dev/null || true)"
fi

if [ -z "$LOCAL_API_HOST" ]; then
  LOCAL_API_HOST="$(ipconfig getifaddr en1 2>/dev/null || true)"
fi

if [ -z "$API_INTERNAL_URL" ] && command -v portless >/dev/null 2>&1; then
  API_ROUTE_LINE=$(portless list 2>/dev/null | grep -F "http://effect-zero-api.localhost:1355" | head -1 || true)
  API_UPSTREAM=$(printf '%s\n' "$API_ROUTE_LINE" | awk '{print $3}')
  if [ -n "$API_UPSTREAM" ]; then
    API_INTERNAL_URL="http://${LOCAL_API_HOST:-127.0.0.1}:${API_UPSTREAM##*:}"
  fi
fi

cd "$REPO_ROOT/examples/ztunes"
exec env \
  EFFECT_ZERO_API_INTERNAL_URL="${API_INTERNAL_URL:-$API_BASE_URL}" \
  EFFECT_ZERO_API_BASE_URL="$API_BASE_URL" \
  VITE_PUBLIC_ZERO_CACHE_URL="$ZERO_CACHE_URL" \
  portless --force "$PORTLESS_NAME" vite dev
