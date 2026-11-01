//go:build !e2e

package server

import "net/http"

// routesForTest は、本番の実行ファイルでは何も足さない（テストの用意の HTTP のパスは、ビルドタグ e2e の books_for_test_e2e.go が足す）
func routesForTest(*http.ServeMux, Options) {}
