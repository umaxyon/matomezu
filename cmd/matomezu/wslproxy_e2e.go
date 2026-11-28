//go:build e2e

package main

import "github.com/umaxyon/matomezu/internal/peer"

// dropWSLProxyForTest は、e2e の常駐では WSLプロキシを立てない（Windows で待ち受けを開くと、ファイアウォールの確かめが出るため）
func dropWSLProxyForTest(l *peer.WSLProxyLaunch) { *l = nil }
