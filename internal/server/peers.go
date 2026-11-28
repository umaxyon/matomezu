package server

// ペアリングしたホストとつながっているかの確かめ（Pinned の hello の口）と、相手がペアリングを解いた知らせ（Pinned の unpair の口）、mDNS の見つけ。
// 確かめるきっかけは、リバース接続が張れたとき（peer_reverse.go）・mDNS でそのホストが見えたとき・窓が確かめを頼んだとき（コントロールセンターの「ほかのホスト」を出したとき）。
// 間を置くのは切れたリバース接続を張り直すことだけで、hello を間を置いて頼むことはしない

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/umaxyon/matomezu/internal/peer"
)

// peerHello は、hello の口の答え: ホスト名・利用者名・待ち受けアドレスのポート（常駐間通信プロトコルの版は、包みが見出しで確かめる）
type peerHello struct {
	Name     string `json:"name"`
	UserName string `json:"userName"`
	Port     int    `json:"port"`
}

// 頼んだ側は、自分の待っているポートを port に載せる。こちらは、頼みの来た番地とそのポートを、相手へつなぐ所として覚える
// （受け入れた側は相手の待ち受けアドレスを利用者から聞かないので、相手の確かめで知る。相手の IP が変わっても追える）
func (h *Hub) peerHello(w http.ResponseWriter, r *http.Request) {
	s := h.HostStatus()
	if e := h.entrance.Load(); e != nil {
		if from, ok := peer.RequestHost(r); ok {
			addr := ""
			if port, err := strconv.Atoi(r.URL.Query().Get("port")); err == nil && port > 0 && port <= 65535 {
				if ip, _, err := net.SplitHostPort(r.RemoteAddr); err == nil {
					addr = net.JoinHostPort(ip, strconv.Itoa(port))
				}
			}
			h.sawPeer(e.peers, from, addr, "", "")
		}
	}
	writeJSON(w, peerHello{Name: s.Name, UserName: h.userName(), Port: s.Port})
}

// peerUnpair は、相手がペアリングを解いた知らせ: こちらの側も消す（相手には知らせ返さない）
func (h *Hub) peerUnpair(w http.ResponseWriter, r *http.Request) {
	from, _ := peer.RequestHost(r)
	if e := h.entrance.Load(); e != nil {
		h.dropPairedHost(e.peers, from, "because it unpaired")
	}
	w.WriteHeader(http.StatusNoContent)
}

// CheckPeers は、ペアリングしたホストみなとつながっているかを確かめ始める（待たない）。
// Windows のファイアウォールの規則も読み直す（利用者が Windows の設定画面で変えたかもしれないので、画面がネットワークを開いたとき）
func (h *Hub) CheckPeers() {
	h.rereadFirewall()
	e := h.entrance.Load()
	if e == nil || !h.HostStatus().Open {
		return
	}
	for _, r := range h.pairedHostRecords() {
		go h.checkPeer(e, r, "")
	}
}

// Discover は、mDNS で今すぐ問う（「ホストをつなぐ」のダイアログを開いたとき）
func (h *Hub) Discover() {
	e := h.entrance.Load()
	if e == nil {
		return
	}
	e.peers.mu.Lock()
	b := e.peers.beacon
	e.peers.mu.Unlock()
	if b != nil {
		b.Query()
	}
}

// checkPeer は、ペアリングしたホスト r の hello の口に、固定した鍵で頼み、様子を直して窓に知らせる。addr が空なら peerTarget で決めた先へ、
// 空でなければ（mDNS で見えた所）その所へ直に頼む。直に答えたときだけ、待ち受けアドレスを書き直す。相手が「ペアリングしていない」と答えたら、こちらも消す。
// 常駐間通信プロトコルの版が合わなければ、どちらを更新すれば合うかを様子に書く
func (h *Hub) checkPeer(e *hostEntrance, r pairedHostRecord, addr string) {
	var c *http.Client
	base := "https://" + addr
	direct := addr != ""
	if direct {
		c = peerClient(e, r.HostID)
	} else {
		var ok bool
		if c, base, ok = h.peerTarget(e, r.HostID); !ok {
			return
		}
		direct = base != reverseBase
		addr = strings.TrimPrefix(base, "https://")
	}
	resp, err := c.Get(base + "/peer/v1/hello?port=" + strconv.Itoa(h.HostStatus().Port))
	var hello peerHello
	if err == nil {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		resp.Body.Close()
		if resp.StatusCode != http.StatusOK || json.Unmarshal(body, &hello) != nil {
			err = fmt.Errorf("hello answered %d", resp.StatusCode)
		}
	}
	if errors.Is(err, peer.ErrNotPaired) {
		h.dropPairedHost(e.peers, r.HostID, "because it answered that it is not paired")
		return
	}
	ps := e.peers
	ps.mu.Lock()
	if _, still := ps.known[r.HostID]; !still {
		ps.mu.Unlock()
		return
	}
	l := ps.live[r.HostID]
	if l == nil {
		l = newPeerLive(r.HostID)
		ps.live[r.HostID] = l
	}
	switch {
	case err == nil:
		l.State, l.LastSeen, l.Name, l.UserName = PeerConnected, stamp(), hello.Name, hello.UserName
		if host, _, splitErr := net.SplitHostPort(addr); direct && splitErr == nil && hello.Port > 0 {
			l.Addr = net.JoinHostPort(host, strconv.Itoa(hello.Port))
		}
	case ps.linkedLocked(r.HostID) && direct:
		// 直に届かなくても、相手が張った接続でつながっている
	default:
		l.State = stateOfError(err)
		delete(ps.copies, r.HostID)
	}
	ps.mu.Unlock()
	h.tellPeers()
	if err == nil {
		h.refetchRooms(e, r.HostID)
	}
}

// stateOfError は、ペアリングしたホストへの頼みの失敗 err をつながりの様子にする
func stateOfError(err error) PeerState {
	var pm peer.ProtocolMismatchError
	switch {
	case errors.Is(err, peer.ErrKeyMismatch):
		return PeerKeyMismatch
	case errors.As(err, &pm):
		return protocolState(pm)
	}
	return PeerUnreachable
}

// sighted は、mDNS でほかのホストの知らせが届いたとき: ペアリングしたホストなら、知らせた所で確かめ直す（IP が変わっても、鍵で確かめて書き直す）
func (h *Hub) sighted(e *hostEntrance, s peer.Sighting, gone bool) {
	ps := e.peers
	ps.mu.Lock()
	r, paired := ps.known[s.HostID]
	if paired && gone {
		if l := ps.live[s.HostID]; l != nil {
			l.State = PeerUnreachable
		}
		delete(ps.copies, s.HostID)
	}
	ps.mu.Unlock()
	if paired && !gone {
		go h.checkPeer(e, r, net.JoinHostPort(s.Addr, strconv.Itoa(s.Port)))
		return
	}
	h.tellPeers()
}

// hostBeacon は、mDNS で自分を知らせ、ほかのホストを見つける物（peer.Beacon か、WSLプロキシごしの peer.WSLProxyLink）
type hostBeacon interface {
	Update(peer.Advert)
	Query()
	Found() []peer.Sighting
	Close()
}

// startBeacon は、入口を開いたときに mDNS で知らせ始める。HostConfig の WSLProxy があれば WSLプロキシを立ててそれごしに、
// 無ければ Discover のときだけこのホストで（e.mu を持って呼ぶ。srv は WSLプロキシ専用の受け口も答える入口）
func (h *Hub) startBeacon(e *hostEntrance, port int, srv *http.Server) {
	ad := peer.Advert{HostID: e.config.Identity.HostID, Protocol: int(e.proto.Load()), Port: port, Name: e.status.Name, UserName: h.userName()}
	if e.config.WSLProxy != nil {
		h.startWSLProxy(e, ad, srv)
		return
	}
	if !e.config.Discover {
		return
	}
	b, err := peer.StartBeacon(ad, func(s peer.Sighting, gone bool) { h.sighted(e, s, gone) })
	if err != nil {
		fmt.Fprintln(os.Stderr, "hosts: mDNS could not start:", err)
		return
	}
	e.peers.mu.Lock()
	e.peers.beacon = b
	e.peers.mu.Unlock()
}

// startWSLProxy は、WSLプロキシを立て、専用の受け口も srv で答える。様子は立ったあとで知らせる（e.mu を持って呼ぶ。待たない）
func (h *Hub) startWSLProxy(e *hostEntrance, ad peer.Advert, srv *http.Server) {
	var link *peer.WSLProxyLink
	ready := make(chan struct{})
	link, err := peer.StartWSLProxy(peer.WSLProxyOptions{
		Port: ad.Port, Advert: ad, Launch: e.config.WSLProxy, Discover: e.config.Discover, Loopback: e.config.Loopback,
		OnChange: func(s peer.Sighting, gone bool) { h.sighted(e, s, gone) },
		OnState: func(st peer.WSLProxyState, addrs []string) {
			<-ready
			h.wslProxyState(e, link, st, addrs)
		},
	})
	close(ready)
	if err != nil {
		fmt.Fprintln(os.Stderr, "hosts: the WSL proxy could not start:", err)
		e.status.WSLProxy = peer.WSLProxyUnavailable
		return
	}
	go func() { _ = srv.ServeTLS(link.Listener(), "", "") }() // 受け口を閉じたら戻る（入口の止まりとは扱わない）
	e.status.WSLProxy = link.State()
	e.peers.mu.Lock()
	e.peers.beacon = link
	e.peers.mu.Unlock()
}

// wslRestartWaits は、待ち始めたあとで終わった WSLプロキシを立て直すまでの間（回ごと。使い切ったら立て直さず、利用者の［立て直す］を待つ）。
// 終わる訳が一度きりの事（Windows の側で終わらされた・Windows の matomezu を更新した）なら、間を置けば立つ
var wslRestartWaits = []time.Duration{2 * time.Second, 10 * time.Second, 30 * time.Second}

// wslSteady は、WSLプロキシがこれだけ続けて動いてから終わったら、立て直しの数を数え直す間（すぐ終わる物は使い切って止まり、まれに終わる物はいつまでも立て直す）
var wslSteady = time.Minute

// wslProxyState は、WSLプロキシの様子が変わったとき: 今の入口の WSLプロキシなら様子を書き、窓に知らせる。
// 終わったら、WSLプロキシの見つけたホストも消えているので、ほかのホストの一覧も知らせる。待ち始めたあとで終わったら、間を置いて立て直す（そのあいだは starting）
func (h *Hub) wslProxyState(e *hostEntrance, link *peer.WSLProxyLink, st peer.WSLProxyState, addrs []string) {
	e.mu.Lock()
	e.peers.mu.Lock()
	current := e.peers.beacon == hostBeacon(link)
	e.peers.mu.Unlock()
	if !current {
		e.mu.Unlock()
		return
	}
	was := e.status
	if st == peer.WSLProxyRunning {
		e.wslRunning = time.Now()
	}
	if st == peer.WSLProxyStopped && !e.wslRunning.IsZero() && time.Since(e.wslRunning) >= wslSteady {
		e.wslRestarts = 0
	}
	if st == peer.WSLProxyStopped && e.wslRestarts < len(wslRestartWaits) {
		wait := wslRestartWaits[e.wslRestarts]
		e.wslRestarts++
		st = peer.WSLProxyStarting
		time.AfterFunc(wait, func() { h.restartWSLProxy(e, link) })
	}
	e.status.WSLProxy, e.status.WSLProxyAddrs = st, addrs
	now := e.status
	e.mu.Unlock()
	h.tellHostStatus(was, now)
	if st != peer.WSLProxyStarting && st != peer.WSLProxyRunning {
		h.tellPeers()
	}
}

// restartWSLProxy は、終わった WSLプロキシ old を立て直す（入口が開いたままで、old がまだ今の物のときだけ）
func (h *Hub) restartWSLProxy(e *hostEntrance, old *peer.WSLProxyLink) {
	e.mu.Lock()
	e.peers.mu.Lock()
	current := e.peers.beacon == hostBeacon(old)
	e.peers.mu.Unlock()
	if e.closed || e.srv == nil || !current {
		e.mu.Unlock()
		return
	}
	was := e.status
	h.stopBeacon(e)
	h.startBeacon(e, e.status.Port, e.srv)
	now := e.status
	e.mu.Unlock()
	h.tellHostStatus(was, now)
}

// wslRestartable は、利用者の［立て直す］で立て直せる WSLプロキシの様子か（立たなかった・止まった。Windows の側を直したあとで試せるように）。
// Windows でポートが使われているときは［別のポートにする］で、立てている最中と動いているときは立て直さない
func wslRestartable(st peer.WSLProxyState) bool {
	switch st {
	case peer.WSLProxyStopped, peer.WSLProxyUnavailable, peer.WSLProxyUpdateWindows, peer.WSLProxyUpdateThis, peer.WSLProxyListen:
		return true
	}
	return false
}

// RestartWSLProxy は、立たなかったか、立て直しを使い切って止まった WSLプロキシを立て直す（利用者が［立て直す］を押したとき）
func (h *Hub) RestartWSLProxy() error {
	e := h.entrance.Load()
	if e == nil {
		return errors.New("there is no entrance for other hosts")
	}
	e.mu.Lock()
	if e.closed || e.srv == nil || !wslRestartable(e.status.WSLProxy) {
		e.mu.Unlock()
		return errors.New("the WSL proxy is starting or running")
	}
	was := e.status
	e.wslRestarts = 0
	h.stopBeacon(e)
	h.startBeacon(e, e.status.Port, e.srv)
	now := e.status
	e.mu.Unlock()
	h.tellHostStatus(was, now)
	return nil
}

// stopBeacon は、「いなくなる」を知らせて止める（入口を閉じたとき。e.mu を持って呼ぶ）
func (h *Hub) stopBeacon(e *hostEntrance) {
	e.peers.mu.Lock()
	b := e.peers.beacon
	e.peers.beacon = nil
	e.peers.mu.Unlock()
	e.status.WSLProxy, e.status.WSLProxyAddrs = "", nil
	if b != nil {
		go b.Close()
	}
}

// updateBeacon は、名前が変わったら知らせ直す（e.mu を持って呼ぶ）
func (h *Hub) updateBeacon(e *hostEntrance) {
	e.peers.mu.Lock()
	b := e.peers.beacon
	e.peers.mu.Unlock()
	if b != nil {
		b.Update(peer.Advert{HostID: e.config.Identity.HostID, Protocol: int(e.proto.Load()), Port: e.status.Port, Name: e.status.Name, UserName: h.userName()})
	}
}
