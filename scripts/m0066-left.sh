#!/usr/bin/env bash
# 橋渡しの間だけ（M-0066。最後に消す）: 古い形（フックの第 1 引数・props の stage・場所を取る操作）の残りを、型の誤りとして数える。
# core/legacy.ts の切り替えを一時的に切って typecheck を流し、元に戻す。引数に -v を付けると誤りを全部出す（無ければファイルごとの数）
set -u
cd "$(dirname "$0")/.."
f=web/src/core/legacy.ts
trap 'sed -i "s/^export type LegacyOn = false$/export type LegacyOn = true/" "$f"' EXIT
sed -i 's/^export type LegacyOn = true$/export type LegacyOn = false/' "$f"
# typecheck は && でつないでいて、最初の tsc が落ちると見本を見ない。だから 1 つずつ流す
out=""
for p in . test/added-plugins/ex1 test/added-plugins/ex2 test/added-plugins/ex3 test/added-plugins/ex4 test/added-plugins/ex4/tsconfig.without-tests.json test/added-plugins/ex5 test/added-plugins/ex6-spec test/added-plugins/ex6 test/added-plugins/ex7 test/added-plugins/ex8 test/added-plugins/ex9 test/added-plugins/ex10 test/added-plugins/ex11 test/added-plugins/ex12 test/added-plugins/ex13 test/added-plugins/ex14 test/type-checks/unowned-names; do
  out="$out
$(bunx tsc --noEmit -p "$p" 2>&1 | grep "error TS" || true)"
done
out=$(echo "$out" | grep "error TS" | sort -u || true)
if [ "${1:-}" = "-v" ]; then echo "$out"; else echo "$out" | sed -E 's/\([0-9]+,[0-9]+\).*//' | sort | uniq -c | sort -rn; fi
echo "left: $(echo "$out" | grep -c "error TS")"
