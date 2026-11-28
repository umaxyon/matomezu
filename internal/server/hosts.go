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
	"sync/atomic"
	"time"

	"github.com/umaxyon/matomezu/internal/peer"
)

// HostConfig は、ホストどうしの入口を開くのに要る物（cmd/matomezu が保管庫フォルダから組んで渡す）
type HostConfig struct {
	Identity   *peer.Identity
	Port       int             // 覚えたポート（覚えていなければ 0）
	SavePort   func(int) error // 初めて取ったポートを覚える
	OSHostName string          // OS のホスト名（ホスト名の設定が無いときの名前）
	WSL        bool            // WSL で動いているか（画面が案内を出す）
	Discover   bool            // 入口を開いているあいだ mDNS で知らせ、見つける（テストは同じ網に出さないよう切る）
	Loopback   bool            // 127.0.0.1 だけで待つ（テストは同じ網に出さないよう付ける）
	// WSLProxy は、入口を開いたときに WSLプロキシを立てる物（NAT の WSL のときだけ。ほかは nil）。立てたら、mDNS は WSLプロキシごしにする
	WSLProxy peer.WSLProxyLaunch
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
	// WSLProxy は WSLプロキシの様子、WSLProxyAddrs は WSLプロキシの待っている所の番地（立てる WSL で、入口が開いているときだけ）
	WSLProxy      peer.WSLProxyState `json:"wslProxy,omitempty"`
	WSLProxyAddrs []string           `json:"wslProxyAddrs,omitempty"`
}

type hostEntrance struct {
	mu          sync.Mutex // 開け閉めの鍵（h.mu とは別。開け閉めのあいだ h.mu を持たない）
	config      HostConfig
	srv         *http.Server
	handler     http.Handler // srv が答える口（hostsHandler）。こちらが張ったリバース接続の上でも同じ物で答える
	ln          net.Listener // srv が受けている所
	status      HostStatus
	kick        chan struct{}
	done        chan struct{} // CloseHostEntrance が閉じる（開け閉めの goroutine を止める）
	closed      bool          // CloseHostEntrance のあとは開かない
	peers       *peerState    // ペアリングとペアリングしたホストの様子（pairing.go）
	user        string        // mDNS で知らせている利用者名
	wslRestarts int           // WSLプロキシが終わって続けて立て直した回数（入口を開いたとき・［立て直す］・しばらく動いたあとで数え直す）
	wslRunning  time.Time     // WSLプロキシが最後に待ち始めた時刻
	proto       atomic.Int64  // 常駐間通信プロトコルの版（peer.Protocol。版の違う常駐を組むテストだけが、閉じているあいだに替える。閉じたあとも、裏で頼む goroutine が読む）
}

// SetHostEntrance は、ホストどうしの入口の用意を渡し、設定に合わせて開け閉めし始める（立ったときに 1 度呼ぶ）
func (h *Hub) SetHostEntrance(c HostConfig) {
	e := &hostEntrance{config: c, kick: make(chan struct{}, 1), done: make(chan struct{}), peers: newPeerState()}
	e.proto.Store(int64(peer.Protocol))
	e.status = HostStatus{HostID: c.Identity.HostID, Name: c.OSHostName, OSHostName: c.OSHostName, WSL: c.WSL}
	h.entrance.Store(e)
	// 起動し直す前の受け入れ待ちの頼みは、待っているつなぎがもう無いので消す
	for _, r := range h.pairingRequestRecords() {
		h.dropPairingRequest(r.ID)
	}
	h.followPeers(e)
	go h.followRooms(e)
	h.kickRooms()
	go func() {
		for {
			select {
			case <-e.kick:
				h.applyHostEntrance(e)
			case <-e.peers.kick:
				h.followPeers(e)
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

// selfHostID は、このホストのホスト id（SetHostEntrance の前は空）。鍵は立ったあと変わらないので、どの鍵も持たずに読める（h.mu を持っていてもよい）
func (h *Hub) selfHostID() string {
	if e := h.entrance.Load(); e != nil {
		return e.config.Identity.HostID
	}
	return ""
}

// CloseHostEntrance は、入口を閉じ、そのあとは開かない（常駐が止まるとき）
func (h *Hub) CloseHostEntrance() {
	e := h.entrance.Swap(nil)
	if e == nil {
		return
	}
	close(e.done)
	e.peers.mu.Lock()
	if e.peers.cancel != nil {
		e.peers.cancel()
	}
	e.peers.scheduleLapseLocked(h, time.Time{}) // 止まる常駐の一覧は作り直さない
	e.peers.mu.Unlock()
	e.mu.Lock()
	defer e.mu.Unlock()
	e.closed = true
	if e.srv != nil {
		e.srv.Close()
		e.srv, e.handler = nil, nil
	}
	h.stopBeacon(e)
	h.closeReverse(e)
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
	renamed := was.Name != name || e.user != s.UserName
	e.user = s.UserName
	switch {
	case s.Connect && e.srv == nil:
		e.open(h)
	case !s.Connect && e.srv != nil:
		e.srv.Close()
		e.srv, e.handler = nil, nil
		h.stopBeacon(e)
		go h.EndPairing()
		e.status.Open, e.status.Port, e.status.Addrs, e.status.Failed = false, 0, nil, ""
	case s.Connect && renamed:
		h.updateBeacon(e)
	case !s.Connect:
		e.status.Port, e.status.Failed = 0, ""
	}
	now := e.status
	e.mu.Unlock()
	h.tellHostStatus(was, now)
	if was.Open != now.Open {
		h.followReverse(e)
	}
}

// RepickHostPort は、覚えたポートがほかに使われているとき（このホストでも、WSLプロキシの待つ Windows でも）、空いている番号を取り直して開き、
// その番号を覚える（利用者が［別のポートにする］を確かめたとき）。WSLプロキシも、取り直した番号で立て直す
func (h *Hub) RepickHostPort() error {
	e := h.entrance.Load()
	if e == nil {
		return errors.New("there is no entrance for other hosts")
	}
	e.mu.Lock()
	if e.closed || (e.status.Failed != HostPortInUse && e.status.WSLProxy != peer.WSLProxyPortInUse) {
		e.mu.Unlock()
		return errors.New("the kept port is not taken")
	}
	was := e.status
	if e.srv != nil {
		e.srv.Close()
		e.srv, e.handler = nil, nil
		h.stopBeacon(e)
	}
	e.config.Port = 0
	e.open(h)
	now := e.status
	e.mu.Unlock()
	h.tellHostStatus(was, now)
	h.followReverse(e)
	return nil
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
	bind := ""
	if e.config.Loopback {
		bind = "127.0.0.1"
	}
	ln, err := net.Listen("tcp", net.JoinHostPort(bind, strconv.Itoa(e.config.Port)))
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
	handler := h.hostsHandler(int(e.proto.Load()))
	srv := peer.Server(e.config.Identity, handler)
	e.srv, e.handler, e.ln = srv, handler, ln
	go func() {
		err := srv.ServeTLS(ln, "", "")
		if err == nil || errors.Is(err, http.ErrServerClosed) {
			return
		}
		fmt.Fprintln(os.Stderr, "hosts: the entrance stopped:", err)
		h.stoppedHostEntrance(e, srv)
	}()
	e.status.Open, e.status.Port, e.status.Addrs, e.status.Failed = true, port, peer.ReachableAddrs(), ""
	e.wslRestarts, e.wslRunning = 0, time.Time{}
	h.startBeacon(e, port, srv)
}

// stoppedHostEntrance は、入口の srv が自分で止まったとき（閉じたのでなく）、開いていない様子にして窓に知らせる。つなぐを入れ直せば開き直す
func (h *Hub) stoppedHostEntrance(e *hostEntrance, srv *http.Server) {
	e.mu.Lock()
	if e.srv != srv {
		e.mu.Unlock()
		return
	}
	was := e.status
	e.srv, e.handler = nil, nil
	h.stopBeacon(e)
	e.status.Open, e.status.Addrs, e.status.Failed = false, nil, HostListen
	now := e.status
	e.mu.Unlock()
	h.tellHostStatus(was, now)
	h.followReverse(e)
}

func sameHostStatus(a, b HostStatus) bool {
	x, _ := json.Marshal(a)
	y, _ := json.Marshal(b)
	return string(x) == string(y)
}
