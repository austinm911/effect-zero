#!/bin/bash
set -euo pipefail

API_INTERNAL_URL="${EFFECT_ZERO_API_INTERNAL_URL:-${EFFECT_ZERO_API_BASE_URL:-http://localhost:4311}}"
ZTUNES_APP_URL="${EFFECT_ZERO_APP_URL:-http://localhost:4310}"

cleanup() {
  trap - EXIT INT TERM
  jobs -p | xargs -r kill 2>/dev/null || true
  wait 2>/dev/null || true
}

wait_for_http_ready() {
  local url="$1"
  local attempts="${2:-120}"
  local sleep_seconds="${3:-0.25}"
  local current_attempt=1

  while (( current_attempt <= attempts )); do
    if curl --silent --show-error --fail --max-time 2 "$url" >/dev/null; then
      return 0
    fi

    sleep "$sleep_seconds"
    current_attempt=$((current_attempt + 1))
  done

  return 1
}

trap cleanup EXIT INT TERM

pnpm --filter @effect-zero/example-api dev &
wait_for_http_ready "$API_INTERNAL_URL/" || {
  echo "Failed to reach healthy API at $API_INTERNAL_URL" >&2
  exit 1
}

env EFFECT_ZERO_API_BASE_URL="$API_INTERNAL_URL" EFFECT_ZERO_API_INTERNAL_URL="$API_INTERNAL_URL" pnpm --filter @effect-zero/example-ztunes dev &
wait_for_http_ready "$ZTUNES_APP_URL/" || {
  echo "Failed to reach healthy ztunes app at $ZTUNES_APP_URL" >&2
  exit 1
}
scripts/zero-cache-dev.sh &

wait
