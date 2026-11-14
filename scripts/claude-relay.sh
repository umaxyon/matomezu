#!/usr/bin/env bash
# 中央の中継（scripts/relay-log.ts serve）を通して claude を起動する。中継が動いていなければ立てる
#   scripts/claude-relay.sh <セッション名> [claude に渡す引数...]
#   scripts/claude-relay.sh --stop        中央の中継を止める
#   環境変数: RELAY_PORT（既定 18951）VIEW_PORT（既定 18952）RELAY_DB（既定 tmp/relay-log/central.db）
# 中継を立てられなければ、警告を出して中継なしで claude を起動する（中継の障害で作業が止まらないように）
set -uo pipefail
cd "$(dirname "$0")/.."

RELAY_PORT=${RELAY_PORT:-18951}
VIEW_PORT=${VIEW_PORT:-18952}
DB=${RELAY_DB:-tmp/relay-log/central.db}
PIDFILE=tmp/relay-log/server.pid
LOG=tmp/relay-log/server.log
health() { curl -fsS -m 1 "http://127.0.0.1:$RELAY_PORT/__relay/health" >/dev/null 2>&1; }

if [ "${1:-}" = "--stop" ]; then
  if [ -f "$PIDFILE" ] && kill "$(cat "$PIDFILE")" 2>/dev/null; then echo "中継を止めた"; else echo "動いている中継の記録が無い" >&2; fi
  rm -f "$PIDFILE"
  exit 0
fi
if [ $# -lt 1 ]; then echo "usage: scripts/claude-relay.sh <セッション名> [claude の引数...]" >&2; exit 2; fi
SESSION=$1
shift
if ! [[ "$SESSION" =~ ^[A-Za-z0-9_.-]{1,40}$ ]]; then echo "セッション名は英数字と _ . - の 40 字まで" >&2; exit 2; fi

if ! health; then
  mkdir -p "$(dirname "$LOG")"
  setsid nohup bun scripts/relay-log.ts serve --db "$DB" --port "$RELAY_PORT" --view-port "$VIEW_PORT" >>"$LOG" 2>&1 &
  echo $! >"$PIDFILE"
  for _ in 1 2 3 4 5 6 7 8 9 10; do health && break; sleep 0.5; done
fi

if health; then
  echo "中継: セッション $SESSION、ビューワー http://127.0.0.1:$VIEW_PORT" >&2
  ANTHROPIC_BASE_URL="http://127.0.0.1:$RELAY_PORT/s/$SESSION" exec claude "$@"
fi
echo "警告: 中継を立てられなかった（$LOG を見る）。中継なしで claude を起動する" >&2
exec claude "$@"
