#!/bin/sh
# Claude Code のフック（UserPromptSubmit。AI のターンの始まり）: 開発の常駐（main の worktree の .dev-home）に、ターンの始まりを知らせ（利用者トリガートークなら読まれた伝言の期限が数え始まる）、
# AI の応えを待つアノテーションを聞いて、あればターンの始まりに添える。どの worktree から呼んでも main の常駐を見る。常駐が無い・待つ物が無いときは何も出さない。
# フックの出力は JSON か文のどちらか 1 つなので、アノテーションの文は talked に渡し、talked が（参加の知らせのときは JSON に入れて）まとめて出す。
# フックの標準入力の JSON（session_id・transcript_path）は talked がそのまま読む。
# 引数 $1 は Claude Code のプロセス id（フックのコマンドの $PPID）。talked が常駐に添え、/clear でセッション id が変わっても同じ参加者に結び直す
common=$(git -C "${CLAUDE_PROJECT_DIR:-.}" rev-parse --path-format=absolute --git-common-dir 2>/dev/null) || exit 0
home="$(dirname "$common")/.dev-home"
[ -x "$home/matomezu" ] || exit 0
export MATOMEZU_HOME="$home"
notes=$("$home/matomezu" annotations 2>/dev/null)
"$home/matomezu" talked --host "$1" --context "$notes" 2>/dev/null
exit 0
