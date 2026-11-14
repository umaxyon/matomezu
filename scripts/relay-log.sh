#!/usr/bin/env bash
# 中継とビューワーを立て、中継越しの claude を前面で起動する。claude を終えると中継とビューワーも止まる
#   scripts/relay-log.sh [claude に渡す引数...]
#   環境変数: RELAY_PORT（既定 18951）VIEW_PORT（既定 18952）RELAY_OUT（記録の置き場。既定 tmp/relay-log/<日時>）
set -euo pipefail
cd "$(dirname "$0")/.."

RELAY_PORT=${RELAY_PORT:-18951}
VIEW_PORT=${VIEW_PORT:-18952}
OUT=${RELAY_OUT:-tmp/relay-log/$(date +%Y%m%d-%H%M%S)}
mkdir -p "$OUT"

bun scripts/relay-log.ts --port "$RELAY_PORT" --out "$OUT" --full >"$OUT/relay.log" 2>&1 &
RELAY_PID=$!
bun scripts/relay-log.ts view "$OUT" --port "$VIEW_PORT" >"$OUT/view.log" 2>&1 &
VIEW_PID=$!
trap 'kill "$RELAY_PID" "$VIEW_PID" 2>/dev/null || true' EXIT

sleep 1
for pid in "$RELAY_PID" "$VIEW_PID"; do
  kill -0 "$pid" 2>/dev/null || { echo "起動に失敗: $OUT の relay.log・view.log を見る（ポートが使用中かも）" >&2; exit 1; }
done

echo "ビューワー: http://127.0.0.1:$VIEW_PORT  記録: $OUT" >&2
ANTHROPIC_BASE_URL="http://127.0.0.1:$RELAY_PORT" claude "$@"
