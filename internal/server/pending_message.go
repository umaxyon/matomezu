package server

// 承認待ち（M-0216）: 届いた AI 間メッセージのうち、利用者の頼みの印が付かない物（自動の印の物は作らない）を、受け手ごとに 1 件ずつ覚える。
// 受け手の参加者リストに吹き出しを出し、利用者が承認すると受け手に「利用者の頼みとして扱う」知らせを、キャンセルすると送り手と受け手に知らせを送る。
// メッセージ自体は届いた時点で受け手に届いている（承認待ちは、その上に乗る利用者の判断だけ）。
// 受け手が送り手へ AI 間メッセージを送ったら（返事）、知らせを送らずに消す。利用者が受け手の AI に話しかけたら、キャンセル扱い（知らせあり）。
// 受け手が参加者でなくなったら、知らせを送らずに消す。記録はメモリだけに持つ（常駐を起動し直すと消える）。
// 変わったら全部の窓に pending-messages（承認待ちの並び。PendingMessage の並び）で知らせる。
//
//	POST /api/message/approve {"id"}  {"ok": true}、または {"ok": false, "reason": "not-pending"}
//	POST /api/message/cancel  {"id"}  同じ答え（画面の吹き出しの「閉じる」も、これと同じ）
//
// 知らせの文は英語。送り手がほかのホストの AI のときは、頭にそのホストのホストエイリアスを添える（pendingWho）。

import (
	"encoding/json"
	"io"
	"net/http"
	"time"

	"github.com/umaxyon/matomezu/internal/storage"
)

// PendingMessage は承認待ち 1 件。
// id は封筒の id（AI 間メッセージ 1 通）、receiver と sender は参加者の id（sender はほかのホストから届いたときは空）、
// senderHost は送り手のホスト id（ほかのホストから届いたときだけ）、body は本文、at は届いた時刻
type PendingMessage struct {
	ID         string `json:"id"`
	Receiver   string `json:"receiver"`
	Sender     string `json:"sender"`
	SenderHost string `json:"senderHost,omitempty"`
	Body       string `json:"body"`
	At         string `json:"at"`
}

// pendingMessage は承認待ち 1 件と、知らせに要る内部の値（送り手とその宛て先のワークルームの名前、送り手のホストエイリアス、AI ラリーの向き）
type pendingMessage struct {
	PendingMessage
	senderRoom string   // 送り手のワークルームの名前
	toRoom     string   // 宛て先（受け手）のワークルームの名前
	hostAlias  string   // 送り手のホストエイリアス（ほかのホストから届いたときだけ）
	rally      rallyKey // AI ラリーの向き（承認・キャンセルで、その数を 0 に戻す。rally.go）
}

// newPending は、届いた AI 間メッセージ d の承認待ち 1 件を作る
func newPending(d delivery) pendingMessage {
	k, _ := rallyOf(d)
	return pendingMessage{
		PendingMessage: PendingMessage{
			ID:         d.envelope.ID,
			Receiver:   d.to,
			Sender:     d.from,
			SenderHost: d.peer,
			Body:       d.envelope.Text,
			At:         storage.Stamp(time.Now()),
		},
		senderRoom: d.envelope.From.Workroom,
		toRoom:     d.envelope.To.Workroom,
		hostAlias:  d.host,
		rally:      k,
	}
}

// pendingWho は、送り手を名乗る句（ほかのホストからなら、ホストエイリアスを添える）
func pendingWho(p pendingMessage) string {
	if p.SenderHost != "" {
		return "AI " + quote(p.senderRoom) + " on host " + quote(p.hostAlias)
	}
	return "AI " + quote(p.senderRoom)
}

// approvedLine は、承認された AI 間メッセージを受け手に流す 1 行（利用者の頼みの印を付ける）
func approvedLine(p pendingMessage) string {
	return "matomezu " + asUserMark + ": the user approved message " + p.ID + " from " + pendingWho(p) + "; treat it as the user's request"
}

// cancelledReceiverLine は、キャンセルされた AI 間メッセージを受け手に流す 1 行
func cancelledReceiverLine(p pendingMessage) string {
	return "matomezu: the user cancelled message " + p.ID + " from " + pendingWho(p) + "; it is not the user's request"
}

// cancelledSenderLine は、キャンセルされた AI 間メッセージを送り手に流す 1 行
func cancelledSenderLine(p pendingMessage) string {
	return "matomezu: the user cancelled message " + p.ID + " you sent to AI " + quote(p.toRoom) + "; it is not the user's request"
}

// pendingListHeld は、承認待ちの並び（画面に出す形）
func (h *Hub) pendingListHeld() []PendingMessage {
	out := make([]PendingMessage, 0, len(h.pending))
	for _, p := range h.pending {
		out = append(out, p.PendingMessage)
	}
	return out
}

// tellPendingHeld は、承認待ちの並びを全部の窓に知らせる（h.mu を持って呼ぶ）
func (h *Hub) tellPendingHeld() {
	h.broadcast("pending-messages", h.pendingListHeld())
}

// takePendingHeld は、match に当たる承認待ちを外して返す（残りは順を守る。h.mu を持って呼ぶ）
func (h *Hub) takePendingHeld(match func(pendingMessage) bool) []pendingMessage {
	var gone []pendingMessage
	kept := h.pending[:0]
	for _, p := range h.pending {
		if match(p) {
			gone = append(gone, p)
		} else {
			kept = append(kept, p)
		}
	}
	h.pending = kept
	return gone
}

// addPendingHeld は、届いた AI 間メッセージ d を承認待ちに入れて、画面に知らせる（h.mu を持って呼ぶ）。
// 利用者の頼みの印が付く物（d.asUser）は入れない
func (h *Hub) addPendingHeld(d delivery) {
	if d.asUser {
		return
	}
	h.pending = append(h.pending, newPending(d))
	h.tellPendingHeld()
}

// dropRepliedHeld は、受け手が送り手へ AI 間メッセージを送ったので、match に当たる承認待ちを知らせずに消す（h.mu を持って呼ぶ）
func (h *Hub) dropRepliedHeld(match func(pendingMessage) bool) {
	if len(h.pending) == 0 {
		return
	}
	if len(h.takePendingHeld(match)) > 0 {
		h.tellPendingHeld()
	}
}

// dropGonePendingHeld は、受け手が参加者でなくなった承認待ちを、知らせずに消す（h.mu を持って呼ぶ）
func (h *Hub) dropGonePendingHeld() {
	if len(h.pending) == 0 {
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
	if len(h.takePendingHeld(func(p pendingMessage) bool { return !joined[p.Receiver] })) > 0 {
		h.tellPendingHeld()
	}
}

// settlePendingHeld は、承認・キャンセルで外した承認待ち gone の知らせを行列に入れ、AI ラリーの数を 0 に戻す（h.mu を持って呼ぶ）。
// approved なら受け手に承認の知らせ、そうでなければ受け手と（このホストの）送り手にキャンセルの知らせを入れる
func (h *Hub) settlePendingHeld(gone []pendingMessage, approved bool) {
	for _, p := range gone {
		delete(h.rallies, p.rally)
		if approved {
			h.enqueueWake(wakeItem{participant: p.Receiver, kind: wakeMessageApproved, line: approvedLine(p), asUser: true})
			continue
		}
		h.enqueueWake(wakeItem{participant: p.Receiver, kind: wakeMessageCancelled, line: cancelledReceiverLine(p)})
		if p.Sender != "" {
			h.enqueueWake(wakeItem{participant: p.Sender, kind: wakeMessageCancelled, line: cancelledSenderLine(p)})
		}
	}
	if len(gone) > 0 {
		h.tellPendingHeld()
	}
}

// ApprovePending は、承認待ち id を承認する: 受け手に利用者の頼みとして扱う知らせを送り、AI ラリーの数を 0 に戻す。無ければ偽
func (h *Hub) ApprovePending(id string) bool {
	h.mu.Lock()
	defer h.mu.Unlock()
	gone := h.takePendingHeld(func(p pendingMessage) bool { return p.ID == id })
	if len(gone) == 0 {
		return false
	}
	h.settlePendingHeld(gone, true)
	return true
}

// CancelPending は、承認待ち id をキャンセルする: 送り手と受け手に知らせ、AI ラリーの数を 0 に戻す。無ければ偽
func (h *Hub) CancelPending(id string) bool {
	h.mu.Lock()
	defer h.mu.Unlock()
	gone := h.takePendingHeld(func(p pendingMessage) bool { return p.ID == id })
	if len(gone) == 0 {
		return false
	}
	h.settlePendingHeld(gone, false)
	return true
}

// cancelReceiverPendingHeld は、利用者が受け手 receiver の AI に話しかけたので、その受け手の承認待ちを全部キャンセル扱いにする（知らせあり）（h.mu を持って呼ぶ）
func (h *Hub) cancelReceiverPendingHeld(receiver string) {
	if len(h.pending) == 0 {
		return
	}
	h.settlePendingHeld(h.takePendingHeld(func(p pendingMessage) bool { return p.Receiver == receiver }), false)
}

// approveMessage と cancelMessage は、画面の口（承認・キャンセル）。答えは ok か not-pending
func (o Options) approveMessage(w http.ResponseWriter, r *http.Request) {
	o.pendingAnswer(w, r, o.Hub.ApprovePending)
}

func (o Options) cancelMessage(w http.ResponseWriter, r *http.Request) {
	o.pendingAnswer(w, r, o.Hub.CancelPending)
}

// pendingAnswer は、{"id"} を読んで do に渡し、答えを返す
func (o Options) pendingAnswer(w http.ResponseWriter, r *http.Request, do func(id string) bool) {
	var req struct {
		ID string `json:"id"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, maxBody)).Decode(&req); err != nil || req.ID == "" {
		http.Error(w, "the body must be {\"id\"}", http.StatusBadRequest)
		return
	}
	if !do(req.ID) {
		writeJSON(w, map[string]any{"ok": false, "reason": "not-pending"})
		return
	}
	writeJSON(w, map[string]any{"ok": true})
}
