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

	"github.com/umaxyon/matomezu/internal/peer"
)

// peerHello は、hello の口の答え: ホスト名・利用者名・待っている所のポート（常駐間通信プロトコルの版は、包みが見出しで確かめる）
type peerHello struct {
	Name     string `json:"name"`
	UserName string `json:"userName"`
	Port     int    `json:"port"`
}

// 頼んだ側は、自分の待っているポートを port に載せる。こちらは、頼みの来た番地とそのポートを、相手へつなぐ所として覚える
// （受け入れた側は相手の待っている所を利用者から聞かないので、相手の確かめで知る。相手の IP が変わっても追える）
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

// CheckPeers は、ペアリングしたホストみなとつながっているかを確かめ始める（待たない）
func (h *Hub) CheckPeers() {
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

// checkPeer は、ペアリングしたホスト r の hello の口に、固定した鍵で頼み、様子を直して窓に知らせる。addr が空なら peerRoute の道で、
// 空でなければ（mDNS で見えた所）その所へ直に頼む。直に答えたときだけ、待っている所を書き直す。相手が「ペアリングしていない」と答えたら、こちらも消す。
// 常駐間通信プロトコルの版が合わなければ、どちらを更新すれば合うかを様子に書く
func (h *Hub) checkPeer(e *hostEntrance, r pairedHostRecord, addr string) {
	var c *http.Client
	base := "https://" + addr
	direct := addr != ""
	if direct {
		c = peerClient(e, r.HostID)
	} else {
		var ok bool
		if c, base, ok = h.peerRoute(e, r.HostID); !ok {
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
	case ps.routeLocked(r.HostID) != "" && direct:
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

// startBeacon は、入口を開いたときに mDNS で知らせ始める（HostConfig の Discover のときだけ。e.mu を持って呼ぶ）
func (h *Hub) startBeacon(e *hostEntrance, port int) {
	if !e.config.Discover {
		return
	}
	ad := peer.Advert{HostID: e.config.Identity.HostID, Protocol: e.proto, Port: port, Name: e.status.Name, UserName: h.userName()}
	b, err := peer.StartBeacon(ad, func(s peer.Sighting, gone bool) { h.sighted(e, s, gone) })
	if err != nil {
		fmt.Fprintln(os.Stderr, "hosts: mDNS could not start:", err)
		return
	}
	e.peers.mu.Lock()
	e.peers.beacon = b
	e.peers.mu.Unlock()
}

// stopBeacon は、「いなくなる」を知らせて止める（入口を閉じたとき）
func (h *Hub) stopBeacon(e *hostEntrance) {
	e.peers.mu.Lock()
	b := e.peers.beacon
	e.peers.beacon = nil
	e.peers.mu.Unlock()
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
		b.Update(peer.Advert{HostID: e.config.Identity.HostID, Protocol: e.proto, Port: e.status.Port, Name: e.status.Name, UserName: h.userName()})
	}
}
