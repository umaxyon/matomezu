#!/bin/sh
# Claude Code のプラグインの monitor: matomezu の常駐の、AI を起こす知らせを 1 行ずつ出す（出した行で Claude Code のターンが始まる）。
# 引数 $1 は Claude Code のプロセス id（monitor のコマンドの $PPID）、$2 は Claude Code が立てたときのセッション id（CLAUDE_CODE_SESSION_ID。/clear でも変わらない）。
# join したときに MCP が添えた物と同じなので、その参加者への知らせだけが届く。matomezu が見つからなければ何も出さずに終える
. "$(dirname "$0")/find-matomezu.sh"
[ -n "$matomezu_bin" ] || exit 0
# Claude Code の monitor は、1 行を約 500 字で、続けて出した行を 1 回の知らせにまとめて約 3,000 字で切る。間を 1 秒空ければ別の知らせになる
exec "$matomezu_bin" watch --host "$1" --session "$2" --max-line 480 --max-notice 2800 --gap 1s
