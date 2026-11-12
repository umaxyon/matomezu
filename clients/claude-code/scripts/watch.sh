#!/bin/sh
# Claude Code のプラグインの monitor: matomezu の常駐の、AI を起こす知らせを 1 行ずつ出す（出した行で Claude Code のターンが始まる）。
# 引数 $1 は Claude Code のプロセス id（monitor のコマンドの $PPID）、$2 は Claude Code が立てたときのセッション id（CLAUDE_CODE_SESSION_ID。/clear でも変わらない）。
# join したときに MCP が添えた物と同じなので、その参加者への知らせだけが届く。
# 開いているフォルダが matomezu のリポジトリ（git の共通のフォルダの横に開発の常駐 .dev-home がある）なら、その常駐を見る。そうでなければ PATH の matomezu。
# どちらも無ければ何も出さずに終える
common=$(git -C "${CLAUDE_PROJECT_DIR:-.}" rev-parse --path-format=absolute --git-common-dir 2>/dev/null)
if [ -n "$common" ] && [ -x "$(dirname "$common")/.dev-home/matomezu" ]; then
  home="$(dirname "$common")/.dev-home"
  export MATOMEZU_HOME="$home"
  exec "$home/matomezu" watch --host "$1" --session "$2"
fi
command -v matomezu >/dev/null 2>&1 || exit 0
exec matomezu watch --host "$1" --session "$2"
