#!/usr/bin/env bash
# 単体テスト（bun test）を並列で流す。配置に関係するファイルを変えていなければ、重い配置のテスト
# （test/layout-random-*.test.ts。ランダムな操作で崩れないか）を飛ばす（2026-10-18 ユーザー）。
#
#   scripts/test-auto.sh [基準]     基準（既定は HEAD）からの変更と、まだ git に無いファイルで決める
#
# 配置に関係するファイル（LAYOUT）を足したら、ここに書き足す
set -euo pipefail
cd "$(dirname "$0")/.."

base="${1:-HEAD}"
LAYOUT='^(web/src/layout/|web/src/graph[^/]*\.ts$|web/src/(render|model|shapes|theme|edits|interaction|resizers|history|validate)\.ts$|test/(random-ops|helpers)\.ts$|test/fixtures/|test/layout-random-)'

changed="$( { git diff --name-only "$base"; git ls-files --others --exclude-standard; } | sort -u )"
if grep -qE "$LAYOUT" <<<"$changed"; then
  echo "配置に関係する変更あり: 全部流す" >&2
  exec bun test --parallel
fi
echo "配置に関係する変更なし: test/layout-random-*.test.ts を飛ばす" >&2
exec bun test --parallel --path-ignore-patterns='test/layout-random-*.test.ts'
