#!/bin/sh
# Codex のフック（UserPromptSubmit。利用者の入力でターンが始まるとき）: 常駐に、ターンの始まりを知らせ（読まれた伝言の期限が数え始まる）、
# AI の応えを待つアノテーションを聞いて、あればターンの始まりに添える。matomezu が見つからないとき・常駐が無いとき・待つ物が無いときは何も出さない。
# フックの標準入力の JSON（session_id・transcript_path）は talked がそのまま読む
. "$(dirname "$0")/find-matomezu.sh"
[ -n "$matomezu_bin" ] || exit 0
notes=$("$matomezu_bin" annotations 2>/dev/null)
"$matomezu_bin" talked --context "$notes" 2>/dev/null
exit 0
