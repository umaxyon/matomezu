package server

// レシーバー: matomezu ペイロードを受けると定義で名乗ったアクション（core の receives）。
// アクションが返したレシーバー宛ての 1 通は、知らせの行列に乗せず、送ったバルクを書き終えて鍵を外したあとに、常駐がその場で順に行う（Perform）。
// 行うのは送り手（利用者か AI）で、封筒の id を Perform の番号にするので、同じ 1 通は二度行わず、前の答えを返す。
// レシーバーが断ったら、その 1 通が届かなかった結果の先（undelivered）を、送り手と同じ者で行う（それも断られたら捨てる）。送ったバルクはもう書き終えているので、送り手には返さない。
// 段数は、人も AI も挟まずに、レシーバーからレシーバーへ続いた段の数で、上限を超える 1 通は送らない（hopLimit）。AI の返事から行うレシーバーは 0 から数え直す。
//
// 返事: replyReceiver を書いた AI 宛ての 1 通を届けたら、その封筒の id と返事を受けるレシーバーを、受けた参加者の物として覚える（replies。メモリだけで、起動し直すと消える）。
// 受けた AI は send_message の replyTo と args で 1 回だけ返せ、常駐はその AI を行う者にレシーバーを行う（レシーバーが断ったら、覚えを残して断りを返す）

import (
	"encoding/json"
	"fmt"
	"os"
	"strconv"

	"github.com/umaxyon/matomezu/internal/engine"
)

// hopLimit は、人も AI も挟まずにレシーバーからレシーバーへ続けてよい段の数
const hopLimit = 20

// repliesMax は、返事を待つ 1 通を覚えておく数（古い物から忘れる）
const repliesMax = 1000

// chain は、レシーバーを届いた 1 通から行う頼みの、その 1 通（received）と、そこまでの鎖（ほかの頼みでは空）
type chain struct {
	received   *engine.Received
	hops       int  // その 1 通の段数
	fromWindow bool // 窓から始まり、AI を挟まずに利用者のままの鎖か（レシーバーの run が返す物も、窓から送った物とみなす）
}

// sendChain は、行ったバルクが返した matomezu ペイロードを送るときの、鎖の値
type sendChain struct {
	byWindow   bool // 窓から行ったか、窓から始まった利用者のままの鎖か
	inReceiver bool // レシーバーの run が返したか
	hops       int  // レシーバーの run なら、受けた 1 通の段数
}

// next は、バルクを窓から行ったか（byWindow）と鎖 c から、そのバルクが送る物の鎖の値を決める
func (c chain) next(byWindow bool) sendChain {
	return sendChain{byWindow: byWindow || c.fromWindow, inReceiver: c.received != nil, hops: c.hops}
}

// receive は、あとで行うレシーバー宛ての 1 通
type receive struct {
	envelope    string
	to          engine.ReceiverDestination
	args        json.RawMessage
	participant string // 送り手の AI の参加者の id（利用者なら空）
	from        engine.PayloadSender
	inReplyTo   string
	hops        int
	fromWindow  bool
	undelivered *engine.ReceiverDestination
}

// replyWait は、返事を待つ AI 宛ての 1 通の、返事を受けるレシーバーと、受けた参加者の id
type replyWait struct {
	to        engine.ReceiverDestination
	recipient string
}

// receiveAll は、レシーバー宛ての 1 通 rs を前から順に行う（行った run が返したレシーバー宛ては後ろに足す。h.mu を持たずに呼ぶ）
func (h *Hub) receiveAll(rs []receive) {
	for len(rs) > 0 {
		_, more := h.receiveOne(rs[0])
		rs = append(rs[1:], more...)
	}
}

// receiveOne は、レシーバー宛ての 1 通 r を行い、結果と、その run が返したレシーバー宛ての 1 通を返す。断られたら、届かなかった結果の先を行う（h.mu を持たずに呼ぶ）
func (h *Hub) receiveOne(r receive) (Performed, []receive) {
	c := chain{received: &engine.Received{Envelope: r.envelope, From: r.from, InReplyTo: r.inReplyTo}, hops: r.hops, fromWindow: r.fromWindow}
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
	uc := chain{received: &engine.Received{Envelope: newEnvelopeID(), From: engine.PayloadSender{Kind: "matomezu"}}, hops: r.hops, fromWindow: r.fromWindow}
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

// replyBody は、AI 宛ての封筒 e の、届く 1 行の本文。返事を受けるレシーバーがあれば、送り先の参加者 to の返事を待つ物として覚え、封筒の id を添える（h.mu を持って呼ぶ）
func (h *Hub) replyBody(e Envelope, to string) string {
	if e.Reply == nil {
		return quote(e.Text)
	}
	h.keepReplyHeld(e.ID, replyWait{to: *e.Reply, recipient: to})
	return quote(e.Text) + " (replyTo " + quote(e.ID) + ")"
}

// keepReplyHeld は、返事を待つ 1 通を覚える（repliesMax 件まで。古い物から忘れる。h.mu を持って呼ぶ）
func (h *Hub) keepReplyHeld(id string, w replyWait) {
	if h.replies == nil {
		h.replies = map[string]replyWait{}
	}
	if _, ok := h.replies[id]; !ok {
		h.replyOrder = append(h.replyOrder, id)
	}
	h.replies[id] = w
	for len(h.replyOrder) > repliesMax {
		delete(h.replies, h.replyOrder[0])
		h.replyOrder = h.replyOrder[1:]
	}
}

// replyTo は、参加者 req.Participant が、封筒 req.ReplyTo に返事する（引数 req.Args で、返事を受けるレシーバーをその AI が行う）。
// 返事を待つ 1 通がその参加者宛てでなければ断る。レシーバーが断ったら、もう一度返せるように覚えを戻して、断りを返す
func (h *Hub) replyTo(req MessageRequest) (MessageSent, error) {
	h.mu.Lock()
	w, ok := h.replies[req.ReplyTo]
	if !ok || w.recipient != req.Participant {
		h.mu.Unlock()
		return MessageSent{Reason: "no-reply-wait", Detail: "no message to you waits for a reply with that replyTo (a message takes one reply)"}, nil
	}
	from, err := h.senderRoomHeld(req.Participant)
	if err != nil {
		h.mu.Unlock()
		return MessageSent{}, err
	}
	delete(h.replies, req.ReplyTo)
	h.mu.Unlock()
	done, more := h.receiveOne(receive{envelope: newEnvelopeID(), to: w.to, args: req.Args, participant: req.Participant,
		from: engine.PayloadSender{Kind: "ai", Workroom: from}, inReplyTo: req.ReplyTo})
	h.receiveAll(more)
	if !done.OK {
		h.mu.Lock()
		h.keepReplyHeld(req.ReplyTo, w)
		h.mu.Unlock()
		return MessageSent{Reason: done.Reason, Detail: done.Detail}, nil
	}
	return MessageSent{OK: true, Result: done.Result}, nil
}

// senderRoomHeld は、参加者 id の入っているワークルームの名前（h.mu を持って呼ぶ）
func (h *Hub) senderRoomHeld(id string) (string, error) {
	records, err := h.participantsHeld()
	if err != nil {
		return "", err
	}
	rooms, err := h.workroomsHeld()
	if err != nil {
		return "", err
	}
	for _, r := range records {
		if r.ID == id {
			return roomName(rooms, r.Workroom), nil
		}
	}
	return "", nil
}

// hopLimitDetail は、段数の上限を超えるレシーバー宛ての 1 通を断るときの、AI への説明
func hopLimitDetail(receiver string) string {
	return "the payload to the receiver " + receiver + " would pass " + strconv.Itoa(hopLimit) + " receivers in a row without a person or an AI; nothing was changed"
}
