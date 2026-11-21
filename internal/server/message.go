package server

// AI 間メッセージ: 参加が確定した AI が、ほかのワークルームの参加者へ、利用者を介さずに送る文。郵便とは別物で、ブックもレコードも変えない。
// MCP の send_message はアクションを通さずに送り、レコードが対象のアクションの run が返して送ることもある（送り手は行った参加者。アクションバルクが通ったときだけ送る。actionEnvelopes）。
// 常駐は封筒（Envelope）を宛て先の参加者の、起こす知らせの行列に入れ、受け取られるまで持つ（watch.go）。宛て先は送った時点の参加者で、その参加者が受け入れ済みでなくなったら捨てる（引き継いだ参加者には渡さない）。
// 送り手は呼び出しの参加の id から決め、引数では受けない（偽れない）。宛て先はワークルームの名前で指す。
// 封筒の形（id・送り手・宛て先・本文・送った時刻）は、マシンをまたいで運ぶときも変えない。id で重なりを見分け、同じ封筒は二度入れない
//
//	POST /api/ai/message {"to", "text"}  {"ok": true, "queued": true}、または断った理由 {"ok": false, "reason", "detail"}
//	  断る理由: not-joined（送り手の参加が確定していない）・visitor（送り手がビジター）・unknown-recipient（その名前のワークルームが無いか、参加が確定した参加者がいない。detail に送れる名前）・to-self（自分のワークルーム）

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

// Address は、AI 間メッセージの送り手か宛て先: どのワークルームの、どの参加者か
type Address struct {
	Workroom    string `json:"workroom"`    // ワークルームの名前
	Participant string `json:"participant"` // 参加者の id
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
func (h *Hub) actionEnvelopes(messages []engine.AIMessage, actor *engine.Actor, now time.Time) ([]Envelope, *Performed) {
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
	envelopes := make([]Envelope, 0, len(messages))
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
		envelopes = append(envelopes, Envelope{
			ID:     newEnvelopeID(),
			From:   Address{Workroom: roomName(rooms, actor.Workroom), Participant: from},
			To:     Address{Workroom: name, Participant: to},
			Text:   m.Text,
			SentAt: storage.Stamp(now),
		})
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
	defer h.mu.Unlock()
	var from *participantRecord
	occupant := h.occupants(records) // ワークルームの id → 参加が確定した（準備中でない）参加者の id
	for i, r := range records {
		if r.Workroom != "" && occupant[r.Workroom] == r.ID && r.ID == req.Participant {
			from = &records[i]
		}
	}
	if from == nil {
		if h.actorOfParticipantHeld(req.Participant).As == stateVisitor {
			return MessageSent{Reason: "visitor", Detail: "a visitor only reads: it cannot send messages to other AIs"}, nil
		}
		return MessageSent{Reason: "not-joined", Detail: "only an AI whose request to join was accepted can send messages (call join first)"}, nil
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
	h.deliver(Envelope{
		ID:     newEnvelopeID(),
		From:   Address{Workroom: roomName(rooms, from.Workroom), Participant: from.ID},
		To:     Address{Workroom: to.Name, Participant: occupant[to.ID]},
		Text:   req.Text,
		SentAt: storage.Stamp(now),
	})
	return MessageSent{OK: true, Queued: true}, nil
}

// deliver は、封筒 e を宛て先の参加者の行列に入れる。同じ id の封筒は二度入れない（h.mu を持って呼ぶ）
func (h *Hub) deliver(e Envelope) {
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
	h.enqueueWake(wakeItem{participant: e.To.Participant, kind: wakeMessage, line: messageLine(e), from: e.From.Workroom})
}

// messageLine は、届く 1 行。名前と本文は JSON の文字列にして包む（本文の改行と、本文の中の偽の知らせの行を見分けるため）。
// 封筒の id の頭 8 字を添える（渡せたのに結果が常駐に届かなかった知らせは、もう一度渡るので、受け手が重なりに気づけるように）。
// 端末では行の頭しか見えないので、前置きは短くして本文を早く出す。返し方の詳しい説明は send_message の説明に任せる
func messageLine(e Envelope) string {
	return "matomezu from AI " + quote(e.From.Workroom) + " (reply -> send_message, id " + shortID(e.ID) + "): " + quote(e.Text)
}

// shortID は、封筒の id の頭 8 字（重なりに気づくのに足りる長さ）
func shortID(id string) string {
	if len(id) <= 8 {
		return id
	}
	return id[:8]
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
