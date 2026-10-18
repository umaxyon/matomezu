// Package web は画面のファイルを実行ファイルに埋め込む。
// dist/ は bun run build で作る。無いと go build が失敗する。
// fonts/ は同梱のフォント（Noto Sans JP。SIL OFL 1.1。どの画面でも同じフォントで描いて測る。D44 の 4.2）
package web

import "embed"

//go:embed index.html dist fonts
var FS embed.FS
