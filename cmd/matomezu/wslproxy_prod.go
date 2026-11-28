//go:build !e2e

package main

import "github.com/umaxyon/matomezu/internal/peer"

// dropWSLProxyForTest は、本番の実行ファイルでは何もしない（e2e の常駐で WSLプロキシを立てないのは、ビルドタグ e2e の wslproxy_e2e.go）
func dropWSLProxyForTest(*peer.WSLProxyLaunch) {}
