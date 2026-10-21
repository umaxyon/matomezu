//go:build embed

// Package web は、実行ファイルに埋め込む画面（ビルドした dist）。埋め込むのは -tags embed のビルドだけで、
// ふつうのビルドでは埋め込まず、常駐は --web のフォルダから配る（dist が無くてもビルドできる）
package web

import (
	"embed"
	"io/fs"
)

//go:embed all:dist
var dist embed.FS

// Embedded は埋め込んだ画面と、埋め込んであるか
func Embedded() (fs.FS, bool) {
	sub, err := fs.Sub(dist, "dist")
	if err != nil {
		panic(err)
	}
	return sub, true
}
