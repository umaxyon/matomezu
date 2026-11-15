#!/usr/bin/env bash
# M-0084 段 2: 残りを数える（0 が目標）。typecheck の誤りの数と、型に出ない古い読み方の数（grep）を合わせる。
# -v を付けると、全部の行を出す。段 2 を main に入れるときに、このスクリプトは消す
set -uo pipefail
cd "$(dirname "$0")/.."
OLD='"pages" in |\.pages as |\bhasPages\(|\bpagedOf\(|\bPagedBook\b|\bdefineBookType\b|\bBookOf<|\bBookData<|\bbook\.type\b|\bbookItems\(|\bcreateBook\(|\bcreatableTypes\(|"pages":|\bactionsOf\(|book-theme|book-paper-color|book-text-colors'
types=$(bunx tsc --noEmit -p . 2>&1 | grep "error TS" || true)
old=$(git grep -n -E "$OLD" -- web/src test e2e internal ':!web/src/core/book.ts' || true)
count() { [ -z "$1" ] && echo 0 || echo "$1" | wc -l; }
echo "typecheck: $(count "$types")  (web/src: $(count "$(echo "$types" | grep '^web/src' || true)"), test: $(count "$(echo "$types" | grep -E '^(test|e2e)' || true)"))"
echo "old reads (grep): $(count "$old")"
echo "left: $(( $(count "$types") + $(count "$old") ))"
if [ "${1:-}" = "-v" ]; then echo "$types"; echo "$old"; fi
