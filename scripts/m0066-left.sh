#!/usr/bin/env bash
# 橋渡しの間だけ（M-0066。最後に消す）: 古い形（フックの第 1 引数・props の stage・場所を取る操作）の残りを、型の誤りとして数える。
# core/legacy.ts の切り替えを一時的に切って typecheck を流し、元に戻す。引数に -v を付けると誤りを全部出す（無ければファイルごとの数）
set -u
cd "$(dirname "$0")/.."
f=web/src/core/legacy.ts
trap 'sed -i "s/^export type LegacyOn = false$/export type LegacyOn = true/" "$f"' EXIT
sed -i 's/^export type LegacyOn = true$/export type LegacyOn = false/' "$f"
out=$(bun run typecheck 2>&1 | grep "error TS" || true)
if [ "${1:-}" = "-v" ]; then echo "$out"; else echo "$out" | sed -E 's/\([0-9]+,[0-9]+\).*//' | sort | uniq -c | sort -rn; fi
echo "left: $(echo "$out" | grep -c "error TS")"
