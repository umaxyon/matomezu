#!/usr/bin/env bash
# 中央の中継（scripts/relay-log.ts serve）を通して codex を起動する。中継が動いていなければ立てる
#   scripts/codex-relay.sh [codex に渡す引数...]
#   ChatGPT のログインのまま、窓口 matomezu_relay（Responses API、base_url は中継の /codex）を -c で足して使う。
#   セッションの名前は、matomezu に join したときのワークルーム名が記録から付く（join 前は session_id の後ろ 8 字）。
#   join 前の名前を付けたいときだけ、RELAY_NAME=<名前> を付ける（base_url が中継の /codex/s/<名前> になる）
#   codex の共有の常駐を通すと窓口の設定が会話に届かないので、引数に --no-daemon が無ければ足す
#   scripts/codex-relay.sh --stop        中央の中継を止める（scripts/claude-relay.sh --stop と同じ中継）
#   環境変数: RELAY_NAME（任意）RELAY_PORT（既定 18951）VIEW_PORT（既定 18952）RELAY_DB（既定 ~/.local/state/matomezu-relay/central.db）
# 中継を立てられなければ、警告を出して中継なしで codex を起動する（中継の障害で作業が止まらないように）
set -uo pipefail
cd "$(dirname "$0")/.."
. scripts/relay-log/relay.sh

relay_prepare codex "$@"
if [ "$RELAY_OK" != 1 ]; then exec codex "$@"; fi
no_daemon=(--no-daemon)
for arg in "$@"; do if [ "$arg" = --no-daemon ]; then no_daemon=(); fi; done
provider="{name=\"matomezu_relay\",base_url=\"$RELAY_BASE/codex$(relay_name_path)\",requires_openai_auth=true,wire_api=\"responses\"}"
exec codex "${no_daemon[@]}" -c model_provider=matomezu_relay -c "model_providers.matomezu_relay=$provider" "$@"
