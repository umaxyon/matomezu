//go:build e2e

package server

import "net/http"

// withRoutesForTest は、h をそのまま返す（ビルドタグ e2e では、Handler がテストの用意の HTTP のパスを足している）
func withRoutesForTest(h http.Handler, _ Options) http.Handler { return h }
