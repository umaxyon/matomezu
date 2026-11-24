package server

// ほかのホストとの AI 間メッセージ: 送り手の常駐が、ペアリングしたホストの Pinned の口 POST /peer/v1/message に封筒 1 通を同期で運ぶ。
// 送り手のホストは TLS で見た相手の鍵で決まり、封筒の From.Host と違えば断る（書き換えない）。宛て先の参加者は受けたホストが引く。
// 届く行には、送り手のホストの呼び名（受けたホストが決めた物。send_message の host に書く値）を添え、そのホストの頼みの扱いが as-user なら印を付ける。
// requests を ask-user に戻したら、行列に残っている印つきの行から印を外し、ペアリングを解いたら、そのホストから届いた行を捨てる（followPeerLines）。
// つながらなかった・相手が受けなかったと答えた（確かに届いていない）ときは unreachable で断り、送ったのに答えが無ければ同じ封筒をもう 1 回送る（受けた側は同じ id を 1 通にする）。
// それにも答えが無ければ、届いたかもしれないので no-answer で返す
//
//	POST /peer/v1/message 封筒（Envelope）  {"ok": true, "queued": true}、または断った理由 {"ok": false, "reason", "detail"}（unknown-recipient）。形の合わない封筒は 400

import (
	"bytes"
	"crypto/tls"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"slices"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/umaxyon/matomezu/internal/peer"
	"github.com/umaxyon/matomezu/internal/storage"
)

const (
	envelopeBodyMax = 64 << 10 // 届く封筒の本文の上限（バイト）
	messageTextMax  = 4000     // 本文の上限（字。send_message の maxLength と同じ）
	workroomNameMax = 40       // 届く封筒のワークルームの名前の上限（字）
)

// asUserMark は、頼みの扱いが as-user のホストから届いた行の、頭に付ける印
const asUserMark = "(as your user's request)"

// remoteMessageHead は、ほかのホストの AI からの知らせの頭（from は送り手のワークルーム名、host は送り手のホストの呼び名、asUser は印を付けるか）
func remoteMessageHead(from, host string, asUser bool) string {
	head := "matomezu from AI " + quote(from) + " on host " + quote(host)
	if asUser {
		head += " " + asUserMark
	}
	return head + ":"
}

// sendToHost は、ワークルーム from の参加者から、呼び名 req.Host のペアリングしたホストのワークルーム req.To へ封筒を運ぶ（h.mu を持たずに呼ぶ）
func (h *Hub) sendToHost(from string, req MessageRequest, now time.Time) MessageSent {
	e, target, refused := h.pairedByLabel(req.Host)
	if target == nil {
		return refused
	}
	if utf8.RuneCountInString(req.To) > workroomNameMax {
		return MessageSent{Reason: "unknown-recipient", Detail: fmt.Sprintf("no workroom has a name longer than %d characters; the message was not sent", workroomNameMax)}
	}
	addr := h.peerAddr(e, *target)
	if addr == "" {
		return MessageSent{Reason: "unreachable", Detail: "where host " + req.Host + " listens is not known yet; the message was not sent"}
	}
	self := e.config.Identity.HostID
	env := Envelope{
		ID:     newEnvelopeID(),
		From:   Address{Host: self, Workroom: from},
		To:     Address{Host: target.HostID, Workroom: req.To},
		Text:   req.Text,
		SentAt: storage.Stamp(now),
	}
	body := mustJSON(env)
	c := peerClient(e, target.HostID)
	var sent MessageSent
	var err error
	for try := 0; try < 2; try++ {
		sent, err = h.postEnvelope(e, c, target.HostID, addr, body)
		if err == nil || notSent(err) {
			break
		}
	}
	switch {
	case err == nil:
		return sent
	case errors.Is(err, errNotPaired):
		return MessageSent{Reason: "unknown-host", Detail: "host " + req.Host + " is not paired with this host any more; the message was not sent"}
	case errors.As(err, new(answeredError)):
		return MessageSent{Reason: "unreachable", Detail: "host " + req.Host + " did not take the message (" + err.Error() + "; its matomezu may be older); the message was not sent"}
	case notSent(err):
		return MessageSent{Reason: "unreachable", Detail: "host " + req.Host + " could not be reached; the message was not sent"}
	default:
		return MessageSent{Reason: "no-answer", Detail: "host " + req.Host + " did not answer, twice; the message may have arrived, so do not send it again before you hear from that AI"}
	}
}

// errNotPaired は、相手が「ペアリングしていない」と答えたこと（こちらの側も消した）
var errNotPaired = errors.New("the host answered that it is not paired")

// answeredError は、相手が 200 でない答えで封筒を受けなかったこと（受けていないと相手が言った）
type answeredError struct{ status int }

func (e answeredError) Error() string { return fmt.Sprintf("it answered %d", e.status) }

// notSent は、頼みが相手に届いていないと確かに言える失敗か: つなげなかった・鍵が合わなかった・TLS を結べなかった・相手が受けなかったと答えた
func notSent(err error) bool {
	var op *net.OpError
	var rec tls.RecordHeaderError
	return errors.Is(err, errNotPaired) || errors.Is(err, peer.ErrKeyMismatch) || errors.As(err, new(answeredError)) ||
		(errors.As(err, &op) && op.Op == "dial") || errors.As(err, &rec) || handshakeFailed(err)
}

// handshakeFailed は、TLS を結ぶ所で失敗したか。net/http は、TLS を結ぶ途中の時間切れ・切断を型でなく文で返す
// （transport.go の "net/http: TLS handshake timeout" と、tls の "tls: ... handshake ..."）。型で見分けられない間は、この文に頼る
func handshakeFailed(err error) bool {
	return strings.Contains(err.Error(), "TLS handshake")
}

// postEnvelope は、ホスト hostID の待っている所 addr に封筒 body を渡し、相手の答えを返す。相手が「ペアリングしていない」と答えたら、こちらも消す
func (h *Hub) postEnvelope(e *hostEntrance, c *http.Client, hostID, addr string, body []byte) (MessageSent, error) {
	resp, err := c.Post("https://"+addr+"/peer/v1/message", "application/json", bytes.NewReader(body))
	if err != nil {
		return MessageSent{}, err
	}
	b, _ := io.ReadAll(io.LimitReader(resp.Body, 16<<10))
	resp.Body.Close()
	if resp.StatusCode == http.StatusForbidden && strings.TrimSpace(string(b)) == peer.NotPaired {
		h.dropPairedHost(e.peers, hostID, "because it answered that it is not paired")
		return MessageSent{}, errNotPaired
	}
	if resp.StatusCode != http.StatusOK {
		return MessageSent{}, answeredError{resp.StatusCode}
	}
	var sent MessageSent
	if err := json.Unmarshal(b, &sent); err != nil {
		return MessageSent{}, fmt.Errorf("the answer could not be read: %w", err)
	}
	return MessageSent{OK: sent.OK, Queued: sent.Queued, Reason: sent.Reason, Detail: sent.Detail}, nil
}

// peerMessage は、ペアリングしたホストから封筒 1 通を受ける口
func (h *Hub) peerMessage(w http.ResponseWriter, r *http.Request) {
	fromHost, _ := peer.RequestHost(r)
	var env Envelope
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, envelopeBodyMax)).Decode(&env); err != nil {
		http.Error(w, "bad envelope", http.StatusBadRequest)
		return
	}
	self := h.selfHostID()
	if env.ID == "" || env.From.Host != fromHost || self == "" || env.To.Host != self ||
		!fitsName(env.From.Workroom) || !fitsName(env.To.Workroom) || env.Text == "" || utf8.RuneCountInString(env.Text) > messageTextMax {
		http.Error(w, "bad envelope", http.StatusBadRequest)
		return
	}
	writeJSON(w, h.receiveEnvelope(env))
}

func fitsName(s string) bool { return s != "" && utf8.RuneCountInString(s) <= workroomNameMax }

// receiveEnvelope は、ほかのホストから届いた封筒 env を、宛て先のワークルームの参加者の行列に入れる（同じ id は 1 通にする）
func (h *Hub) receiveEnvelope(env Envelope) MessageSent {
	e := h.entrance.Load()
	if e == nil {
		return MessageSent{Reason: "unknown-recipient", Detail: "this host does not connect to other hosts now"}
	}
	label, asUser := e.peers.labelOf(env.From.Host)
	records, err := h.records()
	if err != nil {
		return MessageSent{Reason: "unknown-recipient", Detail: err.Error()}
	}
	rooms, err := h.workrooms()
	if err != nil {
		return MessageSent{Reason: "unknown-recipient", Detail: err.Error()}
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	occupant := h.occupants(records)
	var open []string
	to := ""
	for _, room := range rooms {
		if occupant[room.ID] == "" {
			continue
		}
		open = append(open, room.Name)
		if room.Name == env.To.Workroom {
			to = occupant[room.ID]
		}
	}
	if to == "" {
		slices.Sort(open)
		detail := "no AI is in a workroom named " + env.To.Workroom
		if len(open) > 0 {
			detail += "; you can send to: " + strings.Join(open, ", ")
		} else {
			detail += "; no AI is in a workroom now"
		}
		return MessageSent{Reason: "unknown-recipient", Detail: detail}
	}
	h.deliver(delivery{to: to, envelope: env, host: label, peer: env.From.Host, asUser: asUser})
	return MessageSent{OK: true, Queued: true}
}

// followPeerLines は、行列に残っている、ほかのホストから届いた行を、ペアリングしたホストの今の様子に合わせる: ペアリングを解いたホスト（known に無い）から届いた物は
// 捨て（返事の宛先をもう引けない）、もう as-user でないホスト（asUser に無い）から届いた物の印を外す。通り道に貸している行も同じにする
// （渡せなければ行列に戻り、「届いた」だけを渡した行は本文を呼び出しの返事で渡すので、そのときは印が無い）（h.mu を持って呼ぶ）
func (h *Hub) followPeerLines(known, asUser map[string]bool) {
	for id, q := range h.wakeQueue {
		kept := q[:0]
		for _, it := range q {
			if it.kind == wakeMessage && it.peer != "" {
				if !known[it.peer] {
					continue
				}
				if it.asUser && !asUser[it.peer] {
					it.asUser = false
					it.head = strings.Replace(it.head, " "+asUserMark+":", ":", 1)
					it.line = it.head + " " + it.body
				}
			}
			kept = append(kept, it)
		}
		if len(kept) == 0 {
			delete(h.wakeQueue, id)
		} else {
			h.wakeQueue[id] = kept
		}
	}
}

// labelsLocked は、ペアリングしたホストの呼び名（ホスト id → 呼び名）: 今の名前（つながったときに聞いた物。無ければペアリングしたときの名前）で、
// 同じ名前のホストが 2 つ以上あれば、鍵の印の頭を添える（4 字から、どれも違うまで伸ばす。例 win-lan · 7F3A）。届く行・send_message の host・画面に、同じ呼び名を使う（ps.mu を持って呼ぶ）
func (ps *peerState) labelsLocked() map[string]string {
	names := map[string]string{}
	same := map[string][]string{} // 名前 → その名前のホスト id
	for id, r := range ps.known {
		name := r.NameAtPairing
		if l := ps.live[id]; l != nil && l.Name != "" {
			name = l.Name
		}
		names[id] = name
		same[name] = append(same[name], id)
	}
	for name, ids := range same {
		if len(ids) < 2 {
			continue
		}
		n := keyHeadLen(ids)
		for _, id := range ids {
			names[id] = name + " · " + strings.ToUpper(id[:n])
		}
	}
	return names
}

// keyHeadLen は、ホスト id の並び ids の頭を、どれも違うまで伸ばした長さ（4 字から）
func keyHeadLen(ids []string) int {
	for n := 4; ; n++ {
		seen := map[string]bool{}
		unique := true
		for _, id := range ids {
			if n >= len(id) {
				return len(id)
			}
			if seen[id[:n]] {
				unique = false
				break
			}
			seen[id[:n]] = true
		}
		if unique {
			return n
		}
	}
}

// byLabel は、呼び名 label のペアリングしたホスト（無ければ nil）と、全部の呼び名（並べた物）
func (ps *peerState) byLabel(label string) (*pairedHostRecord, []string) {
	ps.mu.Lock()
	defer ps.mu.Unlock()
	var found *pairedHostRecord
	all := []string{}
	for id, l := range ps.labelsLocked() {
		all = append(all, l)
		if l == label {
			r := ps.known[id]
			found = &r
		}
	}
	slices.Sort(all)
	return found, all
}

// labelOf は、ペアリングしたホスト hostID の呼び名と、頼みの扱いが as-user か
func (ps *peerState) labelOf(hostID string) (string, bool) {
	ps.mu.Lock()
	defer ps.mu.Unlock()
	return ps.labelsLocked()[hostID], ps.known[hostID].Requests == requestsAsUser
}

// pairedAndAsUser は、ペアリングしたホストの id と、そのうち requests が as-user の物
func (ps *peerState) pairedAndAsUser() (known, asUser map[string]bool) {
	ps.mu.Lock()
	defer ps.mu.Unlock()
	known, asUser = map[string]bool{}, map[string]bool{}
	for id, r := range ps.known {
		known[id] = true
		if r.Requests == requestsAsUser {
			asUser[id] = true
		}
	}
	return known, asUser
}
