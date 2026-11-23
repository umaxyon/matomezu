package main

import (
	"os"

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
	hub.SetHostEntrance(server.HostConfig{Identity: id, Port: port, SavePort: h.WriteHostPort, OSHostName: name, WSL: onWSL()})
	return nil
}
