#!/bin/sh
# Claude Code のフック（UserPromptSubmit。AI のターンの始まり）: 常駐に、ターンの始まりを知らせ（利用者トリガートークなら読まれた伝言の期限が数え始まる）、
# AI の応えを待つアノテーションを聞いて、あればターンの始まりに添える。matomezu が見つからないとき・常駐が無いとき・待つ物が無いときは何も出さない（どの案件のセッションでも走る）。
# フックの出力は JSON か文のどちらか 1 つなので、アノテーションの文は talked に渡し、talked が（参加の知らせのときは JSON に入れて）まとめて出す。
# フックの標準入力の JSON（session_id・transcript_path）は talked がそのまま読む。
# 引数 $1 は Claude Code のプロセス id（フックのコマンドの $PPID）。talked が常駐に添え、/clear でセッション id が変わっても同じ参加者に結び直す
. "$(dirname "$0")/find-matomezu.sh"
[ -n "$matomezu_bin" ] || exit 0
notes=$("$matomezu_bin" annotations 2>/dev/null)
"$matomezu_bin" talked --host "$1" --context "$notes" 2>/dev/null
exit 0
