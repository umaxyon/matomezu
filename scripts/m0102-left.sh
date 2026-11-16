#!/usr/bin/env bash
# M-0102 の残りを数える（0 になるまで書き換える。main に入れる前に、このファイルは消す）。
#   1 typecheck の誤り
#   2 ページの中身を変えるのに、ブックが対象のままのアクション（アクションの許可スコープが { page: … } のまま。page-remove は並びを変えるので数えない）
#   3 ブックの全部を見て id を振る形（…OfBook）を、ページが対象のアクションの側で使っている所
#     （ページを作る・写すアクションの page-add・page-duplicate・binder-duplicate と、その下の関数だけが使ってよい）
#   4 ブックとページの id を受ける形のまま残っている、ページの中身を変える関数（findPage でページを探し、putPage か withPage で戻す形）
set -u
cd "$(dirname "$0")/.."
types=$(bun run typecheck 2>&1 | grep -c "error TS")
# コマンドの許可スコープ（defineCommand の中の { page: … }）は数えない（行うアクションの宛先とは別の宣言）
actionScopes() {
  grep -rln "permissionScope: { page:" web/src test/added-plugins --include=*.ts --include=*.tsx | grep -v "page-tabs/page-remove.ts" |
    xargs awk '/define(Action|Command)\(/ { kind = ($0 ~ /defineAction/) ? "a" : "c" } /permissionScope: \{ page:/ && kind == "a" { print FILENAME ":" FNR ": " $0 }'
}
scopes=$(actionScopes | wc -l)
ids=$(grep -rnE "\b(contentIdMakerOfBook|renewedIdsOfBook|nextItemIdOfBook)\b" web/src test --include=*.ts --include=*.tsx \
  | grep -vE "plugins/base/utils/(ids|index)\.ts|page-tabs/(page-duplicate|binders|page-fields|page-add)\.ts|test/core/ids\.test\.ts|test/plugin-api\.test\.ts" | wc -l)
helpers=$(grep -rnE "\bwithPage\(" web/src --include=*.ts --include=*.tsx | grep -v "export function withPage" | wc -l)
echo "typecheck: $types"
echo "book-target page actions: $scopes"
echo "book-wide id helpers on the page side: $ids"
echo "withPage callers: $helpers"
echo "left: $((types + scopes + ids + helpers))"
if [ "${1:-}" = "-v" ]; then
  actionScopes | cut -c1-140
fi
