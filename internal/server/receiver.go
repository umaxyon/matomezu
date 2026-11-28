package server

// レシーバー: matomezu ペイロードを受けると定義で名乗ったアクション（core の receives）。
// アクションが返したレシーバー宛ての 1 通は、知らせの行列に乗せず、送ったバルクを書き終えて鍵を外したあとに、常駐がその場で順に行う（Perform）。
// 行うのは送り手（利用者か AI）で、封筒の id を Perform の番号にするので、同じ 1 通は二度行わず、前の答えを返す。
// レシーバーが断ったら、その 1 通が届かなかった結果の先（undelivered）を、送り手と同じ者で行う（それも断られたら捨てる）。送ったバルクはもう書き終えているので、送り手には返さない。
// 段数は、人も AI も挟まずに、レシーバーからレシーバーへ続いた段の数で、上限を超える 1 通は送らない（hopLimit）。AI の返事から行うレシーバーは 0 から数え直す。
// 1 つの頼みから広がって行うレシーバーの数の合計も receivesMax までで、超える 1 通は送らない（段数と同じ hop-limit）。
// レシーバーの run が返した AI 宛ては、行った AI 自身へなら AI ラリーに数えず、ほかの AI へなら、行った AI からの向きで数える。
//
// 返事: replyReceiver を書いた AI 宛ての 1 通を届けたら、その封筒の id と返事を受けるレシーバーを、受けた参加者の物として覚える（replies。メモリだけで、起動し直すと消える）。
// 受けた AI は send_message の replyTo と args で 1 回だけ返せ、常駐はその AI を行う者にレシーバーを行う（レシーバーが断ったら、覚えを残して断りを返す）

import (
	"encoding/json"
	"fmt"
	"os"
	"slices"
	"strconv"

	"github.com/umaxyon/matomezu/internal/engine"
)

// hopLimit は、人も AI も挟まずにレシーバーからレシーバーへ続けてよい段の数
const hopLimit = 20

// receivesMax は、1 つの頼みから広がって行ってよいレシーバーの数の合計（段数は深さしか抑えず、1 回の run が何通でも返せるため）
const receivesMax = 100

// repliesMax は、返事を待つ 1 通を覚えておく数（古い物から忘れる）
const repliesMax = 1000

// chain は、レシーバーを届いた 1 通から行う頼みの、その 1 通（received）と、そこまでの鎖（ほかの頼みでは空）
type chain struct {
	received   *engine.Received
	hops       int  // その 1 通の段数
	fromWindow bool // 窓から始まり、AI を挟まずに利用者のままの鎖か（レシーバーの run が返す物も、窓から送った物とみなす）
	spent      *int // 鎖の元の頼みから、ここまでに行うと決めたレシーバーの数（元の頼みでは nil）
}

// sendChain は、行ったバルクが返した matomezu ペイロードを送るときの、鎖の値
type sendChain struct {
	byWindow   bool // 窓から行ったか、窓から始まった利用者のままの鎖か
	inReceiver bool // レシーバーの run が返したか
	hops       int  // レシーバーの run なら、受けた 1 通の段数
	spent      *int // 鎖の元の頼みから、ここまでに行うと決めたレシーバーの数（元の頼みでは nil で、payloadDeliveries が作る）
}

// next は、バルクを窓から行ったか（byWindow）と鎖 c から、そのバルクが送る物の鎖の値を決める
func (c chain) next(byWindow bool) sendChain {
	return sendChain{byWindow: byWindow || c.fromWindow, inReceiver: c.received != nil, hops: c.hops, spent: c.spent}
}

// pendingReceive は、あとで行うレシーバー宛ての 1 通
type pendingReceive struct {
	envelope    string
	to          engine.ReceiverDestination
	args        json.RawMessage
	participant string // 送り手の AI の参加者の id（利用者なら空）
	from        engine.PayloadSender
	inReplyTo   string
	hops        int
	fromWindow  bool
	spent       *int
	undelivered *engine.ReceiverDestination
}

// replyWait は、返事を待つ AI 宛ての 1 通の、返事を受けるレシーバーと、受けた参加者の id
type replyWait struct {
	to        engine.ReceiverDestination
	recipient string
}

// receiveAll は、レシーバー宛ての 1 通 rs を前から順に行う（行った run が返したレシーバー宛ては後ろに足す。h.mu を持たずに呼ぶ）
func (h *Hub) receiveAll(rs []pendingReceive) {
	for len(rs) > 0 {
		_, more := h.receiveOne(rs[0])
		rs = append(rs[1:], more...)
	}
}

// receiveOne は、レシーバー宛ての 1 通 r を行い、結果と、その run が返したレシーバー宛ての 1 通を返す。断られたら、届かなかった結果の先を行う（h.mu を持たずに呼ぶ）
func (h *Hub) receiveOne(r pendingReceive) (Performed, []pendingReceive) {
	c := chain{received: &engine.Received{Envelope: r.envelope, From: r.from, InReplyTo: r.inReplyTo}, hops: r.hops, fromWindow: r.fromWindow, spent: r.spent}
	done, more, err := h.performOnce(receivePerform(r.to, r.args, r.participant, c, "envelope:"+r.envelope))
	if err != nil {
		done = Performed{OK: false, Reason: "refused", Detail: err.Error()}
	}
	if done.OK || r.undelivered == nil {
		return done, more
	}
	result := map[string]string{"envelope": r.envelope, "reason": done.Reason}
	if done.Detail != "" {
		result["detail"] = done.Detail
	}
	args, _ := json.Marshal(result)
	uc := chain{received: &engine.Received{Envelope: newEnvelopeID(), From: engine.PayloadSender{Kind: "matomezu"}}, hops: r.hops, fromWindow: r.fromWindow, spent: r.spent}
	told, umore, err := h.performOnce(receivePerform(*r.undelivered, args, r.participant, uc, "undelivered:"+r.envelope))
	if err != nil || !told.OK {
		fmt.Fprintf(os.Stderr, "%s the undelivered result of the envelope %s was not received by %s: %s %v\n", stamp(), r.envelope, r.undelivered.Receiver, told.Reason, err)
	}
	return done, append(more, umore...)
}

// receivePerform は、レシーバー to を、引数 args で、送り手（AI なら参加者 participant、空なら利用者）が鎖 c の 1 通から行う頼み（番号 key）
func receivePerform(to engine.ReceiverDestination, args json.RawMessage, participant string, c chain, key string) Perform {
	var on *engine.On
	if to.On != "" {
		on = &engine.On{Record: to.On}
	}
	if len(args) == 0 {
		args = json.RawMessage("null")
	}
	p := performOne(to.Receiver, args, on)
	p.Key = key
	p.chain = c
	if participant != "" {
		p.By = "ai"
		p.Participant = participant
	}
	return p
}

// replyBody は、AI 宛ての 1 通 d の、届く 1 行の本文。返事を受けるレシーバーがあれば、送り先の参加者の返事を待つ物として覚え、封筒の id を添える（h.mu を持って呼ぶ）
func (h *Hub) replyBody(d delivery) string {
	if d.reply == nil {
		return quote(d.envelope.Text)
	}
	h.keepReplyHeld(d.envelope.ID, replyWait{to: *d.reply, recipient: d.to})
	return quote(d.envelope.Text) + " (replyTo " + quote(d.envelope.ID) + ")"
}

// keepReplyHeld は、返事を待つ 1 通を覚える（repliesMax 件まで。古い物から忘れる。h.mu を持って呼ぶ）
func (h *Hub) keepReplyHeld(id string, w replyWait) {
	if h.replies == nil {
		h.replies = map[string]replyWait{}
	}
	h.forgetReplyHeld(id)
	h.replies[id] = w
	h.replyOrder = append(h.replyOrder, id)
	for len(h.replyOrder) > repliesMax {
		delete(h.replies, h.replyOrder[0])
		h.replyOrder = h.replyOrder[1:]
	}
}

// forgetReplyHeld は、返事を待つ 1 通 id を忘れる（h.mu を持って呼ぶ）
func (h *Hub) forgetReplyHeld(id string) {
	if _, ok := h.replies[id]; !ok {
		return
	}
	delete(h.replies, id)
	h.replyOrder = slices.DeleteFunc(h.replyOrder, func(o string) bool { return o == id })
}

// dropGoneRepliesHeld は、受けた参加者が退室した、返事を待つ 1 通を忘れる（行き場が無いので。h.mu を持って呼ぶ）
func (h *Hub) dropGoneRepliesHeld() {
	if len(h.replies) == 0 {
		return
	}
	records, err := h.participantsHeld()
	if err != nil {
		return
	}
	joined := map[string]bool{}
	for _, r := range records {
		if r.accepted() {
			joined[r.ID] = true
		}
	}
	for id, w := range h.replies {
		if !joined[w.recipient] {
			h.forgetReplyHeld(id)
		}
	}
}

// replyTo は、参加者 req.Participant が、封筒 req.ReplyTo に返事する（引数 req.Args で、返事を受けるレシーバーをその AI が行う）。
// 送り手が参加の確定した AI でないか、返事を待つ 1 通がその参加者宛てでなければ断る。レシーバーが断ったら、もう一度返せるように覚えを戻して、断りを返す
func (h *Hub) replyTo(req MessageRequest) (MessageSent, error) {
	records, err := h.records()
	if err != nil {
		return MessageSent{}, err
	}
	rooms, err := h.workrooms()
	if err != nil {
		return MessageSent{}, err
	}
	h.mu.Lock()
	sender, refused := h.senderHeld(records, h.occupants(records), req.Participant)
	if refused != nil {
		h.mu.Unlock()
		return *refused, nil
	}
	w, ok := h.replies[req.ReplyTo]
	if !ok || w.recipient != req.Participant {
		h.mu.Unlock()
		return MessageSent{Reason: "no-reply-wait", Detail: "no message to you waits for a reply with that replyTo (a message takes one reply)"}, nil
	}
	h.forgetReplyHeld(req.ReplyTo)
	h.mu.Unlock()
	done, more := h.receiveOne(pendingReceive{envelope: newEnvelopeID(), to: w.to, args: req.Args, participant: req.Participant,
		from: engine.PayloadSender{Kind: "ai", Workroom: roomName(rooms, sender.Workroom)}, inReplyTo: req.ReplyTo})
	h.receiveAll(more)
	if !done.OK {
		h.mu.Lock()
		h.keepReplyHeld(req.ReplyTo, w)
		h.mu.Unlock()
		return MessageSent{Reason: done.Reason, Detail: done.Detail}, nil
	}
	return MessageSent{OK: true, Result: done.Result}, nil
}

// receivesMaxDetail は、1 つの頼みから広がるレシーバーの数の上限を超える 1 通を断るときの、AI への説明
func receivesMaxDetail(receiver string) string {
	return "the payload to the receiver " + receiver + " would make more than " + strconv.Itoa(receivesMax) + " receivers run from one request; nothing was changed"
}

// hopLimitDetail は、段数の上限を超えるレシーバー宛ての 1 通を断るときの、AI への説明
func hopLimitDetail(receiver string) string {
	return "the payload to the receiver " + receiver + " would be passed on from receiver to receiver more than " + strconv.Itoa(hopLimit) + " times without a person or an AI; nothing was changed"
}
