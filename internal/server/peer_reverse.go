package server

// リバース接続（peer/reverse.go）の指図: 入口が開いている間、ペアリングしたホストみなへ張り続け、相手が張ってきた接続を預かる。
// ペアリングしたホストへの頼みは、相手が張った接続があればその上で、無ければ相手の待ち受けアドレスへ直に送る（どの頼みも peerTarget で頼む先を決める）。
// つながっているかは、どちらかの向きの接続が生きているか: 接続ができたら確かめ（hello と一覧の取り直し）を起こし、両方が切れたらつながらない様子にする。
// 張り直すのは、切れた接続と張れなかった接続だけで、hello を間を置いて頼むことはしない

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"os"
	"time"

	"github.com/umaxyon/matomezu/internal/peer"
)

// 張れなかったとき・切れたときに張り直すまでの間（倍にしていき、上限で止める）。相手の待ち受けアドレスへ届かないホスト（NAT の後ろ）へも上限の間で張り続ける
var (
	reverseRetryFirst = 2 * time.Second
	reverseRetryMax   = 60 * time.Second
)

// reverseBase は、リバース接続の上で頼むときの URL の頭（番地は使わない）
const reverseBase = "https://reverse"

// reverseDial は、こちらがペアリングしたホストへ張り続ける物
type reverseDial struct {
	cancel context.CancelFunc
	up     bool // 今張れている
}

// peerTarget は、ペアリングしたホスト hostID へ頼む先: 相手が張った接続があればその上、無ければ待ち受けアドレス（つながったときに聞いた所、無ければ覚えた所）へ直に。
// base は頼みの URL の頭（口の道を足して使う）。どちらも無ければ ok が false
func (h *Hub) peerTarget(e *hostEntrance, hostID string) (c *http.Client, base string, ok bool) {
	ps := e.peers
	ps.mu.Lock()
	in := ps.reverseIn[hostID]
	addr := ""
	if r, known := ps.known[hostID]; known {
		addr = ps.addrLocked(r)
	}
	ps.mu.Unlock()
	if in != nil && peer.ReverseOpen(in) {
		return in, reverseBase, true
	}
	if addr == "" {
		return nil, "", false
	}
	return peerClient(e, hostID), "https://" + addr, true
}

// linkedLocked は、ペアリングしたホスト hostID と、どちらかの向きのリバース接続が生きているか（ps.mu を持って呼ぶ）
func (ps *peerState) linkedLocked(hostID string) bool {
	return ps.dialedLocked(hostID) || ps.takenLocked(hostID)
}

// reverseOnlyLocked は、ホスト hostID と、相手が張ったリバース接続でだけつながっているか（ps.mu を持って呼ぶ）
func (ps *peerState) reverseOnlyLocked(hostID string) bool {
	return !ps.dialedLocked(hostID) && ps.takenLocked(hostID)
}

// dialedLocked は、こちらがホスト hostID へ張ったリバース接続が生きているか（ps.mu を持って呼ぶ）
func (ps *peerState) dialedLocked(hostID string) bool {
	d := ps.reverseOut[hostID]
	return d != nil && d.up
}

// takenLocked は、ホスト hostID が張って、こちらが預かったリバース接続が生きているか（ps.mu を持って呼ぶ）
func (ps *peerState) takenLocked(hostID string) bool {
	in := ps.reverseIn[hostID]
	return in != nil && peer.ReverseOpen(in)
}

// peerReverse は、ペアリングしたホストがリバース接続を張る口: 接続を預かり（前の物は閉じる）、確かめを起こす。切れたら外す
func (h *Hub) peerReverse(w http.ResponseWriter, r *http.Request) {
	e := h.entrance.Load()
	from, _ := peer.RequestHost(r)
	if e == nil {
		http.Error(w, "closed", http.StatusServiceUnavailable)
		return
	}
	ps := e.peers
	ps.mu.Lock()
	gen := ps.reverseGen
	ps.mu.Unlock()
	e.mu.Lock()
	proto := int(e.proto.Load())
	e.mu.Unlock()
	conn, err := peer.AcceptReverse(w, r)
	if err != nil {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), peerAskTimeout)
	c, done, err := peer.ReverseClient(ctx, conn, e.config.Identity, from, proto, peerAskTimeout)
	cancel()
	if err != nil {
		fmt.Fprintln(os.Stderr, "hosts: could not take the reverse connection of", from[:16]+":", err)
		return
	}
	ps.mu.Lock()
	rec, known := ps.known[from]
	known = known && ps.reverseGen == gen
	old := ps.reverseIn[from]
	if known {
		ps.reverseIn[from] = c
	}
	ps.mu.Unlock()
	if old != nil {
		peer.CloseReverse(old)
	}
	if !known {
		peer.CloseReverse(c)
		return
	}
	go func() {
		<-done
		ps.mu.Lock()
		if ps.reverseIn[from] == c {
			delete(ps.reverseIn, from)
		}
		ps.mu.Unlock()
		h.reverseDown(e, from)
	}()
	go h.checkPeer(e, rec, "")
}

// followReverse は、こちらが張り続ける物を、ペアリングしたホストと入口に合わせる: 入口が開いていれば、ペアリングしたホストみなへ張り始め、
// ペアリングから外れたホストと、入口が閉じていればみなへ張るのをやめ、預かった接続も閉じる
func (h *Hub) followReverse(e *hostEntrance) {
	open := h.HostStatus().Open && h.entrance.Load() == e
	ps := e.peers
	ps.mu.Lock()
	if !open {
		ps.reverseGen++
	}
	var closing []*http.Client
	for id, d := range ps.reverseOut {
		if _, known := ps.known[id]; !known || !open {
			d.cancel()
			delete(ps.reverseOut, id)
		}
	}
	for id, c := range ps.reverseIn {
		if _, known := ps.known[id]; !known || !open {
			closing = append(closing, c)
			delete(ps.reverseIn, id)
		}
	}
	if open {
		for id := range ps.known {
			if ps.reverseOut[id] == nil {
				ctx, cancel := context.WithCancel(context.Background())
				d := &reverseDial{cancel: cancel}
				ps.reverseOut[id] = d
				go h.keepReverse(ctx, e, id, d)
			}
		}
	}
	ps.mu.Unlock()
	for _, c := range closing {
		peer.CloseReverse(c)
	}
}

// keepReverse は、ペアリングしたホスト hostID へリバース接続を張り、切れたら間を置いて張り直す（ctx が終わるまで）。
// 張れている間は、相手の頼みにホストどうしの入口と同じ口で答える
func (h *Hub) keepReverse(ctx context.Context, e *hostEntrance, hostID string, d *reverseDial) {
	wait := reverseRetryFirst
	for ctx.Err() == nil {
		ps := e.peers
		ps.mu.Lock()
		r, known := ps.known[hostID]
		addr := ""
		if known {
			addr = ps.addrLocked(r)
		}
		ps.mu.Unlock()
		e.mu.Lock()
		handler, proto := e.handler, int(e.proto.Load())
		e.mu.Unlock()
		if !known {
			return
		}
		if addr != "" && handler != nil {
			conn, err := peer.DialReverse(ctx, e.config.Identity, hostID, proto, addr)
			if err == nil {
				wait = reverseRetryFirst
				ps.mu.Lock()
				d.up = true
				ps.mu.Unlock()
				go h.checkPeer(e, r, "")
				_ = peer.ServeReverse(ctx, conn, e.config.Identity, hostID, handler)
				ps.mu.Lock()
				d.up = false
				ps.mu.Unlock()
				h.reverseDown(e, hostID)
			} else if ctx.Err() == nil {
				h.reverseFailed(e, hostID, err)
			}
		}
		select {
		case <-ctx.Done():
			return
		case <-time.After(wait):
		}
		wait = min(wait*2, reverseRetryMax)
	}
}

// reverseFailed は、こちらから張れなかったとき: 相手が「ペアリングしていない」と答えたら、こちらも消す。
// ほかの失敗は、相手が張った接続が生きていなければ様子に書く（生きていれば、相手の待ち受けアドレスへ届かないだけで、つながっている）
func (h *Hub) reverseFailed(e *hostEntrance, hostID string, err error) {
	if errors.Is(err, peer.ErrNotPaired) {
		h.dropPairedHost(e.peers, hostID, "because it answered that it is not paired")
		return
	}
	ps := e.peers
	ps.mu.Lock()
	if ps.linkedLocked(hostID) {
		ps.mu.Unlock()
		return
	}
	changed := false
	if l := ps.live[hostID]; l != nil {
		was := l.State
		l.State = stateOfError(err)
		changed = was != l.State
		delete(ps.copies, hostID)
	}
	ps.mu.Unlock()
	if changed {
		h.tellPeers()
	}
}

// reverseDown は、どちらかの向きの接続が切れたとき: 両方とも無くなったら、つながらない様子にして写しを捨てる
func (h *Hub) reverseDown(e *hostEntrance, hostID string) {
	ps := e.peers
	ps.mu.Lock()
	if ps.linkedLocked(hostID) {
		ps.mu.Unlock()
		h.tellPeers()
		return
	}
	if l := ps.live[hostID]; l != nil && l.State == PeerConnected {
		l.State = PeerUnreachable
	}
	delete(ps.copies, hostID)
	ps.mu.Unlock()
	h.tellPeers()
}

// closeReverse は、入口を閉じたとき: 張るのをやめ、預かった接続を閉じる
func (h *Hub) closeReverse(e *hostEntrance) {
	ps := e.peers
	ps.mu.Lock()
	ps.reverseGen++
	for id, d := range ps.reverseOut {
		d.cancel()
		delete(ps.reverseOut, id)
	}
	var closing []*http.Client
	for id, c := range ps.reverseIn {
		closing = append(closing, c)
		delete(ps.reverseIn, id)
	}
	ps.mu.Unlock()
	for _, c := range closing {
		peer.CloseReverse(c)
	}
}
