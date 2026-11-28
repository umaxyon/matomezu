package main

import (
	"fmt"
	"os"

	"github.com/umaxyon/matomezu/internal/firewall"
	"github.com/umaxyon/matomezu/internal/home"
	"github.com/umaxyon/matomezu/internal/peer"
	"github.com/umaxyon/matomezu/internal/server"
)

// setHost は、保管庫フォルダのホストの鍵（無ければ作る）と覚えたポートで、ホストどうしの入口を用意する（開くかは利用者の設定で常駐が決める）
func setHost(hub *server.Hub, h *home.Home) error {
	id, err := peer.LoadOrCreate(h.HostKeyPath())
	if err != nil {
		return err
	}
	port, err := h.ReadHostPort()
	if err != nil {
		return err
	}
	name, _ := os.Hostname()
	wsl := onWSL()
	proxy := wslProxyFor(wsl)
	dropWSLProxyForTest(&proxy)
	fw := firewall.ForThisOS()
	dropFirewallForTest(&fw)
	hub.SetHostEntrance(server.HostConfig{Identity: id, Port: port, SavePort: h.WriteHostPort, OSHostName: name, WSL: wsl, Discover: true, WSLProxy: proxy, Firewall: fw, IPv4: fw != nil})
	return nil
}

// wslProxyFor は、WSLプロキシを立てる物（NAT の WSL のときだけ。ほかは nil）
func wslProxyFor(wsl bool) peer.WSLProxyLaunch {
	if !wsl {
		return nil
	}
	mode, err := wslNetworkingMode()
	if err != nil {
		fmt.Fprintln(os.Stderr, "hosts: the WSL proxy is not used:", err)
		return nil
	}
	if mode != "nat" {
		return nil
	}
	return launchWSLProxy
}
