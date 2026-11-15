#!/bin/sh
# Codex のプラグインの MCP: matomezu の MCP を標準入出力で出し、起こす知らせを Codex の会話に渡す watch も中で動かす（渡すコマンドは matomezu deliver codex。
# Codex には裏で動かし続ける仕組みが無く、MCP のプロセスは入力を待つ間も生きているため）。フックと同じ matomezu を呼ぶ（find-matomezu.sh）。
# 開発のとき（matomezu のリポジトリ）は、開発の画面を配る web/dist と、開発の常駐の待ち受け（5300）を渡す。matomezu が見つからないときは、その旨を標準エラーに出して終える
. "$(dirname "$0")/find-matomezu.sh"
if [ -z "$matomezu_bin" ]; then
  echo "matomezu was not found (neither the repository's .dev-home nor PATH)" >&2
  exit 1
fi
if [ -n "$matomezu_dev_root" ]; then
  if [ -d "$matomezu_dev_root/web/dist" ]; then
    exec "$matomezu_bin" mcp --web "$matomezu_dev_root/web/dist" --addr 127.0.0.1:5300 -- "$matomezu_bin" deliver codex
  fi
  exec "$matomezu_bin" mcp --addr 127.0.0.1:5300 -- "$matomezu_bin" deliver codex
fi
exec "$matomezu_bin" mcp -- "$matomezu_bin" deliver codex
