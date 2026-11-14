#!/bin/sh
# Claude Code のフック（PreToolUse。道具を使う前）: 読むだけの matomezu の道具は、利用者に聞かずに使ってよいと答える（どの道具かは matomezu permission が決める）。
# matomezu が見つからないときは何も言わない。フックの標準入力の JSON（tool_name）は permission がそのまま読む
. "$(dirname "$0")/find-matomezu.sh"
[ -n "$matomezu_bin" ] || exit 0
exec "$matomezu_bin" permission 2>/dev/null
