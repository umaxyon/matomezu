#!/bin/sh
# Codex のフック（セッションが始まったとき）: 常駐に、セッションのモデルを知らせる。matomezu が見つからないとき・常駐が無いときは何もしない。
# フックの標準入力の JSON（session_id と model）は model がそのまま読む
. "$(dirname "$0")/find-matomezu.sh"
[ -n "$matomezu_bin" ] || exit 0
"$matomezu_bin" model >/dev/null 2>&1
exit 0
