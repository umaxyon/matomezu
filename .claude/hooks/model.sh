#!/bin/sh
# Claude Code のフック（セッションが始まったとき・モデルを切り替えたとき）: 開発の常駐（main の worktree の .dev-home）に、セッションのモデルを知らせる。
# どの worktree から呼んでも main の常駐を見る。常駐が無いときは何もしない。
# フックの標準入力の JSON（session_id と、model か to_model）は model がそのまま読む。
# 引数 $1 は Claude Code のプロセス id（フックのコマンドの $PPID）。model が常駐に添え、/clear でセッション id が変わっても同じ参加者に結び直す
common=$(git -C "${CLAUDE_PROJECT_DIR:-.}" rev-parse --path-format=absolute --git-common-dir 2>/dev/null) || exit 0
home="$(dirname "$common")/.dev-home"
[ -x "$home/matomezu" ] || exit 0
export MATOMEZU_HOME="$home"
"$home/matomezu" model --host "$1" >/dev/null 2>&1
exit 0
