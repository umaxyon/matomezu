// Package web は画面のファイルを実行ファイルに埋め込む。
// dist/ は bun run build で作る。無いと go build が失敗する。
package web

import "embed"

//go:embed index.html dist
var FS embed.FS
