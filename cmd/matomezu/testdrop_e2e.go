//go:build e2e

package main

import (
	"github.com/umaxyon/matomezu/internal/firewall"
	"github.com/umaxyon/matomezu/internal/peer"
)

// dropWSLProxyForTest は、e2e の常駐では WSLプロキシを立てない（Windows で待ち受けを開くと、ファイアウォールの確かめが出るため）
func dropWSLProxyForTest(l *peer.WSLProxyLaunch) { *l = nil }

// dropFirewallForTest は、e2e の常駐では Windows のファイアウォールの規則に触らない（UAC が出て、利用者の PC の規則が変わるため）
func dropFirewallForTest(f *firewall.Rules) { *f = nil }
