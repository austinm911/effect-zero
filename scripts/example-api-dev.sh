set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PORTLESS_NAME="${PORTLESS_NAME:-effect-zero-api}"

cd "$REPO_ROOT/examples/api"
exec portless --force "$PORTLESS_NAME" env HOST="${HOST:-0.0.0.0}" pnpm exec tsx watch src/server.ts
