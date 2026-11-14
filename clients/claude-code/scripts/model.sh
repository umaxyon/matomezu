#!/bin/sh
# Claude Code のフック（セッションが始まったとき・モデルを切り替えたとき）: 常駐に、セッションのモデルを知らせる。matomezu が見つからないとき・常駐が無いときは何もしない。
# フックの標準入力の JSON（session_id と、model か to_model）は model がそのまま読む。
# 引数 $1 は Claude Code のプロセス id（フックのコマンドの $PPID）。model が常駐に添え、/clear でセッション id が変わっても同じ参加者に結び直す
. "$(dirname "$0")/find-matomezu.sh"
[ -n "$matomezu_bin" ] || exit 0
"$matomezu_bin" model --host "$1" >/dev/null 2>&1
exit 0
