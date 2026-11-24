package server

// AI 間メッセージ: 参加が確定した AI が、ほかのワークルームの参加者へ、利用者を介さずに送る文。郵便とは別物で、ブックもレコードも変えない。
// MCP の send_message はアクションを通さずに送り、レコードが対象のアクションの run が返して送ることもある（送り手は行った参加者。アクションバルクが通ったときだけ送る。actionEnvelopes）。
// 常駐は封筒（Envelope）を宛て先の参加者の、起こす知らせの行列に入れ、受け取られるまで持つ（watch.go）。宛て先は宛て先のホストが受けた時点の参加者で、その参加者が受け入れ済みでなくなったら捨てる（引き継いだ参加者には渡さない）。
// 送り手は呼び出しの参加の id から決め、引数では受けない（偽れない）。宛て先はワークルームの名前で指す。
// 封筒の形（id・送り手・宛て先・本文・送った時刻。送り手と宛て先はホスト id とワークルームの名前）は、マシンをまたいで運ぶときも変えない。id で重なりを見分け、同じ封筒は二度入れない
//
// host を付けると、ペアリングしたホストのワークルームへ運ぶ（peer_message.go）。アクションが返す AI 間メッセージは、ホストをまたがない
//
//	POST /api/ai/message {"to", "host"?, "text"}  {"ok": true, "queued": true}、または断った理由 {"ok": false, "reason", "detail"}
//	  断る理由: not-joined（送り手の参加が確定していない）・visitor（送り手がビジター）・unknown-recipient（その名前のワークルームが無いか、参加が確定した参加者がいない。detail に送れる名前）・to-self（自分のワークルーム）・
//	  unknown-host（その呼び名のペアリングしたホストが無い。detail に送れる呼び名）・unreachable（そのホストにつながらない）・host-closed（このホストが「ほかのホストとつなぐ」を切にしている）

import (
	"crypto/rand"
	"encoding/json"
	"fmt"
	"net/http"
	"slices"
	"strings"
	"time"

	"github.com/umaxyon/matomezu/internal/engine"
	"github.com/umaxyon/matomezu/internal/storage"
)

// Address は、AI 間メッセージの送り手か宛て先: どのホストの、どのワークルームか。宛て先の参加者は、宛て先のホストが受けたときに引く（送り手のホストは知らない）
type Address struct {
	Host     string `json:"host"`     // ホスト id（自分のホストも自分の id）
	Workroom string `json:"workroom"` // ワークルームの名前
}

// Envelope は、AI 間メッセージ 1 通
type Envelope struct {
	ID     string  `json:"id"`
	From   Address `json:"from"`
	To     Address `json:"to"`
	Text   string  `json:"text"`
	SentAt string  `json:"sentAt"`
}

// MessageRequest は AI 間メッセージを送る頼み。Participant は呼び出しに付いていた参加の id
type MessageRequest struct {
	To          string `json:"to"`
	Host        string `json:"host"` // 宛て先のホストの呼び名（ペアリングしたホスト。空なら自分のホスト）
	Text        string `json:"text"`
	Participant string `json:"-"`
}

// MessageSent は送った結果。断ったら OK は false で、Reason と Detail に理由
type MessageSent struct {
	OK     bool   `json:"ok"`
	Queued bool   `json:"queued,omitempty"`
	Reason string `json:"reason,omitempty"`
	Detail string `json:"detail,omitempty"`
}

// seenEnvelopesMax は、重なりを見分けるために覚えておく封筒の id の数
const seenEnvelopesMax = 1000

// occupants は、ワークルームの id → 参加が確定した（準備中でない）参加者の id（h.mu を持って呼ぶ）
func (h *Hub) occupants(records []participantRecord) map[string]string {
	occupant := map[string]string{}
	for _, r := range records {
		if r.State == stateJoined && r.Workroom != "" && h.participantNotes[r.ID].ready() {
			occupant[r.Workroom] = r.ID
		}
	}
	return occupant
}

// actionEnvelopes は、アクションバルクが返した AI 間メッセージ messages を、行った参加者から送る封筒にする（h.mu を持って呼ぶ）。
// 行ったのが参加の確定した AI でなければ、バルクを断る答えを返す。宛先が自分のワークルームか、宛先のワークルームに参加の確定した参加者がいなければ、
// noRecipient が skip のその 1 通は送らず、ほかはバルクを断る答えを返す
func (h *Hub) actionEnvelopes(messages []engine.AIMessage, actor *engine.Actor, now time.Time) ([]delivery, *Performed) {
	if len(messages) == 0 {
		return nil, nil
	}
	if actor == nil || actor.Kind != "ai" || actor.Workroom == "" {
		return nil, &Performed{OK: false, Reason: "not-joined", Detail: "only an AI whose request to join was accepted sends AI messages"}
	}
	records, err := h.participantsHeld()
	if err != nil {
		return nil, &Performed{OK: false, Reason: "refused", Detail: err.Error()}
	}
	rooms, err := h.workroomsHeld()
	if err != nil {
		return nil, &Performed{OK: false, Reason: "refused", Detail: err.Error()}
	}
	occupant := h.occupants(records)
	from := occupant[actor.Workroom]
	if from == "" {
		return nil, &Performed{OK: false, Reason: "not-joined", Detail: "only an AI whose request to join was accepted sends AI messages"}
	}
	self := h.selfHostID()
	envelopes := make([]delivery, 0, len(messages))
	for _, m := range messages {
		to := occupant[m.Workroom]
		name := roomName(rooms, m.Workroom)
		if m.Workroom == actor.Workroom || to == "" {
			if m.NoRecipient == "skip" {
				continue
			}
			if name == "" {
				name = m.Workroom
			}
			return nil, &Performed{OK: false, Reason: "no-recipient", Detail: "no other AI has joined the workroom " + name + " now, so the message to it cannot be sent; nothing was changed"}
		}
		envelopes = append(envelopes, delivery{to: to, envelope: Envelope{
			ID:     newEnvelopeID(),
			From:   Address{Host: self, Workroom: roomName(rooms, actor.Workroom)},
			To:     Address{Host: self, Workroom: name},
			Text:   m.Text,
			SentAt: storage.Stamp(now),
		}})
	}
	return envelopes, nil
}

// SendMessage は、参加者 req.Participant から、ワークルーム req.To の参加者へ AI 間メッセージを送る
func (h *Hub) SendMessage(req MessageRequest, now time.Time) (MessageSent, error) {
	records, err := h.records()
	if err != nil {
		return MessageSent{}, err
	}
	rooms, err := h.workrooms()
	if err != nil {
		return MessageSent{}, err
	}
	h.mu.Lock()
	occupant := h.occupants(records) // ワークルームの id → 参加が確定した（準備中でない）参加者の id
	from, refused := h.senderHeld(records, occupant, req.Participant)
	if refused == nil && req.Host != "" {
		// ほかのホストへは、常駐の鍵を放してから運ぶ（待つ間にほかの頼みを止めないため）
		name := roomName(rooms, from.Workroom)
		h.mu.Unlock()
		return h.sendToHost(name, req, now), nil
	}
	defer h.mu.Unlock()
	if refused != nil {
		return *refused, nil
	}
	var to *workroomRecord
	var open []string
	for i, room := range rooms {
		if _, ok := occupant[room.ID]; ok && room.ID != from.Workroom {
			open = append(open, room.Name)
		}
		if room.Name == req.To {
			to = &rooms[i]
		}
	}
	if to != nil && to.ID == from.Workroom {
		return MessageSent{Reason: "to-self", Detail: "that is your own workroom"}, nil
	}
	if to == nil || occupant[to.ID] == "" {
		slices.Sort(open)
		detail := "no AI is in a workroom named " + req.To
		if len(open) > 0 {
			detail += "; you can send to: " + strings.Join(open, ", ")
		} else {
			detail += "; no other AI is in a workroom now"
		}
		return MessageSent{Reason: "unknown-recipient", Detail: detail}, nil
	}
	self := h.selfHostID()
	h.deliver(delivery{to: occupant[to.ID], envelope: Envelope{
		ID:     newEnvelopeID(),
		From:   Address{Host: self, Workroom: roomName(rooms, from.Workroom)},
		To:     Address{Host: self, Workroom: to.Name},
		Text:   req.Text,
		SentAt: storage.Stamp(now),
	}})
	return MessageSent{OK: true, Queued: true}, nil
}

// delivery は、封筒と、それを入れる宛て先の参加者（宛て先のホストが引いた物）。ほかのホストから届いた物は、送り手のホストの呼び名と頼みの扱いも
type delivery struct {
	envelope Envelope
	to       string // 参加者の id
	host     string // 送り手のホストの呼び名（同じホストの中なら空）
	peer     string // 送り手のホスト id（同じホストの中なら空）
	asUser   bool   // 送り手のホストの頼みの扱いが as-user
}

// senderHeld は、参加者 participant が送り手になれるなら、その参加者のレコード。なれなければ断る答え（h.mu を持って呼ぶ）
func (h *Hub) senderHeld(records []participantRecord, occupant map[string]string, participant string) (*participantRecord, *MessageSent) {
	for i, r := range records {
		if r.Workroom != "" && occupant[r.Workroom] == r.ID && r.ID == participant {
			return &records[i], nil
		}
	}
	if h.actorOfParticipantHeld(participant).As == stateVisitor {
		return nil, &MessageSent{Reason: "visitor", Detail: "a visitor only reads: it cannot send messages to other AIs"}
	}
	return nil, &MessageSent{Reason: "not-joined", Detail: "only an AI whose request to join was accepted can send messages (call join first)"}
}

// deliver は、封筒 d.envelope を宛て先の参加者 d.to の行列に入れる。同じ id の封筒は二度入れない（h.mu を持って呼ぶ）
func (h *Hub) deliver(d delivery) {
	e := d.envelope
	if h.seenEnvelopes == nil {
		h.seenEnvelopes = map[string]bool{}
	}
	if h.seenEnvelopes[e.ID] {
		return
	}
	h.seenEnvelopes[e.ID] = true
	h.seenOrder = append(h.seenOrder, e.ID)
	if len(h.seenOrder) > seenEnvelopesMax {
		delete(h.seenEnvelopes, h.seenOrder[0])
		h.seenOrder = h.seenOrder[1:]
	}
	head := messageHead(e.From.Workroom)
	if d.peer != "" {
		head = remoteMessageHead(e.From.Workroom, d.host, d.asUser)
	}
	h.enqueueWake(wakeItem{participant: d.to, kind: wakeMessage, line: head + " " + quote(e.Text), head: head, body: quote(e.Text), peer: d.peer, asUser: d.asUser})
}

// messageHead は、AI 間メッセージの知らせの、送り手を名乗る頭（from は送り手のワークルーム名）。届く 1 行は、頭と本文。名前と本文は JSON の文字列にして包む
// （本文の改行と、本文の中の偽の知らせの行を見分けるため）。端末や会話には行が見えるので、前置きは送り手だけにする。返し方は参加の知らせと send_message の説明に任せる
func messageHead(from string) string {
	return "matomezu from AI " + quote(from) + ":"
}

// quote は、文字列を JSON の文字列にする（< > & を逃がさない）
func quote(s string) string {
	var b strings.Builder
	enc := json.NewEncoder(&b)
	enc.SetEscapeHTML(false)
	_ = enc.Encode(s)
	return strings.TrimSuffix(b.String(), "\n")
}

// newEnvelopeID は、封筒の id（uuid の形の乱数）
func newEnvelopeID() string {
	var b [16]byte
	_, _ = rand.Read(b[:])
	b[6] = b[6]&0x0f | 0x40
	b[8] = b[8]&0x3f | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
}

func (o Options) aiMessage(w http.ResponseWriter, r *http.Request) {
	var req MessageRequest
	if !readJSON(w, r, &req) {
		return
	}
	req.Participant = participantOf(r)
	done, err := o.Hub.SendMessage(req, time.Now())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, done)
}

// hostEnvelope は、常駐メッセージ 1 通の宛先の参加者と本文
type hostEnvelope struct {
	participant string
	text        string
}

// hostEnvelopes は、アクションバルクのフォローステップが返した常駐メッセージ messages の宛先を決める（h.mu を持って呼ぶ）。
// 宛先のワークルームに参加の確定した参加者がいないときと、宛先が行った参加者のワークルームのとき（行った AI は結果で知っている）は、その 1 通を送らない
func (h *Hub) hostEnvelopes(messages []engine.HostMessage, actor *engine.Actor) ([]hostEnvelope, error) {
	if len(messages) == 0 {
		return nil, nil
	}
	records, err := h.participantsHeld()
	if err != nil {
		return nil, err
	}
	occupant := h.occupants(records)
	out := []hostEnvelope{}
	for _, m := range messages {
		to := occupant[m.Workroom]
		if to == "" || (actor != nil && actor.Kind == "ai" && actor.Workroom == m.Workroom) {
			continue
		}
		out = append(out, hostEnvelope{participant: to, text: m.Text})
	}
	return out, nil
}

// deliverHost は、常駐メッセージ e を宛て先の参加者の行列に入れる（h.mu を持って呼ぶ）
func (h *Hub) deliverHost(e hostEnvelope) {
	h.enqueueWake(wakeItem{participant: e.participant, kind: wakeHost, line: hostLine(e.text)})
}

// hostLine は、常駐メッセージの届く 1 行。本文は JSON の文字列にして包む（本文の中の偽の知らせの行と見分けるため。本文はプラグインが書く）
func hostLine(text string) string {
	return "matomezu: " + quote(text)
}
