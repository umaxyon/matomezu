//go:build !embed

package web

import "io/fs"

// Embedded は埋め込んだ画面と、埋め込んであるか（このビルドでは埋め込まない）
func Embedded() (fs.FS, bool) {
	return nil, false
}
