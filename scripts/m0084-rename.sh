#!/usr/bin/env bash
# M-0084 段 2: ブックのタイプの名前をページのタイプの名前に替える（何度流してもよい。main を取り込んだあとに流し直す）。
# 段 2 を main に入れるときに、このスクリプトは消す
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f web/src/core/def/book-type.ts ] && git mv web/src/core/def/book-type.ts web/src/core/def/page-type.ts
git grep -l -E '[bB]ookType|/book-type"' -- web test e2e internal clients \
  | xargs -r perl -pi -e 's/BookType/PageType/g; s/bookType/pageType/g; s{/book-type"}{/page-type"}g'
