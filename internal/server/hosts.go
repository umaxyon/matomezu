package server

// ホストどうしの入口: 利用者の設定「ほかのホストとつなぐ」が入のあいだ、LAN の全部の番地の 1 つのポートで TLS だけで待つ（画面の入口と AI の入口は 127.0.0.1 のまま）。
// 鍵は保管庫フォルダのファイル（peer.LoadOrCreate）、ポートは初めて開いたときに空いている番号を取って保管庫に覚える（取られていたら取り直して覚え直す）。
// 開け閉めは、設定を変えたアクションのあとと立ったときに、h.mu の外で行う（hostsKick）。入口の様子（HostStatus）は窓に知らせる（host-status）

import (
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"os"
	"strconv"
	"sync"

	"github.com/umaxyon/matomezu/internal/peer"
)

// HostConfig は、ホストどうしの入口を開くのに要る物（cmd/matomezu が保管庫フォルダから組んで渡す）
type HostConfig struct {
	Identity   *peer.Identity
	Port       int                                     // 覚えたポート（覚えていなければ 0）
	SavePort   func(int) error                         // 取ったポートを覚える
	OSHostName string                                  // OS のホスト名（ホスト名の設定が無いときの名前）
	WSL        bool                                    // WSL で動いているか（画面が案内を出す）
	Listen     func(addr string) (net.Listener, error) // 無ければ net.Listen("tcp", addr)。テストが 127.0.0.1 で待たせるのに使う
	Bind       string                                  // 待つ番地（無ければ全部の番地）
}

// HostStatus は、ホストどうしの入口の様子（窓に見せる）
type HostStatus struct {
	HostID     string   `json:"hostId"`
	Name       string   `json:"name"`       // ホスト名（設定か、無ければ OS のホスト名）
	OSHostName string   `json:"osHostName"` // OS のホスト名（ホスト名の設定の項目が空のときに薄く見せる）
	Open       bool     `json:"open"`       // 入口が開いているか
	Port       int      `json:"port,omitempty"`
	Addrs      []string `json:"addrs,omitempty"` // 待っている所の番地（開いているときだけ）
	WSL        bool     `json:"wsl,omitempty"`
	Failed     string   `json:"failed,omitempty"` // 開けなかった理由（開こうとして開けなかったときだけ）
}

type hostEntry struct {
	mu     sync.Mutex // 開け閉めの鍵（h.mu とは別。開け閉めのあいだ h.mu を持たない）
	config HostConfig
	srv    *http.Server
	status HostStatus
	kick   chan struct{}
}

// SetHost は、ホストどうしの入口の用意を渡し、設定に合わせて開け閉めし始める（立ったときに 1 度呼ぶ）
func (h *Hub) SetHost(c HostConfig) {
	e := &hostEntry{config: c, kick: make(chan struct{}, 1)}
	e.status = HostStatus{HostID: c.Identity.HostID, Name: c.OSHostName, OSHostName: c.OSHostName, WSL: c.WSL}
	h.hosts.Store(e)
	go func() {
		for range e.kick {
			h.applyHosts(e)
		}
	}()
	h.kickHosts()
}

// kickHosts は、設定に合わせて入口を開け閉めするよう知らせる（待たない。h.mu を持っていてもよい）
func (h *Hub) kickHosts() {
	e := h.hosts.Load()
	if e == nil {
		return
	}
	select {
	case e.kick <- struct{}{}:
	default:
	}
}

// HostStatus は、今のホストどうしの入口の様子（SetHost の前は、ホスト id の無い物）
func (h *Hub) HostStatus() HostStatus {
	e := h.hosts.Load()
	if e == nil {
		return HostStatus{}
	}
	e.mu.Lock()
	defer e.mu.Unlock()
	return e.status
}

// CloseHosts は、入口を閉じる（常駐が止まるとき）
func (h *Hub) CloseHosts() {
	e := h.hosts.Load()
	if e == nil {
		return
	}
	e.mu.Lock()
	defer e.mu.Unlock()
	if e.srv != nil {
		e.srv.Close()
		e.srv = nil
	}
}

// applyHosts は、利用者の設定に合わせて入口を開け閉めし、様子が変われば窓に知らせる
func (h *Hub) applyHosts(e *hostEntry) {
	settings, _ := h.Data()
	s, err := h.engine.HostSettingsOf(settings)
	if err != nil {
		fmt.Fprintln(os.Stderr, "hosts: could not read the settings:", err)
		return
	}
	e.mu.Lock()
	was := e.status
	name := s.Name
	if name == "" {
		name = e.config.OSHostName
	}
	e.status.Name = name
	switch {
	case s.Connect && e.srv == nil:
		e.open(h)
	case !s.Connect && e.srv != nil:
		e.srv.Close()
		e.srv = nil
		e.status.Open, e.status.Port, e.status.Addrs, e.status.Failed = false, 0, nil, ""
	case !s.Connect:
		e.status.Failed = ""
	}
	now := e.status
	e.mu.Unlock()
	if !sameHostStatus(was, now) {
		h.mu.Lock()
		h.broadcast("host-status", now)
		h.mu.Unlock()
	}
}

// open は、覚えたポートで入口を開く。覚えていないか取られていれば、空いている番号を取って覚え直す（e.mu を持って呼ぶ）
func (e *hostEntry) open(h *Hub) {
	listen := e.config.Listen
	if listen == nil {
		listen = func(addr string) (net.Listener, error) { return net.Listen("tcp", addr) }
	}
	ln, err := net.Listener(nil), errors.New("no port")
	if e.config.Port != 0 {
		ln, err = listen(net.JoinHostPort(e.config.Bind, strconv.Itoa(e.config.Port)))
	}
	if err != nil {
		ln, err = listen(net.JoinHostPort(e.config.Bind, "0"))
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, "hosts: could not open the entrance:", err)
		e.status.Open, e.status.Failed = false, "listen"
		return
	}
	port := ln.Addr().(*net.TCPAddr).Port
	if port != e.config.Port && e.config.SavePort != nil {
		if err := e.config.SavePort(port); err != nil {
			fmt.Fprintln(os.Stderr, "hosts: could not keep the port:", err)
		} else {
			e.config.Port = port
		}
	}
	e.srv = peer.Server(e.config.Identity, h.hostsHandler())
	go func(srv *http.Server) {
		if err := srv.ServeTLS(ln, "", ""); err != nil && !errors.Is(err, http.ErrServerClosed) {
			fmt.Fprintln(os.Stderr, "hosts: the entrance stopped:", err)
		}
	}(e.srv)
	addrs := []string{e.config.Bind}
	if e.config.Bind == "" {
		addrs = peer.LANAddrs()
	}
	e.status.Open, e.status.Port, e.status.Addrs, e.status.Failed = true, port, addrs, ""
}

func sameHostStatus(a, b HostStatus) bool {
	x, _ := json.Marshal(a)
	y, _ := json.Marshal(b)
	return string(x) == string(y)
}
