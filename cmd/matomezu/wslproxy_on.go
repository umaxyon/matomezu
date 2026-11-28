//go:build !e2e

package main

// startsWSLProxy は、NAT の WSL で WSLプロキシを立てるか（e2e の常駐は立てない。Windows で待ち受けを開くと、ファイアウォールの確かめが出るため）
const startsWSLProxy = true
