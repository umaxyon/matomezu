package server

// ペアリングとペアリングしたホストの様子（ホストどうしの入口が開いているあいだ）。約束は peer/pairing.go。
//
// 受ける側（B）: ペアリングの頼みの口（Unpinned）が commit を受けたら乱数を返し、reveal を受けたら、ペアリングの頼みを載せる役のアクションを利用者として行い、
// 利用者の答えまで答えを返さずに待つ。A がつなぎを閉じた（やめた）・時間切れなら、頼みを消す役のアクションで消す。利用者が受け入れたかは、頼みが消えたあとに
// そのホスト id のペアリングしたホストが在るかで決める（在れば受け入れ、無ければ断り）。受け入れの答えを A に書けなければ、載せたペアリングしたホストをすぐ消す。
// 頼む側（A）: 窓の頼みで 1 つだけ頼み、その様子（接続確認コード・答え）を窓に知らせる。受け入れの答えが届いたら、ペアリングしたホストを載せる役のアクションを行う。
// ペアリングしたホスト: 利用者がペアリングを解いたら（常駐が消したのでなく）、相手の Pinned の口に知らせる。相手が「ペアリングしていない」と答えたら、自分の側も消す。
// つながっているか・最後につながった時刻・待っている所・相手の今の名前は、常駐だけが持つ（mDNS で見えたときと、窓が確かめを頼んだときに、相手の口で確かめる）

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"slices"
	"strconv"
	"sync"
	"time"

	"github.com/umaxyon/matomezu/internal/engine"
	"github.com/umaxyon/matomezu/internal/peer"
)

const (
	pairingCommitTTL   = 30 * time.Second // commit から reveal までの上限
	pairingMaxWaiting  = 3                // 受け入れ待ちと commit 済みの頼みの、全体の上限
	pairingMaxPerAddr  = 2                // 同じ番地からの上限
	peerAskTimeout     = 5 * time.Second  // 相手の口に頼むときの上限（ペアリングの答えを待つときを除く）
	pairingAnswerSlack = 15 * time.Second // A が B の上限より長く待つ分
)

type pairedHostRecord struct {
	ID                string `json:"id"`
	HostID            string `json:"hostId"`
	NameAtPairing     string `json:"nameAtPairing"`
	UserNameAtPairing string `json:"userNameAtPairing"`
	Addr              string `json:"addr"`
	Requests          string `json:"requests"` // 頼みの扱い（requestsAskUser・requestsAsUser）
}

// ペアリングしたホストの requests の値（core/def/subject.ts の PAIRED_HOST_REQUESTS）
const (
	requestsAskUser = "ask-user" // 受け取った AI が、実行してよいか利用者に聞く（既定）
	requestsAsUser  = "as-user"  // 利用者の頼みとして受ける（届く行に印を付ける）
)

type pairingRequestRecord struct {
	ID     string `json:"id"`
	HostID string `json:"hostId"`
}

// incomingPairing は、B に届いた頼み（TLS で見た A のホスト id ごと）
type incomingPairing struct {
	commit  peer.PairingCommit
	nonce   string // B の乱数
	ip      string
	at      time.Time
	request string                   // 載せたペアリングの頼みの id（reveal のあと）
	decided chan peer.PairingOutcome // 利用者が答えたら 1 つ入る
}

// HostPairing は、A が頼んでいるペアリングの様子（窓に見せる）
type HostPairing struct {
	Phase    string `json:"phase"` // asking・waiting・accepted・declined・timed-out・unreachable・refused・key-mismatch
	Addr     string `json:"addr"`
	HostID   string `json:"hostId,omitempty"`
	Name     string `json:"name,omitempty"`
	UserName string `json:"userName,omitempty"`
	Code     string `json:"code,omitempty"`
	Reason   string `json:"reason,omitempty"` // refused の理由（peer.PairingRefusal）
}

// PeerLive は、ペアリングしたホストの、常駐だけが持つ様子
type PeerLive struct {
	HostID      string    `json:"hostId"`
	Label       string    `json:"label"` // 呼び名（labelsLocked。届く行・send_message の host・画面に同じ物を使う）
	Connected   bool      `json:"connected"`
	LastSeen    string    `json:"lastSeen,omitempty"` // 最後につながった時刻
	Addr        string    `json:"addr,omitempty"`     // 待っている所（番地:ポート）
	Name        string    `json:"name,omitempty"`     // 相手の今のホスト名
	UserName    string    `json:"userName,omitempty"`
	KeyMismatch bool      `json:"keyMismatch,omitempty"`
	Workrooms   []RoomRow `json:"workrooms,omitempty"` // 相手のワークルームの一覧の写し（つながっていて、写しのあるときだけ）
}

// FoundHost は、mDNS で見つけた、ペアリングしていないホスト（申告のまま）
type FoundHost struct {
	HostID   string `json:"hostId"`
	Name     string `json:"name"`
	UserName string `json:"userName"`
	Addr     string `json:"addr"` // 番地:ポート
}

// HostPeers は、ほかのホストの様子（窓に host-peers で知らせる）
type HostPeers struct {
	Paired  []PeerLive   `json:"paired"`
	Found   []FoundHost  `json:"found"`
	Pairing *HostPairing `json:"pairing,omitempty"`
}

type peerState struct {
	mu       sync.Mutex
	incoming map[string]*incomingPairing
	outgoing *HostPairing
	cancel   context.CancelFunc
	live     map[string]*PeerLive
	known    map[string]pairedHostRecord // ペアリングしたホスト（ホスト id ごと。kickPeers が引き直す）
	dropping map[string]bool             // 常駐が消しているペアリングしたホスト（相手に知らせない）
	beacon   *peer.Beacon
	kick     chan struct{}
	// ワークルームの一覧（peer_rooms.go）
	rooms     localRooms           // 自分の一覧
	copies    map[string]*roomCopy // ペアリングしたホスト id → 相手の一覧の写し
	fetching  map[string]int       // ペアリングしたホスト id → 取り直しの様子
	roomsKick chan struct{}
}

func newPeerState() *peerState {
	return &peerState{
		incoming: map[string]*incomingPairing{}, live: map[string]*PeerLive{}, known: map[string]pairedHostRecord{}, dropping: map[string]bool{}, kick: make(chan struct{}, 1),
		rooms:  localRooms{epoch: newEnvelopeID(), rows: map[string]string{}},
		copies: map[string]*roomCopy{}, fetching: map[string]int{}, roomsKick: make(chan struct{}, 1),
	}
}

// --- 記録を読む・役のアクションを行う ---

func (h *Hub) pairedHostRecords() []pairedHostRecord {
	h.mu.Lock()
	defer h.mu.Unlock()
	var out []pairedHostRecord
	for _, b := range h.recordsOfRole("paired-hosts") {
		var r pairedHostRecord
		if json.Unmarshal(b, &r) == nil {
			out = append(out, r)
		}
	}
	return out
}

func (h *Hub) pairingRequestRecords() []pairingRequestRecord {
	h.mu.Lock()
	defer h.mu.Unlock()
	var out []pairingRequestRecord
	for _, b := range h.recordsOfRole("pairing-requests") {
		var r pairingRequestRecord
		if json.Unmarshal(b, &r) == nil {
			out = append(out, r)
		}
	}
	return out
}

// isPairedHost は、hostID がペアリングしたホストか（Pinned の包みが使う）
func (h *Hub) isPairedHost(hostID string) bool {
	for _, r := range h.pairedHostRecords() {
		if r.HostID == hostID {
			return true
		}
	}
	return false
}

// performHostRole は、役 pick のアクションを利用者として行う（名乗るアクションが無ければ断り）
func (h *Hub) performHostRole(pick func(engine.HostActions) string, args any, on string) (Performed, error) {
	ids, err := h.engine.HostActions()
	if err != nil {
		return Performed{}, err
	}
	action := pick(ids)
	if action == "" {
		return Performed{OK: false, Reason: "no-action", Detail: "no action names this role of runsBetweenHosts"}, nil
	}
	b, err := json.Marshal(args)
	if err != nil {
		return Performed{}, err
	}
	var target *engine.On
	if on != "" {
		target = &engine.On{Record: on}
	}
	return h.Perform(performOne(action, b, target))
}

func addPairingRequest(a engine.HostActions) string    { return a.AddPairingRequest }
func removePairingRequest(a engine.HostActions) string { return a.RemovePairingRequest }
func addPairedHost(a engine.HostActions) string        { return a.AddPairedHost }
func removePairedHost(a engine.HostActions) string     { return a.RemovePairedHost }

// dropPairedHost は、ホスト hostID のペアリングしたホストを、常駐として消す（相手には知らせない）
func (h *Hub) dropPairedHost(ps *peerState, hostID, why string) {
	for _, r := range h.pairedHostRecords() {
		if r.HostID != hostID {
			continue
		}
		ps.mu.Lock()
		ps.dropping[hostID] = true
		ps.mu.Unlock()
		fmt.Fprintln(os.Stderr, "hosts: unpaired", hostID[:16], why)
		if done, err := h.performHostRole(removePairedHost, map[string]any{}, r.ID); err != nil || !done.OK {
			fmt.Fprintln(os.Stderr, "hosts: could not remove the paired host:", err, done.Detail)
		}
	}
}

// dropPairingRequest は、頼み id を消す（取り下げ・時間切れ・起動し直したとき）。もう無ければ何もしない
func (h *Hub) dropPairingRequest(id string) {
	for _, r := range h.pairingRequestRecords() {
		if r.ID == id {
			if done, err := h.performHostRole(removePairingRequest, map[string]any{}, id); err != nil || !done.OK {
				fmt.Fprintln(os.Stderr, "hosts: could not remove the pairing request:", err, done.Detail)
			}
		}
	}
}

// --- 変わりに応じる ---

// kickPeers は、ペアリングしたホストか頼みが変わったと知らせる（待たない。h.mu を持っていてもよい）
func (h *Hub) kickPeers() {
	e := h.entrance.Load()
	if e == nil {
		return
	}
	select {
	case e.peers.kick <- struct{}{}:
	default:
	}
}

// followPeers は、ペアリングしたホストと頼みの変わりに応じる: 答えを待っている頼みが消えたら答えを決め、利用者が解いたペアリングしたホストを相手に知らせる
func (h *Hub) followPeers(e *hostEntrance) {
	ps := e.peers
	requests := h.pairingRequestRecords()
	paired := h.pairedHostRecords()
	now := map[string]pairedHostRecord{}
	for _, r := range paired {
		now[r.HostID] = r
	}
	ps.mu.Lock()
	for from, in := range ps.incoming {
		if in.request == "" || slices.ContainsFunc(requests, func(r pairingRequestRecord) bool { return r.ID == in.request }) {
			continue
		}
		outcome := peer.PairingDeclined
		if _, ok := now[from]; ok {
			outcome = peer.PairingAccepted
		}
		select {
		case in.decided <- outcome:
		default:
		}
	}
	// 知らせる先は、様子を忘れる前に決める（レコードに待っている所が無ければ、つながったときに知った所しか無い）
	type tell struct {
		r    pairedHostRecord
		addr string
	}
	var told []tell
	for id, r := range ps.known {
		if _, still := now[id]; still {
			continue
		}
		if ps.dropping[id] {
			delete(ps.dropping, id)
		} else {
			addr := r.Addr
			if l := ps.live[id]; l != nil && l.Addr != "" {
				addr = l.Addr
			}
			told = append(told, tell{r, addr})
		}
		delete(ps.live, id)
		delete(ps.copies, id)
	}
	ps.known = now
	ps.mu.Unlock()
	known, asUser := ps.pairedAndAsUser()
	h.mu.Lock()
	h.followPeerLines(known, asUser)
	h.mu.Unlock()
	for _, t := range told {
		go h.tellUnpaired(e, t.r, t.addr)
	}
	h.tellPeers()
}

// tellUnpaired は、利用者が解いたペアリングを、相手の待っている所 addr に知らせる（届かなくても、こちらは消したまま。相手は次につないできたときに not-paired で知る）
func (h *Hub) tellUnpaired(e *hostEntrance, r pairedHostRecord, addr string) {
	if addr == "" {
		fmt.Fprintln(os.Stderr, "hosts: could not tell", r.HostID[:16], "it was unpaired: where it listens is not known")
		return
	}
	c := peer.Client(e.config.Identity, r.HostID, peerAskTimeout)
	resp, err := c.Post("https://"+addr+"/peer/v1/unpair", "application/json", nil)
	if err != nil {
		fmt.Fprintln(os.Stderr, "hosts: could not tell", r.HostID[:16], "it was unpaired:", err)
		return
	}
	resp.Body.Close()
}

// peerAddr は、ペアリングしたホストへつなぐ所: 確かめた待っている所、無ければ利用者が入れた所
func (h *Hub) peerAddr(e *hostEntrance, r pairedHostRecord) string {
	e.peers.mu.Lock()
	defer e.peers.mu.Unlock()
	return e.peers.addrLocked(r)
}

// addrLocked は、ペアリングしたホスト r の待っている所（つながったときに聞いた物。無ければ覚えた物）（ps.mu を持って呼ぶ）
func (ps *peerState) addrLocked(r pairedHostRecord) string {
	if l := ps.live[r.HostID]; l != nil && l.Addr != "" {
		return l.Addr
	}
	return r.Addr
}

// HostPeers は、今のほかのホストの様子
func (h *Hub) HostPeers() HostPeers {
	e := h.entrance.Load()
	if e == nil {
		return HostPeers{Paired: []PeerLive{}, Found: []FoundHost{}}
	}
	ps := e.peers
	ps.mu.Lock()
	defer ps.mu.Unlock()
	out := HostPeers{Paired: []PeerLive{}, Found: []FoundHost{}}
	labels := ps.labelsLocked()
	for id := range ps.known {
		l := PeerLive{HostID: id}
		if x := ps.live[id]; x != nil {
			l = *x
		}
		l.Label = labels[id]
		l.Workrooms = nil
		if l.Connected {
			l.Workrooms = ps.roomsOfLocked(id)
		}
		out.Paired = append(out.Paired, l)
	}
	slices.SortFunc(out.Paired, func(a, b PeerLive) int { return cmpString(a.HostID, b.HostID) })
	if ps.beacon != nil {
		for _, s := range ps.beacon.Found() {
			if _, paired := ps.known[s.HostID]; paired || s.Protocol != peer.Protocol {
				continue
			}
			out.Found = append(out.Found, FoundHost{HostID: s.HostID, Name: s.Name, UserName: s.UserName, Addr: net.JoinHostPort(s.Addr, strconv.Itoa(s.Port))})
		}
	}
	if ps.outgoing != nil {
		p := *ps.outgoing
		out.Pairing = &p
	}
	return out
}

func cmpString(a, b string) int {
	switch {
	case a < b:
		return -1
	case a > b:
		return 1
	}
	return 0
}

func (h *Hub) tellPeers() {
	p := h.HostPeers()
	h.mu.Lock()
	h.broadcast("host-peers", p)
	h.mu.Unlock()
}

// --- B: ペアリングの頼みの口 ---

func refusePairing(w http.ResponseWriter, status int, reason string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(peer.PairingRefusal{Reason: reason})
}

// pairing は、ペアリングの頼みの口（鍵を知らない相手も通す。TLS で見たホスト id で 2 回のやり取りを結ぶ）
func (h *Hub) pairing(w http.ResponseWriter, r *http.Request) {
	e := h.entrance.Load()
	from, _ := peer.RequestHost(r)
	body, err := io.ReadAll(io.LimitReader(r.Body, 4096))
	if e == nil || err != nil {
		refusePairing(w, http.StatusServiceUnavailable, "closed")
		return
	}
	var head struct {
		Step string `json:"step"`
	}
	_ = json.Unmarshal(body, &head)
	switch head.Step {
	case "commit":
		var c peer.PairingCommit
		if json.Unmarshal(body, &c) != nil {
			refusePairing(w, http.StatusBadRequest, "body")
			return
		}
		h.pairingCommit(w, r, e, from, c)
	case "reveal":
		var v peer.PairingReveal
		if json.Unmarshal(body, &v) != nil {
			refusePairing(w, http.StatusBadRequest, "body")
			return
		}
		h.pairingReveal(w, r, e, from, v)
	default:
		refusePairing(w, http.StatusBadRequest, "step")
	}
}

func remoteIP(r *http.Request) string {
	ip, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return ip
}

func (h *Hub) pairingCommit(w http.ResponseWriter, r *http.Request, e *hostEntrance, from string, c peer.PairingCommit) {
	self := h.HostStatus()
	switch {
	case c.Protocol != peer.Protocol:
		refusePairing(w, http.StatusConflict, "protocol")
		return
	case from == self.HostID:
		refusePairing(w, http.StatusForbidden, "self")
		return
	case len(c.Commit) != 64 || c.Port <= 0 || c.Port > 65535 || len(c.Name) > 160 || len(c.UserName) > 160:
		refusePairing(w, http.StatusBadRequest, "body")
		return
	}
	ip := remoteIP(r)
	ps := e.peers
	ps.mu.Lock()
	now := time.Now()
	perAddr := 0
	for id, in := range ps.incoming {
		if in.request == "" && now.Sub(in.at) > pairingCommitTTL {
			delete(ps.incoming, id)
			continue
		}
		if in.ip == ip {
			perAddr++
		}
	}
	if old := ps.incoming[from]; old != nil && old.request != "" {
		ps.mu.Unlock()
		refusePairing(w, http.StatusConflict, "busy")
		return
	}
	if ps.incoming[from] == nil && (len(ps.incoming) >= pairingMaxWaiting || perAddr >= pairingMaxPerAddr) {
		ps.mu.Unlock()
		refusePairing(w, http.StatusTooManyRequests, "busy")
		return
	}
	nonce := peer.NewNonce()
	ps.incoming[from] = &incomingPairing{commit: c, nonce: nonce, ip: ip, at: now}
	ps.mu.Unlock()
	// 頼み直しは、相手が記録を失ったということ（相手は TLS の鍵で確かめている）。前のペアリングを消してから受ける
	h.dropPairedHost(ps, from, "because it asked to pair again")
	writeJSON(w, peer.PairingHello{Protocol: peer.Protocol, HostID: self.HostID, Name: self.Name, UserName: h.userName(), Nonce: nonce})
}

func (h *Hub) pairingReveal(w http.ResponseWriter, r *http.Request, e *hostEntrance, from string, v peer.PairingReveal) {
	ps := e.peers
	ps.mu.Lock()
	in := ps.incoming[from]
	if in == nil || in.request != "" {
		ps.mu.Unlock()
		refusePairing(w, http.StatusConflict, "no-commit")
		return
	}
	if peer.CommitOf(v.Nonce) != in.commit.Commit {
		delete(ps.incoming, from)
		ps.mu.Unlock()
		refusePairing(w, http.StatusForbidden, "commit-mismatch")
		return
	}
	in.request = "pending"
	in.decided = make(chan peer.PairingOutcome, 1)
	ps.mu.Unlock()
	self := h.HostStatus()
	code := peer.PairingCode(from, self.HostID, v.Nonce, in.nonce)
	done, err := h.performHostRole(addPairingRequest, map[string]any{
		"hostId": from, "name": clipName(in.commit.Name), "userName": clipName(in.commit.UserName),
		"addr": net.JoinHostPort(in.ip, strconv.Itoa(in.commit.Port)), "code": code,
	}, "")
	var put struct {
		Request string `json:"request"`
	}
	if err != nil || !done.OK || json.Unmarshal(done.Result, &put) != nil {
		ps.mu.Lock()
		delete(ps.incoming, from)
		ps.mu.Unlock()
		fmt.Fprintln(os.Stderr, "hosts: could not put the pairing request:", err, done.Detail)
		refusePairing(w, http.StatusConflict, "busy")
		return
	}
	ps.mu.Lock()
	in.request = put.Request
	ps.mu.Unlock()
	h.kickPeers() // 載せるまでに利用者が答えていても拾う
	var outcome peer.PairingOutcome
	select {
	case outcome = <-in.decided:
	case <-r.Context().Done():
	case <-time.After(peer.PairingWait):
		outcome = peer.PairingTimedOut
	}
	ps.mu.Lock()
	delete(ps.incoming, from)
	ps.mu.Unlock()
	if outcome == "" || outcome == peer.PairingTimedOut {
		h.dropPairingRequest(put.Request)
		if outcome == "" {
			return
		}
	}
	w.Header().Set("Content-Type", "application/json")
	_, werr := w.Write(append(mustJSON(peer.PairingAnswer{Outcome: outcome}), '\n'))
	if werr == nil {
		if f, ok := w.(http.Flusher); ok {
			f.Flush()
		}
	}
	if outcome == peer.PairingAccepted && (werr != nil || r.Context().Err() != nil) {
		// 受け入れたのに A に答えられなかった: 片方にだけ載らないよう、すぐ消す
		h.dropPairedHost(ps, from, "because the answer did not reach it")
		return
	}
	if outcome == peer.PairingAccepted {
		// A は答えを受けた。頼みの来た番地と A の待っているポートを、つなぐ所として覚える（レコードの addr は利用者が入れた所だけ）
		h.sawPeer(ps, from, net.JoinHostPort(in.ip, strconv.Itoa(in.commit.Port)), in.commit.Name, in.commit.UserName)
	}
}

// sawPeer は、ペアリングしたホスト id が今つながったと記し（鍵で確かめた相手だけ）、待っている所 addr（空なら変えない）と名前を覚えて、窓に知らせる
func (h *Hub) sawPeer(ps *peerState, id, addr, name, userName string) {
	ps.mu.Lock()
	if _, known := ps.known[id]; !known {
		ps.mu.Unlock()
		return
	}
	l := ps.live[id]
	if l == nil {
		l = &PeerLive{HostID: id}
		ps.live[id] = l
	}
	l.Connected, l.KeyMismatch, l.LastSeen = true, false, stamp()
	if addr != "" {
		l.Addr = addr
	}
	if name != "" {
		l.Name, l.UserName = name, userName
	}
	ps.mu.Unlock()
	h.tellPeers()
	if e := h.entrance.Load(); e != nil && e.peers == ps {
		go h.refetchRooms(e, id)
	}
}

func mustJSON(v any) []byte {
	b, _ := json.Marshal(v)
	return b
}

// clipName は、名乗った名前を、レコードに入る 40 字までに切る
func clipName(s string) string {
	r := []rune(s)
	if len(r) > 40 {
		r = r[:40]
	}
	return string(r)
}

func (h *Hub) userName() string {
	settings, _ := h.Data()
	s, err := h.engine.HostSettingsOf(settings)
	if err != nil {
		return ""
	}
	return s.UserName
}

// --- A: ペアリングを頼む ---

// StartPairing は、addr（番地:ポート）のホストにペアリングを頼み始める（待たない。様子は host-peers で知らせる）。manual は、利用者が待っている所を手で入れたか
func (h *Hub) StartPairing(addr string, manual bool) error {
	e := h.entrance.Load()
	if e == nil || !h.HostStatus().Open {
		return errors.New("the entrance for other hosts is not open")
	}
	if _, _, err := net.SplitHostPort(addr); err != nil {
		return fmt.Errorf("the address must be host:port: %w", err)
	}
	ps := e.peers
	ctx, cancel := context.WithCancel(context.Background())
	ps.mu.Lock()
	if ps.cancel != nil {
		ps.cancel()
	}
	ps.cancel = cancel
	ps.outgoing = &HostPairing{Phase: "asking", Addr: addr}
	mine := ps.outgoing
	ps.mu.Unlock()
	h.tellPeers()
	go h.askPairing(ctx, e, mine, addr, manual)
	return nil
}

// EndPairing は、頼んでいるペアリングをやめる（つなぎを閉じるので、B は頼みを消す）。終わった様子も消す
func (h *Hub) EndPairing() {
	e := h.entrance.Load()
	if e == nil {
		return
	}
	ps := e.peers
	ps.mu.Lock()
	if ps.cancel != nil {
		ps.cancel()
		ps.cancel = nil
	}
	ps.outgoing = nil
	ps.mu.Unlock()
	h.tellPeers()
}

// setPairing は、頼んでいる様子を変える（mine がまだ今の頼みのときだけ）
func (h *Hub) setPairing(e *hostEntrance, mine *HostPairing, change func(*HostPairing)) {
	ps := e.peers
	ps.mu.Lock()
	if ps.outgoing != mine {
		ps.mu.Unlock()
		return
	}
	change(mine)
	ps.mu.Unlock()
	h.tellPeers()
}

func (h *Hub) askPairing(ctx context.Context, e *hostEntrance, mine *HostPairing, addr string, manual bool) {
	self := h.HostStatus()
	fail := func(phase, reason string) {
		h.setPairing(e, mine, func(p *HostPairing) { p.Phase, p.Reason = phase, reason })
	}
	nonce := peer.NewNonce()
	commit := peer.PairingCommit{Step: "commit", Protocol: peer.Protocol, Name: self.Name, UserName: h.userName(), Port: self.Port, Commit: peer.CommitOf(nonce)}
	var hello peer.PairingHello
	first, err := postPeer(ctx, peer.Client(e.config.Identity, "", peerAskTimeout), addr, commit, &hello)
	if ctx.Err() != nil {
		return
	}
	if err != nil {
		fail("unreachable", "")
		return
	}
	if first.status != http.StatusOK {
		fail("refused", first.reason)
		return
	}
	other := first.hostID
	if other == self.HostID {
		fail("refused", "self")
		return
	}
	code := peer.PairingCode(self.HostID, other, nonce, hello.Nonce)
	h.setPairing(e, mine, func(p *HostPairing) {
		p.Phase, p.HostID, p.Name, p.UserName, p.Code = "waiting", other, clipName(hello.Name), clipName(hello.UserName), code
	})
	var answer peer.PairingAnswer
	second, err := postPeer(ctx, peer.Client(e.config.Identity, other, peer.PairingWait+pairingAnswerSlack), addr, peer.PairingReveal{Step: "reveal", Nonce: nonce}, &answer)
	if ctx.Err() != nil {
		return
	}
	switch {
	case errors.Is(err, peer.ErrKeyMismatch):
		fail("key-mismatch", "")
		return
	case err != nil:
		fail("unreachable", "")
		return
	case second.status != http.StatusOK:
		fail("refused", second.reason)
		return
	}
	if answer.Outcome != peer.PairingAccepted {
		fail(string(answer.Outcome), "")
		return
	}
	kept := ""
	if manual {
		kept = addr
	}
	done, err := h.performHostRole(addPairedHost, map[string]any{"hostId": other, "nameAtPairing": clipName(hello.Name), "userNameAtPairing": clipName(hello.UserName), "addr": kept}, "")
	if err != nil || !done.OK {
		fmt.Fprintln(os.Stderr, "hosts: could not put the paired host:", err, done.Detail)
		fail("refused", "")
		return
	}
	e.peers.mu.Lock()
	e.peers.live[other] = &PeerLive{HostID: other, Connected: true, LastSeen: stamp(), Addr: addr, Name: hello.Name, UserName: hello.UserName}
	e.peers.mu.Unlock()
	fail("accepted", "")
}

// peerReply は、相手の口の答え: TLS で見た相手のホスト id・状態の番号・断りの理由（200 でないとき）
type peerReply struct {
	hostID string
	status int
	reason string
}

// postPeer は、相手のペアリングの口に body を JSON で送り、200 なら答えを out に読む
func postPeer(ctx context.Context, c *http.Client, addr string, body, out any) (reply peerReply, err error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://"+addr+peer.PairingPath, bytes.NewReader(mustJSON(body)))
	if err != nil {
		return reply, err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := c.Do(req)
	if err != nil {
		return reply, err
	}
	defer resp.Body.Close()
	if resp.TLS != nil && len(resp.TLS.PeerCertificates) > 0 {
		reply.hostID = peer.HostIDOf(resp.TLS.PeerCertificates[0])
	}
	reply.status = resp.StatusCode
	if resp.StatusCode != http.StatusOK {
		var refusal peer.PairingRefusal
		_ = json.NewDecoder(io.LimitReader(resp.Body, 4096)).Decode(&refusal)
		reply.reason = refusal.Reason
		return reply, nil
	}
	return reply, json.NewDecoder(io.LimitReader(resp.Body, 4096)).Decode(out)
}
