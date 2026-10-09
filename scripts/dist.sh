#!/usr/bin/env bash
# 試しに配る実行ファイルを OS と CPU ごとに作る（公開はしない）。
#
#   scripts/dist.sh [出力先]        既定は dist/
#
# 出力先/<os>-<arch>/ に実行ファイルとサンプルの図を置く。フォルダごと持っていけば、
# 相手の環境に Go や bun が無くても `matomezu open three-levels.json` で動く。
# 画面（web/dist）は実行ファイルに埋め込まれるので、先に bun run build を流す。
set -euo pipefail

cd "$(dirname "$0")/.."
out="${1:-dist}"
version="0.0.0-$(git describe --always --dirty)"
# コミットしていない変更があれば、作り直すたびに版を変える（同じ版だと常駐サーバーが入れ替わらない）
[[ "$version" == *-dirty ]] && version="$version.$(date +%Y%m%d%H%M%S)"

targets=(
  windows/amd64
  windows/arm64
  darwin/arm64
  darwin/amd64
  linux/amd64
  linux/arm64
)

bun run build >/dev/null

for t in "${targets[@]}"; do
  os="${t%/*}"
  arch="${t#*/}"
  dir="$out/$os-$arch"
  exe="matomezu"
  [[ "$os" == windows ]] && exe="matomezu.exe"
  rm -rf "$dir"
  mkdir -p "$dir"
  CGO_ENABLED=0 GOOS="$os" GOARCH="$arch" \
    go build -trimpath -ldflags "-s -w -X main.version=$version" -o "$dir/$exe" ./cmd/matomezu
  cp examples/*.json "$dir/"
  echo "$dir/$exe"
done

echo "version: $version"
