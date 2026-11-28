package server

// ホストどうしの入口: 利用者の設定「ほかのホストとつなぐ」が入のあいだ、全部の番地の 1 つのポートで TLS だけで待つ（画面の入口と AI の入口は 127.0.0.1 だけで待つ）。
// 鍵は保管庫フォルダのファイル（peer.LoadOrCreate）。ポートは初めて開いたときに空いている番号を取って保管庫に覚え、そのあとは覚えた番号でだけ開く
// （ほかに使われていれば開かずに port-in-use を見せる。利用者が足したファイアウォールの規則や、相手のホストが覚えた番号を黙って壊さないため）。
// 開け閉めは、設定を変えたアクションのあとと立ったときに、h.mu の外で行う（kickHostEntrance）。入口の様子（HostStatus）は窓に知らせる（host-status）。
// Windows では、利用者が Windows のファイアウォールで許可している間だけ開く（Firewall。許可するまで LAN で待たず、ダイアログを出さない）。
// 許可の様子は設定に持たず、規則を読んで決める（読むのに 2 秒ほどかかるので e.mu の外で）

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

	"github.com/umaxyon/matomezu/internal/firewall"
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
	// Firewall は、Windows のファイアウォールの規則を読み書きする物（Windows で直に動くときだけ。ほかは nil）。あれば、許可している間だけ開く
	Firewall firewall.Rules
	// IPv4 は、IPv4 だけで待つ（Windows で直に待つとき。規則は IPv4 の相手で絞るため）
	IPv4 bool
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
	Addrs      []string   `json:"addrs,omitempty"` // 待ち受けアドレスの番地（開いているときだけ）
	WSL        bool       `json:"wsl,omitempty"`
	Failed     HostFailed `json:"failed,omitempty"` // 開けなかった理由（開こうとして開けなかったときだけ）
	// WSLProxy は WSLプロキシの様子、WSLProxyAddrs は WSLプロキシの待ち受けアドレスの番地（立てる WSL で、入口が開いているときだけ）
	WSLProxy      peer.WSLProxyState `json:"wslProxy,omitempty"`
	WSLProxyAddrs []string           `json:"wslProxyAddrs,omitempty"`
	// Firewall は、ファイアウォールの規則の様子（Firewall を渡され、つなぐが入のときだけ）
	Firewall firewall.State `json:"firewall,omitempty"`
}

type hostEntrance struct {
	mu          sync.Mutex // 開け閉めの鍵（h.mu とは別。開け閉めのあいだ h.mu を持たない）
	config      HostConfig
	srv         *http.Server
	handler     http.Handler // srv が答える口（hostsHandler）。こちらが張ったリバース接続の上でも同じ物で答える
	ln          net.Listener // srv が受けている所
	status      HostStatus
	kick        chan struct{}
	done        chan struct{}  // CloseHostEntrance が閉じる（開け閉めの goroutine を止める）
	closed      bool           // CloseHostEntrance のあとは開かない
	peers       *peerState     // ペアリングとペアリングしたホストの様子（pairing.go）
	user        string         // mDNS で知らせている利用者名
	wslRestarts int            // WSLプロキシが終わって続けて立て直した回数（入口を開いたとき・［立て直す］・しばらく動いたあとで数え直す）
	wslRunning  time.Time      // WSLプロキシが最後に待ち始めた時刻
	fwMu        sync.Mutex     // 規則を変える操作を 1 つずつにする（UAC を重ねて出さない）
	fwFailed    bool           // 直前に許可しようとして（付け替えも）、規則がそろわなかった（常駐だけが持つ。次に許可・取り消しを試すまで）
	fwState     firewall.State // 最後に読んで決めた規則の様子（"" はまだ読んでいない）。開け閉めはこれを使い、読み直すのは要るときだけ
	fwReread    bool           // 次の開け閉めで規則を読み直す（画面がネットワークを開いたとき）
	fwGen       uint64         // 規則を変えるたびに進める。変える前に始めた読みが、変えたあとの様子を上書きしないため
	proto       atomic.Int64   // 常駐間通信プロトコルの版（peer.Protocol。版の違う常駐を組むテストだけが、閉じているあいだに替える。閉じたあとも、裏で頼む goroutine が読む）
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
	if s.Connect && e.config.Firewall != nil {
		e.refreshFirewall()
	}
	e.mu.Lock()
	if e.closed {
		e.mu.Unlock()
		return
	}
	was := e.status
	fw := firewall.State("")
	if s.Connect && e.config.Firewall != nil {
		fw = e.fwState
	} else {
		e.fwState = "" // つなぐを入れ直したら読み直す
	}
	e.status.Firewall = fw
	allowed := e.config.Firewall == nil || fw == firewall.Allowed
	name := s.Name
	if name == "" {
		name = e.config.OSHostName
	}
	e.status.Name = name
	renamed := was.Name != name || e.user != s.UserName
	e.user = s.UserName
	switch {
	case s.Connect && allowed && e.srv == nil:
		e.open(h)
	case (!s.Connect || !allowed) && e.srv != nil:
		e.srv.Close()
		e.srv, e.handler = nil, nil
		h.stopBeacon(e)
		go h.EndPairing()
		e.status.Open, e.status.Port, e.status.Addrs, e.status.Failed = false, 0, nil, ""
	case s.Connect && allowed && renamed:
		h.updateBeacon(e)
	case !s.Connect || !allowed:
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
	if e.config.Firewall != nil {
		return h.repickWithFirewall(e)
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

// repickWithFirewall は、Windows のファイアウォールの規則を空いている番号へ付け替え（UAC 1 回）、そろったらその番号を覚えて開く。
// そろわなければポートは変えず、許可が効かない様子にする
func (h *Hub) repickWithFirewall(e *hostEntrance) error {
	e.fwMu.Lock()
	defer e.fwMu.Unlock()
	e.mu.Lock()
	if e.closed || e.status.Failed != HostPortInUse {
		e.mu.Unlock()
		return errors.New("the kept port is not taken")
	}
	from := e.config.Port
	e.mu.Unlock()
	to, err := freePort()
	if err != nil {
		return err
	}
	moved := e.config.Firewall.Move(from, to)
	r, read := e.config.Firewall.Read()
	ok := moved == nil && read == nil && firewall.Decide(r, to, false) == firewall.Allowed
	e.mu.Lock()
	if ok {
		e.keepPort(to)
	}
	e.changedFirewall(!ok, r, read)
	e.mu.Unlock()
	h.kickHostEntrance()
	return nil
}

// SetFirewall は、Windows のファイアウォールで、入口のポートを許可するか取り消す（UAC 1 回。利用者が答えるまで返らない）。
// 許可して規則がそろわなければ、許可が効かない様子にする。取り消せなければ、読んだ規則のまま（許可のまま）
func (h *Hub) SetFirewall(allow bool) error {
	e := h.entrance.Load()
	if e == nil || e.config.Firewall == nil {
		return errors.New("there is no firewall to set")
	}
	e.fwMu.Lock()
	defer e.fwMu.Unlock()
	port, err := e.rulePort()
	if err != nil {
		return err
	}
	var done error
	if allow {
		done = e.config.Firewall.Allow(port)
	} else {
		done = e.config.Firewall.Deny(port)
	}
	if done != nil {
		fmt.Fprintln(os.Stderr, "hosts: could not change the firewall rules:", done)
	}
	r, read := e.config.Firewall.Read()
	failed := allow && (done != nil || read != nil || firewall.Decide(r, port, false) != firewall.Allowed)
	e.mu.Lock()
	e.changedFirewall(failed, r, read)
	e.mu.Unlock()
	h.kickHostEntrance()
	return nil
}

// changedFirewall は、規則を変えて読み直した結果を様子にする（e.mu を持って呼ぶ）。開け閉めは呼ぶ側が kick で頼む
func (e *hostEntrance) changedFirewall(failed bool, r firewall.Reading, read error) {
	e.fwFailed = failed
	e.fwGen++
	e.fwReread = false
	if read != nil {
		fmt.Fprintln(os.Stderr, "hosts: could not read the firewall rules:", read)
		e.fwState = firewall.Ineffective
		return
	}
	e.fwState = firewall.Decide(r, e.config.Port, failed)
}

// rereadFirewall は、次の開け閉めで規則を読み直すよう知らせる（待たない）
func (h *Hub) rereadFirewall() {
	e := h.entrance.Load()
	if e == nil || e.config.Firewall == nil {
		return
	}
	e.mu.Lock()
	e.fwReread = true
	e.mu.Unlock()
	h.kickHostEntrance()
}

// refreshFirewall は、まだ読んでいないか読み直しを頼まれていれば、規則を読んで様子を覚える（e.mu を持たずに呼ぶ。読むのに 1〜2 秒かかる）。
// 読むあいだに規則を変えたら（fwGen が進んだら）、読んだ物は捨てる
func (e *hostEntrance) refreshFirewall() {
	e.mu.Lock()
	need, gen := e.fwState == "" || e.fwReread, e.fwGen
	e.fwReread = false
	e.mu.Unlock()
	if !need {
		return
	}
	st := e.readFirewall()
	e.mu.Lock()
	if e.fwGen == gen {
		e.fwState = st
	}
	e.mu.Unlock()
}

// readFirewall は、規則を読んで、入口のポートについての様子を決める（e.mu を持たずに呼ぶ）。読めなければ効かない様子
func (e *hostEntrance) readFirewall() firewall.State {
	port, err := e.rulePort()
	if err != nil {
		fmt.Fprintln(os.Stderr, "hosts: could not pick a port:", err)
		return firewall.Ineffective
	}
	r, err := e.config.Firewall.Read()
	e.mu.Lock()
	failed := e.fwFailed
	e.mu.Unlock()
	if err != nil {
		fmt.Fprintln(os.Stderr, "hosts: could not read the firewall rules:", err)
		return firewall.Ineffective
	}
	return firewall.Decide(r, port, failed)
}

// rulePort は、規則を付ける入口のポート。まだ覚えていなければ、空いている番号を取って覚える（LAN で待つ前に規則を作るため。e.mu を持たずに呼ぶ）
func (e *hostEntrance) rulePort() (int, error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	if e.config.Port != 0 {
		return e.config.Port, nil
	}
	port, err := freePort()
	if err != nil {
		return 0, err
	}
	e.keepPort(port)
	return port, nil
}

// keepPort は、入口のポートを port にして覚える（e.mu を持って呼ぶ）
func (e *hostEntrance) keepPort(port int) {
	if e.config.SavePort != nil {
		if err := e.config.SavePort(port); err != nil {
			fmt.Fprintln(os.Stderr, "hosts: could not keep the port:", err)
		}
	}
	e.config.Port = port
}

// freePort は、空いているポートの番号（127.0.0.1 で取るので、LAN で待たず、ダイアログを出さない）
func freePort() (int, error) {
	ln, err := net.Listen("tcp4", "127.0.0.1:0")
	if err != nil {
		return 0, err
	}
	defer ln.Close()
	return ln.Addr().(*net.TCPAddr).Port, nil
}

// network は、入口が待つ網
func (e *hostEntrance) network() string {
	if e.config.IPv4 {
		return "tcp4"
	}
	return "tcp"
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
	ln, err := net.Listen(e.network(), net.JoinHostPort(bind, strconv.Itoa(e.config.Port)))
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
