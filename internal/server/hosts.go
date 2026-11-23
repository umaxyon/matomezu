package server

// ホストどうしの入口: 利用者の設定「ほかのホストとつなぐ」が入のあいだ、全部の番地の 1 つのポートで TLS だけで待つ（画面の入口と AI の入口は 127.0.0.1 だけで待つ）。
// 鍵は保管庫フォルダのファイル（peer.LoadOrCreate）。ポートは初めて開いたときに空いている番号を取って保管庫に覚え、そのあとは覚えた番号でだけ開く
// （ほかに使われていれば開かずに port-in-use を見せる。利用者が足したファイアウォールの規則や、相手のホストが覚えた番号を黙って壊さないため）。
// 開け閉めは、設定を変えたアクションのあとと立ったときに、h.mu の外で行う（kickHostEntrance）。入口の様子（HostStatus）は窓に知らせる（host-status）

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
	Port       int             // 覚えたポート（覚えていなければ 0）
	SavePort   func(int) error // 初めて取ったポートを覚える
	OSHostName string          // OS のホスト名（ホスト名の設定が無いときの名前）
	WSL        bool            // WSL で動いているか（画面が案内を出す）
}

// HostFailed は、入口を開こうとして開けなかった理由
type HostFailed string

const (
	HostPortInUse HostFailed = "port-in-use" // 覚えたポートがほかに使われている
	HostListen    HostFailed = "listen"      // そのほか（待てない・止まった）
)

// HostStatus は、ホストどうしの入口の様子（窓に見せる）
type HostStatus struct {
	HostID     string     `json:"hostId"`
	Name       string     `json:"name"`       // ホスト名（設定か、無ければ OS のホスト名）
	OSHostName string     `json:"osHostName"` // OS のホスト名（ホスト名の設定の項目が空のときに薄く見せる）
	Open       bool       `json:"open"`       // 入口が開いているか
	Port       int        `json:"port,omitempty"`
	Addrs      []string   `json:"addrs,omitempty"` // 待っている所の番地（開いているときだけ）
	WSL        bool       `json:"wsl,omitempty"`
	Failed     HostFailed `json:"failed,omitempty"` // 開けなかった理由（開こうとして開けなかったときだけ）
}

type hostEntrance struct {
	mu     sync.Mutex // 開け閉めの鍵（h.mu とは別。開け閉めのあいだ h.mu を持たない）
	config HostConfig
	srv    *http.Server
	ln     net.Listener // srv が受けている所
	status HostStatus
	kick   chan struct{}
	done   chan struct{} // CloseHostEntrance が閉じる（開け閉めの goroutine を止める）
	closed bool          // CloseHostEntrance のあとは開かない
}

// SetHostEntrance は、ホストどうしの入口の用意を渡し、設定に合わせて開け閉めし始める（立ったときに 1 度呼ぶ）
func (h *Hub) SetHostEntrance(c HostConfig) {
	e := &hostEntrance{config: c, kick: make(chan struct{}, 1), done: make(chan struct{})}
	e.status = HostStatus{HostID: c.Identity.HostID, Name: c.OSHostName, OSHostName: c.OSHostName, WSL: c.WSL}
	h.entrance.Store(e)
	go func() {
		for {
			select {
			case <-e.kick:
				h.applyHostEntrance(e)
			case <-e.done:
				return
			}
		}
	}()
	h.kickHostEntrance()
}

// kickHostEntrance は、設定に合わせて入口を開け閉めするよう知らせる（待たない。h.mu を持っていてもよい）
func (h *Hub) kickHostEntrance() {
	e := h.entrance.Load()
	if e == nil {
		return
	}
	select {
	case e.kick <- struct{}{}:
	default:
	}
}

// HostStatus は、今のホストどうしの入口の様子（SetHostEntrance の前は、ホスト id の無い物）
func (h *Hub) HostStatus() HostStatus {
	e := h.entrance.Load()
	if e == nil {
		return HostStatus{}
	}
	e.mu.Lock()
	defer e.mu.Unlock()
	return e.status
}

// CloseHostEntrance は、入口を閉じ、そのあとは開かない（常駐が止まるとき）
func (h *Hub) CloseHostEntrance() {
	e := h.entrance.Swap(nil)
	if e == nil {
		return
	}
	close(e.done)
	e.mu.Lock()
	defer e.mu.Unlock()
	e.closed = true
	if e.srv != nil {
		e.srv.Close()
		e.srv = nil
	}
}

// applyHostEntrance は、利用者の設定に合わせて入口を開け閉めし、様子が変われば窓に知らせる
func (h *Hub) applyHostEntrance(e *hostEntrance) {
	settings, _ := h.Data()
	s, err := h.engine.HostSettingsOf(settings)
	if err != nil {
		fmt.Fprintln(os.Stderr, "hosts: could not read the settings:", err)
		return
	}
	e.mu.Lock()
	if e.closed {
		e.mu.Unlock()
		return
	}
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
		e.status.Port, e.status.Failed = 0, ""
	}
	now := e.status
	e.mu.Unlock()
	h.tellHostStatus(was, now)
}

func (h *Hub) tellHostStatus(was, now HostStatus) {
	if sameHostStatus(was, now) {
		return
	}
	h.mu.Lock()
	h.broadcast("host-status", now)
	h.mu.Unlock()
}

// open は、覚えたポートで入口を開く。覚えていなければ空いている番号を取って覚える（e.mu を持って呼ぶ）
func (e *hostEntrance) open(h *Hub) {
	ln, err := net.Listen("tcp", ":"+strconv.Itoa(e.config.Port))
	if err != nil {
		fmt.Fprintln(os.Stderr, "hosts: could not open the entrance:", err)
		e.status.Open, e.status.Addrs, e.status.Failed = false, nil, HostListen
		if e.config.Port != 0 {
			e.status.Port, e.status.Failed = e.config.Port, HostPortInUse
		}
		return
	}
	port := ln.Addr().(*net.TCPAddr).Port
	if e.config.Port == 0 && e.config.SavePort != nil {
		if err := e.config.SavePort(port); err != nil {
			fmt.Fprintln(os.Stderr, "hosts: could not keep the port:", err)
		} else {
			e.config.Port = port
		}
	}
	srv := peer.Server(e.config.Identity, h.hostsHandler())
	e.srv, e.ln = srv, ln
	go func() {
		err := srv.ServeTLS(ln, "", "")
		if err == nil || errors.Is(err, http.ErrServerClosed) {
			return
		}
		fmt.Fprintln(os.Stderr, "hosts: the entrance stopped:", err)
		h.stoppedHostEntrance(e, srv)
	}()
	e.status.Open, e.status.Port, e.status.Addrs, e.status.Failed = true, port, peer.ReachableAddrs(), ""
}

// stoppedHostEntrance は、入口の srv が自分で止まったとき（閉じたのでなく）、開いていない様子にして窓に知らせる。つなぐを入れ直せば開き直す
func (h *Hub) stoppedHostEntrance(e *hostEntrance, srv *http.Server) {
	e.mu.Lock()
	if e.srv != srv {
		e.mu.Unlock()
		return
	}
	was := e.status
	e.srv = nil
	e.status.Open, e.status.Addrs, e.status.Failed = false, nil, HostListen
	now := e.status
	e.mu.Unlock()
	h.tellHostStatus(was, now)
}

func sameHostStatus(a, b HostStatus) bool {
	x, _ := json.Marshal(a)
	y, _ := json.Marshal(b)
	return string(x) == string(y)
}
