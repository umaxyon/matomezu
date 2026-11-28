//go:build !e2e

package main

import (
	"github.com/umaxyon/matomezu/internal/firewall"
	"github.com/umaxyon/matomezu/internal/peer"
)

// dropWSLProxyForTest は、本番の実行ファイルでは何もしない（e2e の常駐で WSLプロキシを立てないのは、ビルドタグ e2e の testdrop_e2e.go）
func dropWSLProxyForTest(*peer.WSLProxyLaunch) {}

// dropFirewallForTest は、本番の実行ファイルでは何もしない（e2e の常駐で規則に触らないのは、ビルドタグ e2e の testdrop_e2e.go）
func dropFirewallForTest(*firewall.Rules) {}
