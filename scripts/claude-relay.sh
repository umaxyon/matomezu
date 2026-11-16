#!/usr/bin/env bash
# 中央の中継（scripts/relay-log.ts serve）を通して claude を起動する。中継が動いていなければ立てる
#   scripts/claude-relay.sh [claude に渡す引数...]
#   セッションの名前は、matomezu に join したときのワークルーム名が記録から付く（join 前は session_id の頭 8 字）。
#   join 前の名前を付けたいときだけ、RELAY_NAME=<名前> を付ける
#   scripts/claude-relay.sh --stop        中央の中継を止める（scripts/codex-relay.sh --stop と同じ中継）
#   環境変数: RELAY_NAME（任意）RELAY_PORT（既定 18951）VIEW_PORT（既定 18952）RELAY_DB（既定 ~/.local/state/matomezu-relay/central.db）
# 中継を立てられなければ、警告を出して中継なしで claude を起動する（中継の障害で作業が止まらないように）
set -uo pipefail
cd "$(dirname "$0")/.."
. scripts/relay-log/relay.sh

relay_prepare claude "$@"
if [ "$RELAY_OK" = 1 ]; then ANTHROPIC_BASE_URL="$RELAY_BASE$(relay_name_path)" exec claude "$@"; fi
exec claude "$@"
