# 中央の中継（scripts/relay-log.ts serve）を立てる手伝い。scripts/claude-relay.sh と scripts/codex-relay.sh が、リポジトリの根から読み込む
#   relay_prepare <AI の名前> [AI に渡す引数...]
#     引数が --stop なら中央の中継を止めて終える。RELAY_NAME が名前の決まりに合わなければ終える。
#     中継が動いていなければ立て、動けば RELAY_OK=1 と RELAY_BASE（中継の根の URL）を、立てられなければ警告を出して RELAY_OK=0 にする
#     （中継の障害で作業が止まらないように、呼んだ側は中継なしで AI を起動する）
#   環境変数: RELAY_NAME（任意）RELAY_PORT（既定 18951）VIEW_PORT（既定 18952）RELAY_DB（既定 ~/.local/state/matomezu-relay/central.db）

RELAY_PORT=${RELAY_PORT:-18951}
VIEW_PORT=${VIEW_PORT:-18952}
RELAY_DB=${RELAY_DB:-${XDG_STATE_HOME:-$HOME/.local/state}/matomezu-relay/central.db}
RELAY_STATE=$(dirname "$RELAY_DB")
RELAY_PIDFILE=$RELAY_STATE/server.pid
RELAY_LOG=$RELAY_STATE/server.log
RELAY_BASE="http://127.0.0.1:$RELAY_PORT"
RELAY_OK=0

relay_health() { curl -fsS -m 1 "$RELAY_BASE/__relay/health" >/dev/null 2>&1; }

relay_prepare() {
  local ai=$1
  shift
  if [ "${1:-}" = "--stop" ]; then
    if [ -f "$RELAY_PIDFILE" ] && kill "$(cat "$RELAY_PIDFILE")" 2>/dev/null; then echo "中継を止めた"; else echo "動いている中継の記録が無い" >&2; fi
    rm -f "$RELAY_PIDFILE"
    exit 0
  fi
  if [ -n "${RELAY_NAME:-}" ] && ! [[ "$RELAY_NAME" =~ ^[A-Za-z0-9_.-]{1,40}$ ]]; then
    echo "RELAY_NAME は英数字と _ . - の 40 字まで" >&2
    exit 2
  fi
  if ! relay_health; then
    mkdir -p "$RELAY_STATE"
    setsid nohup bun scripts/relay-log.ts serve --db "$RELAY_DB" --port "$RELAY_PORT" --view-port "$VIEW_PORT" --pid-file "$RELAY_PIDFILE" >>"$RELAY_LOG" 2>&1 &
    for _ in 1 2 3 4 5 6 7 8 9 10; do relay_health && break; sleep 0.5; done
  fi
  if relay_health; then
    RELAY_OK=1
    echo "中継: ビューワー http://127.0.0.1:$VIEW_PORT" >&2
  else
    echo "警告: 中継を立てられなかった（$RELAY_LOG を見る）。中継なしで $ai を起動する" >&2
  fi
}

# 道に付けるセッション名（RELAY_NAME が無ければ空）
relay_name_path() { if [ -n "${RELAY_NAME:-}" ]; then echo "/s/$RELAY_NAME"; fi; }
