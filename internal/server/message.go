package server

// AI 間メッセージ: 参加が確定した AI が、ほかのワークルームの参加者へ、利用者を介さずに送る文。郵便とは別物で、ブックもレコードも変えない。
// MCP の send_message はアクションを通さずに送り、レコードが対象のアクションの run が返す matomezu ペイロードのうち、AI が送り手の物も AI 間メッセージになる（送り手は行った参加者。アクションバルクが通ったときだけ送る。payloadDeliveries。利用者が送り手の物は AI 間メッセージでなく、同じ封筒で送り先に届ける）。
// 常駐は封筒（Envelope）を送り先の参加者の、起こす知らせの行列に入れ、受け取られるまで持つ（watch.go）。送り先は送り先のホストが受けた時点の参加者で、その参加者が受け入れ済みでなくなったら捨てる（引き継いだ参加者には渡さない）。
// 送り手は呼び出しの参加の id から決め、引数では受けない（偽れない）。送り先はワークルームの名前で指す。
// 封筒の形（id・送り手・送り先・本文・送った時刻。送り手と送り先はホスト id とワークルームの名前）は、マシンをまたいで運ぶときも変えない。id で重なりを見分け、同じ封筒は二度入れない
//
// host を付けると、ペアリングしたホストのワークルームへ運ぶ（peer_message.go）。アクションが返す matomezu ペイロードは、ホストをまたがない
//
//	POST /api/ai/message {"to", "host"?, "text"}  {"ok": true, "queued": true}、または断った理由 {"ok": false, "reason", "detail"}
//	  断る理由: not-joined（送り手の参加が確定していない）・visitor（送り手がビジター）・unknown-recipient（その名前のワークルームが無いか、参加が確定した参加者がいない。detail に送れる名前）・to-self（自分のワークルーム）・
//	  unknown-host（そのホストエイリアスのペアリングしたホストが無い。detail に送れるホストエイリアス）・unreachable（そのホストにつながらないか、相手が受けなかった。届いていない）・protocol-mismatch（そのホストと常駐間通信プロトコルの版が合わない。届いていない。detail にどちらを更新するか）・no-answer（2 回送って答えが無い。届いたかもしれない）・host-closed（このホストが「ほかのホストとつなぐ」を切にしている）

import (
	"crypto/rand"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/umaxyon/matomezu/internal/aiwire"
	"github.com/umaxyon/matomezu/internal/engine"
	"github.com/umaxyon/matomezu/internal/storage"
)

// Address は、AI 間メッセージの送り手か送り先: どのホストの、どのワークルームか。送り先の参加者は、送り先のホストが受けたときに引く（送り手のホストは知らない）
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
	Rally  int     `json:"rally,omitempty"` // ほかのホストへ送る物の、送り手の AI の利用者トリガートークの後に、その送り先へ送った何通目か（rally.go。載せないホストもある）
	// Cancel は、ほかのホストへ運ぶ、キャンセルの知らせの封筒だけが持つ: 送り先（送り手の AI）が送った封筒の、利用者がキャンセルした id。Text はその本文の頭（pending_message.go）
	Cancel string `json:"cancel,omitempty"`
	// Reply は、返事を受けるレシーバー（アクションが返した、replyReceiver を書いた matomezu ペイロードだけ。受けた AI は send_message の replyTo で 1 回だけ返せる。receiver.go）
	Reply *engine.ReceiverDestination `json:"reply,omitempty"`
}

// MessageRequest は AI 間メッセージを送る頼み。Participant は呼び出しに付いていた参加の id
type MessageRequest struct {
	To   string `json:"to"`
	Host string `json:"host"` // 送り先のホストエイリアス（ペアリングしたホスト。空なら自分のホスト）
	Text string `json:"text"`
	// ReplyTo は、返事なら、返す元の封筒の id（To・Host・Text は使わず、Args をその 1 通の返事を受けるレシーバーの引数にする。receiver.go）
	ReplyTo     string          `json:"replyTo,omitempty"`
	Args        json.RawMessage `json:"args,omitempty"`
	Participant string          `json:"-"`
}

// MessageSent は送った結果。断ったら OK は false で、Reason と Detail に理由
type MessageSent struct {
	OK       bool   `json:"ok"`
	Queued   bool   `json:"queued,omitempty"`
	Delivers string `json:"delivers,omitempty"` // 受けたとき: aiwire.DeliversNow・aiwire.DeliversNextCall・aiwire.DeliversUnknown
	Reason   string `json:"reason,omitempty"`
	Detail   string `json:"detail,omitempty"`
	// Result は、返事を受けたレシーバーの結果（返事のときだけ）
	Result json.RawMessage `json:"result,omitempty"`
}

// deliversTo は、参加者 id に受けた AI 間メッセージが、いつ渡るか（h.mu を持って呼ぶ）
func (h *Hub) deliversTo(id string) string {
	if h.wakeReachLocked(id) == engine.WakeReaches {
		return aiwire.DeliversNow
	}
	return aiwire.DeliversNextCall
}

// queuedFor は、参加者 id への AI 間メッセージを受けた答え（h.mu を持って呼ぶ）
func (h *Hub) queuedFor(id string) MessageSent {
	return MessageSent{OK: true, Queued: true, Delivers: h.deliversTo(id)}
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

// payloadDeliveries は、アクションバルクが返した matomezu ペイロード payloads を、行った者（AI なら参加者 participant）から送る封筒と、あとで行うレシーバー宛ての 1 通にする（h.mu を持って呼ぶ）。
// 行ったのが、画面の利用者（sc.byWindow）でも、参加の確定した AI でもなければ、バルクを断る答えを返す（常駐が利用者として行うアクションは送れない）。
// ワークルーム宛てで、参加の確定したほかの参加者がいない（Participant を書いたなら、その参加者でない）とき、AI ラリーの上限を超えるとき、
// レシーバー宛てで段数の上限を超えるとき、NoRecipient が skip のその 1 通は送らず、ほかはバルクを断る答えを返す（AI ラリーなら送り先には止めた事を知らせる。rally.go）。
// 利用者が送り手の物は、利用者の頼みの印を付け、AI ラリーに数えない。レシーバーの run が返した AI 宛ても、AI ラリーに数えない（段数で止める）
func (h *Hub) payloadDeliveries(payloads []engine.Payload, actor *engine.Actor, participant string, sc sendChain, now time.Time) ([]delivery, []receive, *Performed) {
	if len(payloads) == 0 {
		return nil, nil, nil
	}
	fromUser := actor == nil || actor.Kind != "ai"
	if fromUser && !sc.byWindow {
		return nil, nil, &Performed{OK: false, Reason: "refused", Detail: "only the user on a screen or an AI whose request to join was accepted sends payloads"}
	}
	if !fromUser && actor.Workroom == "" {
		return nil, nil, &Performed{OK: false, Reason: "not-joined", Detail: "only an AI whose request to join was accepted sends AI messages"}
	}
	records, err := h.participantsHeld()
	if err != nil {
		return nil, nil, &Performed{OK: false, Reason: "refused", Detail: err.Error()}
	}
	rooms, err := h.workroomsHeld()
	if err != nil {
		return nil, nil, &Performed{OK: false, Reason: "refused", Detail: err.Error()}
	}
	occupant := h.occupants(records)
	from, fromRoom, asUser := "", "", true
	sender := engine.PayloadSender{Kind: "user"}
	if !fromUser {
		from = occupant[actor.Workroom]
		if from == "" {
			return nil, nil, &Performed{OK: false, Reason: "not-joined", Detail: "only an AI whose request to join was accepted sends AI messages"}
		}
		fromRoom = actor.Workroom
		asUser = h.adminWorkroomHeld(actor.Workroom)
		sender = engine.PayloadSender{Kind: "ai", Workroom: roomName(rooms, fromRoom)}
	}
	self := h.selfHostID()
	envelopes := make([]delivery, 0, len(payloads))
	var receives []receive
	ahead := map[string]int{} // 送り先の参加者ごとの、このバルクで先に送る数
	for _, m := range payloads {
		if m.To.Receiver != "" {
			hops := 0
			if sc.inReceiver {
				hops = sc.hops + 1
			}
			if hops > hopLimit {
				if m.NoRecipient == "skip" {
					continue
				}
				return nil, nil, &Performed{OK: false, Reason: "hop-limit", Detail: hopLimitDetail(m.To.Receiver)}
			}
			receives = append(receives, receive{envelope: m.ID, to: engine.ReceiverDestination{Receiver: m.To.Receiver, On: m.To.On}, args: m.Args,
				participant: participant, from: sender, hops: hops, fromWindow: fromUser, undelivered: m.Undelivered})
			continue
		}
		room := roomIDByName(rooms, m.To.Workroom)
		to := occupant[room]
		if room == "" || room == fromRoom || to == "" || (m.To.Participant != "" && m.To.Participant != to) {
			if m.NoRecipient == "skip" {
				continue
			}
			return nil, nil, &Performed{OK: false, Reason: "no-recipient", Detail: "no other AI has joined the workroom " + m.To.Workroom + " now, so the payload to it cannot be sent; nothing was changed"}
		}
		d := delivery{to: to, from: from, asUser: asUser, fromUser: fromUser, unrallied: sc.inReceiver, envelope: Envelope{
			ID:     newEnvelopeID(),
			From:   Address{Host: self, Workroom: roomName(rooms, fromRoom)},
			To:     Address{Host: self, Workroom: m.To.Workroom},
			Text:   m.Text,
			SentAt: storage.Stamp(now),
			Reply:  m.ReplyReceiver,
		}}
		if !fromUser && !sc.inReceiver && h.rallyOver(d, ahead[to]) {
			h.rallyStop(d)
			if m.NoRecipient == "skip" {
				continue
			}
			return nil, nil, &Performed{OK: false, Reason: "rally-limit", Detail: rallyStoppedDetail(m.To.Workroom, rallyLocalLimit) + "; nothing was changed"}
		}
		ahead[to]++
		envelopes = append(envelopes, d)
	}
	return envelopes, receives, nil
}

// roomIDByName は、名前が name のワークルームの id（無ければ空）
func roomIDByName(rooms []workroomRecord, name string) string {
	for _, r := range rooms {
		if r.Name == name {
			return r.ID
		}
	}
	return ""
}

// SendMessage は、参加者 req.Participant から、ワークルーム req.To の参加者へ AI 間メッセージを送る
func (h *Hub) SendMessage(req MessageRequest, now time.Time) (MessageSent, error) {
	if req.ReplyTo != "" {
		return h.replyTo(req)
	}
	records, err := h.records()
	if err != nil {
		return MessageSent{}, err
	}
	rooms, err := h.workrooms()
	if err != nil {
		return MessageSent{}, err
	}
	held := h.sendHeld(records, rooms, req, now)
	switch {
	case held.toHost:
		// ほかのホストへは、常駐の鍵を放してから運ぶ（待つ間にほかの頼みを止めないため）
		return h.sendToHost(held.from, held.fromID, req, now), nil
	case held.noRecipient:
		return MessageSent{Reason: "unknown-recipient", Detail: h.noRecipientDetail(req.To, held.open)}, nil
	}
	return held.sent, nil
}

// sendHeld の答え: 決まった答え sent か、ほかのホストへ運ぶ（toHost。送り手のワークルームの名前 from）か、送り先がいない（noRecipient。このホストの送れる先 open）
type sendDecision struct {
	sent        MessageSent
	toHost      bool
	from        string
	fromID      string // ほかのホストへ運ぶ送り手の参加者の id
	noRecipient bool
	open        []string
}

// sendHeld は、h.mu を持って、送り手を確かめ、このホストの送り先に届けるか、h.mu の外でする事を返す（断りの句は写しを読むので、鍵を放してから作る）
func (h *Hub) sendHeld(records []participantRecord, rooms []workroomRecord, req MessageRequest, now time.Time) sendDecision {
	h.mu.Lock()
	defer h.mu.Unlock()
	occupant := h.occupants(records) // ワークルームの id → 参加が確定した（準備中でない）参加者の id
	from, refused := h.senderHeld(records, occupant, req.Participant)
	if refused != nil {
		return sendDecision{sent: *refused}
	}
	if req.Host != "" {
		return sendDecision{toHost: true, from: roomName(rooms, from.Workroom), fromID: from.ID}
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
		return sendDecision{sent: MessageSent{Reason: "to-self", Detail: "that is your own workroom"}}
	}
	if to == nil || occupant[to.ID] == "" {
		return sendDecision{noRecipient: true, open: open}
	}
	self := h.selfHostID()
	if !h.deliver(delivery{to: occupant[to.ID], from: from.ID, asUser: h.adminWorkroomHeld(from.Workroom), envelope: Envelope{
		ID:     newEnvelopeID(),
		From:   Address{Host: self, Workroom: roomName(rooms, from.Workroom)},
		To:     Address{Host: self, Workroom: to.Name},
		Text:   req.Text,
		SentAt: storage.Stamp(now),
	}}) {
		return sendDecision{sent: rallyRefusal(to.Name, rallyLocalLimit)}
	}
	return sendDecision{sent: h.queuedFor(occupant[to.ID])}
}

// delivery は、封筒と、それを入れる送り先の参加者（送り先のホストが引いた物）。ほかのホストから届いた物は、送り手のホストエイリアスと、印を付けるか（requests が as-user か）も
type delivery struct {
	envelope Envelope
	to       string // 参加者の id
	from     string // 送り手の参加者の id（ほかのホストから届いた物は空）
	host     string // 送り手のホストエイリアス（同じホストの中なら空）
	peer     string // 送り手のホスト id（同じホストの中なら空）
	asUser   bool   // 利用者の頼みの印を付けるか（送り手のホストの requests が as-user か、送り手がこのホストの管理者か利用者）
	fromUser bool   // 送り手が画面の利用者か（AI ラリーに数えず、送り先の AI ラリーの数を 0 に戻す）
	// unrallied は、レシーバーの run が返した AI 宛てか（AI ラリーに数えない。段数で止める）
	unrallied bool
	limit     int // ほかのホストから届いた物の、AI ラリーの上限（送り手のホストの rallyLimit）
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

// markSeenHeld は、封筒の id を入れた物として覚え（seenEnvelopesMax 件まで。古い物から忘れる）、初めて見た id なら真を返す（h.mu を持って呼ぶ）
func (h *Hub) markSeenHeld(id string) bool {
	if h.seenEnvelopes == nil {
		h.seenEnvelopes = map[string]bool{}
	}
	if h.seenEnvelopes[id] {
		return false
	}
	h.seenEnvelopes[id] = true
	h.seenOrder = append(h.seenOrder, id)
	if len(h.seenOrder) > seenEnvelopesMax {
		delete(h.seenEnvelopes, h.seenOrder[0])
		h.seenOrder = h.seenOrder[1:]
	}
	return true
}

// deliver は、封筒 d.envelope を送り先の参加者 d.to の行列に入れる。同じ id の封筒は二度入れない。
// AI ラリーの上限を超える物は入れずに偽を返す（rally.go）（h.mu を持って呼ぶ）
func (h *Hub) deliver(d delivery) bool {
	e := d.envelope
	if h.seenEnvelopes[e.ID] {
		return true
	}
	if d.fromUser {
		h.markSeenHeld(e.ID)
		if records, err := h.participantsHeld(); err == nil {
			joined := map[string]bool{}
			for _, r := range records {
				if r.accepted() {
					joined[r.ID] = true
				}
			}
			h.rallyReset(d.to, joined)
		}
		head := userPayloadHead()
		body := h.replyBody(e, d.to)
		h.enqueueWake(wakeItem{participant: d.to, kind: wakeMessage, line: head + " " + body, head: head, body: body, asUser: true})
		return true
	}
	if !d.unrallied && !h.rallyPasses(d) {
		return false
	}
	h.markSeenHeld(e.ID)
	head := messageHead(e.From.Workroom, d.asUser)
	if d.peer != "" {
		head = remoteMessageHead(e.From.Workroom, d.host, d.asUser)
	}
	body := h.replyBody(e, d.to)
	h.enqueueWake(wakeItem{participant: d.to, kind: wakeMessage, line: head + " " + body, head: head, body: body, peer: d.peer, asUser: d.asUser})
	h.addPendingHeld(d)
	return true
}

// messageHead は、同じホストの AI 間メッセージの知らせの、送り手を名乗る頭（from は送り手のワークルーム名。asUser は送り手が、このホストの管理者なら true で、利用者の頼みの印を付ける）。
// 届く 1 行は、頭と本文。名前と本文は JSON の文字列にして包む
// （本文の改行と、本文の中の偽の知らせの行を見分けるため）。端末や会話には行が見えるので、前置きは送り手だけにする。返し方は参加の知らせと send_message の説明に任せる
func messageHead(from string, asUser bool) string {
	head := "matomezu from AI " + quote(from)
	if asUser {
		head += " " + asUserMark
	}
	return head + ":"
}

// userPayloadHead は、画面の利用者が行ったアクションが送った matomezu ペイロードの知らせの頭（送り手は利用者で、利用者の頼みの印を付ける）
func userPayloadHead() string {
	return "matomezu from the user " + asUserMark + ":"
}

// adminWorkroomHeld は、ワークルーム id が、このホストの管理者のワークルームか（管理者の印が指す。同じホストの管理者の AI 間メッセージに利用者の頼みの印を付けるかに使う）。h.mu を持って呼ぶ
func (h *Hub) adminWorkroomHeld(id string) bool {
	admin, err := h.engine.IsAdminWorkroom(id, recordSource{h})
	return err == nil && admin
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

// hostEnvelope は、常駐メッセージ 1 通の送り先の参加者と本文
type hostEnvelope struct {
	participant string
	text        string
}

// hostEnvelopes は、アクションバルクのフォローステップが返した常駐メッセージ messages の送り先を決める（h.mu を持って呼ぶ）。
// 送り先のワークルームに参加の確定した参加者がいないときと、送り先が行った参加者のワークルームのとき（行った AI には、エンジンが結果の notice で渡す）は、その 1 通を送らない
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

// deliverHost は、常駐メッセージ e を送り先の参加者の行列に入れる（h.mu を持って呼ぶ）
func (h *Hub) deliverHost(e hostEnvelope) {
	h.enqueueWake(wakeItem{participant: e.participant, kind: wakeHost, line: hostLine(e.text)})
}

// hostLine は、常駐メッセージの届く 1 行。本文は JSON の文字列にして包む（本文の中の偽の知らせの行と見分けるため。本文はプラグインが書く）
func hostLine(text string) string {
	return "matomezu: " + quote(text)
}

// noRecipientDetail は、名前 name のワークルームに AI がいないときの断りの句: このホストの送れる先 open（最近の数件と残りの数）と、
// その名前のワークルームのあるペアリングしたホスト
func (h *Hub) noRecipientDetail(name string, open []string) string {
	detail := "no AI is in a workroom named " + name + " on this host; " + h.sendableClause(open, "list_workrooms with offset", "no other AI is in a workroom now")
	if hosts := h.hostsWithRoom(name); len(hosts) > 0 {
		detail += "; a workroom named " + name + " is on the paired host " + strings.Join(hosts, ", ") + " (send it with host)"
	}
	return detail
}
