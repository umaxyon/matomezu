#!/bin/sh
# Claude Code のプラグインの monitor: matomezu の常駐の、AI を起こす知らせを 1 行ずつ出す（出した行で Claude Code のターンが始まる）。
# 引数 $1 は Claude Code のプロセス id（monitor のコマンドの $PPID）、$2 は Claude Code が立てたときのセッション id（CLAUDE_CODE_SESSION_ID。/clear でも変わらない）。
# join したときに MCP が添えた物と同じなので、その参加者への知らせだけが届く。matomezu が見つからなければ何も出さずに終える
. "$(dirname "$0")/find-matomezu.sh"
[ -n "$matomezu_bin" ] || exit 0
exec "$matomezu_bin" watch --host "$1" --session "$2"
