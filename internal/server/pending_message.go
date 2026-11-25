package server

// 承認待ち: ほかのホストから届いた AI 間メッセージのうち、利用者の頼みの印が付かない物を、届いた 1 通ごとに覚える。
// 同じホストの中の AI 間メッセージは承認待ちにしない（自由にやり取りさせる）。
// 受け手の参加者リストに吹き出しを出し、利用者が承認すると受け手に「利用者の頼みとして扱う」知らせを、キャンセルすると送り手と受け手に知らせを送る。
// メッセージ自体は届いた時点で受け手に届いている（承認待ちは、その上に乗る利用者の判断だけ）。
// 受け手が送り手へ AI 間メッセージを送ったら（返事。peer_message.go）、知らせを送らずに消す。利用者が受け手の AI に話しかけても消さない（承認のつもりの話しかけもあるので）。
// 受け手が参加者でなくなったら、知らせを送らずに消す。記録はメモリだけに持つ（常駐を起動し直すと消える）。
// 受け手 1 人の承認待ちは wakeQueueMax 件までで、超えたら古い物から知らせずに捨てる。
// 変わったら全部の窓に pending-messages（承認待ちの並び。PendingMessage の並び）で知らせる。
//
//	POST /api/message/approve {"id"}  {"ok": true}、または {"ok": false, "reason": "not-pending"}
//	POST /api/message/cancel  {"id"}  同じ答え
//
// 知らせの文は英語で、送り手のホストのホストエイリアスを添える（pendingWho）。
// キャンセルは、取り消す封筒の id（Envelope.Cancel）と本文の頭を載せた封筒で送り手のホストへ運び、
// そのホストが送り手に知らせる（sendCancelToHost・receiveCancelHeld）。

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"

	"github.com/umaxyon/matomezu/internal/storage"
)

// PendingMessage は承認待ち 1 件（ほかのホストから届いた AI 間メッセージ 1 通）。
// id は封筒の id、receiver は受け手の参加者の id、senderRoom は送り手のワークルームの名前、
// senderHost は送り手のホスト id で senderHostName はそのホストエイリアス、body は本文、at は届いた時刻
type PendingMessage struct {
	ID             string `json:"id"`
	Receiver       string `json:"receiver"`
	SenderRoom     string `json:"senderRoom"`
	SenderHost     string `json:"senderHost"`
	SenderHostName string `json:"senderHostName"`
	Body           string `json:"body"`
	At             string `json:"at"`
}

// pendingMessage は承認待ち 1 件と、知らせに要る内部の値（宛て先のワークルームの名前、AI ラリーの向き）
type pendingMessage struct {
	PendingMessage
	toRoom string   // 宛て先（受け手）のワークルームの名前
	rally  rallyKey // AI ラリーの向き（承認・キャンセルで、その数を 0 に戻す。rally.go）
}

// newPending は、届いた AI 間メッセージ d の承認待ち 1 件を作る
func newPending(d delivery) pendingMessage {
	k, _ := rallyOf(d)
	return pendingMessage{
		PendingMessage: PendingMessage{
			ID:             d.envelope.ID,
			Receiver:       d.to,
			SenderRoom:     d.envelope.From.Workroom,
			SenderHost:     d.peer,
			SenderHostName: d.host,
			Body:           d.envelope.Text,
			At:             storage.Stamp(time.Now()),
		},
		toRoom: d.envelope.To.Workroom,
		rally:  k,
	}
}

// pendingWho は、送り手を名乗る句（ホストエイリアスを添える）
func pendingWho(p pendingMessage) string {
	return "AI " + quote(p.SenderRoom) + " on host " + quote(p.SenderHostName)
}

// gistMax は、承認・キャンセルの知らせに添える本文の頭の長さ（字）。AI 間メッセージの行には封筒の id が無いので、どの 1 通かを本文で示す
const gistMax = 60

// gistOf は、本文 body の頭（gistMax 字まで。長ければ … で切る）
func gistOf(body string) string {
	if r := []rune(body); len(r) > gistMax {
		return string(r[:gistMax]) + "…"
	}
	return body
}

// approvedLine は、承認された AI 間メッセージを受け手に流す 1 行（利用者の頼みの印を付ける）。本文の頭は JSON の文字列にして包む（本文の中の偽の行を見分けるため）
func approvedLine(p pendingMessage) string {
	return "matomezu " + asUserMark + ": the user approved message " + p.ID + " from " + pendingWho(p) + ": " + quote(gistOf(p.Body)) + "; treat it as the user's request"
}

// cancelledReceiverLine は、キャンセルされた AI 間メッセージを受け手に流す 1 行
func cancelledReceiverLine(p pendingMessage) string {
	return "matomezu: the user cancelled message " + p.ID + " from " + pendingWho(p) + ": " + quote(gistOf(p.Body)) + "; it is not the user's request"
}

// cancelledSenderLine は、キャンセルされた AI 間メッセージ id（本文の頭 gist）を送り手に流す 1 行（to は宛て先のワークルームの名前、host はそのホストのホストエイリアス）
func cancelledSenderLine(id, gist, to, host string) string {
	return "matomezu: the user cancelled message " + id + " you sent to AI " + quote(to) + " on host " + quote(host) + ": " + quote(gist) + "; it is not the user's request"
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
// 入れるのは、ほかのホストから届いて、利用者の頼みの印が付かない物だけ。受け手 1 人の分が wakeQueueMax 件を超えたら、その受け手の古い物から知らせずに捨てる
func (h *Hub) addPendingHeld(d delivery) {
	if d.peer == "" || d.asUser {
		return
	}
	h.pending = append(h.pending, newPending(d))
	n := 0
	for _, p := range h.pending {
		if p.Receiver == d.to {
			n++
		}
	}
	for over := n - wakeQueueMax; over > 0; over-- {
		for i, p := range h.pending {
			if p.Receiver == d.to {
				h.pending = append(h.pending[:i], h.pending[i+1:]...)
				break
			}
		}
	}
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
// approved なら受け手に承認の知らせ、そうでなければ受け手にキャンセルの知らせを入れ、送り手のホストへキャンセルを封筒で運ぶ
func (h *Hub) settlePendingHeld(gone []pendingMessage, approved bool) {
	for _, p := range gone {
		delete(h.rallies, p.rally)
		if approved {
			h.enqueueWake(wakeItem{participant: p.Receiver, kind: wakeMessageApproved, line: approvedLine(p), asUser: true})
			continue
		}
		h.enqueueWake(wakeItem{participant: p.Receiver, kind: wakeMessageCancelled, line: cancelledReceiverLine(p)})
		// 封筒は、常駐の鍵を放したところで運ぶ（ほかのホストの答えを、鍵を持ったまま待たない）
		go h.sendCancelToHost(p)
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

// sendCancelToHost は、ほかのホストの送り手へ、承認待ち p をキャンセルしたことを封筒で運ぶ（2 度まで試す。届かなくても、こちらの動きは変えず、常駐のログに残す）
func (h *Hub) sendCancelToHost(p pendingMessage) {
	e := h.entrance.Load()
	if e == nil {
		return
	}
	c, base, ok := h.peerTarget(e, p.SenderHost)
	if !ok {
		fmt.Fprintln(os.Stderr, stamp(), "the cancel of message", p.ID, "was not sent: where host", p.SenderHostName, "listens is not known")
		return
	}
	env := Envelope{
		ID:     newEnvelopeID(),
		From:   Address{Host: e.config.Identity.HostID, Workroom: p.toRoom},
		To:     Address{Host: p.SenderHost, Workroom: p.SenderRoom},
		Text:   gistOf(p.Body), // 送り手のホストは送った本文を持たないので、どの 1 通かを示す頭を運ぶ
		SentAt: storage.Stamp(time.Now()),
		Cancel: p.ID,
	}
	body := mustJSON(env)
	var err error
	for try := 0; try < 2; try++ {
		if _, err = h.postEnvelope(e, c, p.SenderHost, base, body); err == nil || notSent(err) {
			break
		}
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, stamp(), "the cancel of message", p.ID, "did not reach host", p.SenderHostName+":", err)
	}
}

// receiveCancelHeld は、ほかのホスト（ホストエイリアス host）から届いた、キャンセルを運ぶ封筒 env を、宛て先（このホストの送り手）の参加者 to に知らせる。
// 同じ id の封筒は 1 度だけ（h.mu を持って呼ぶ）
func (h *Hub) receiveCancelHeld(to string, env Envelope, host string) {
	if !h.markSeenHeld(env.ID) {
		return
	}
	h.enqueueWake(wakeItem{participant: to, kind: wakeMessageCancelled, line: cancelledSenderLine(env.Cancel, gistOf(env.Text), env.From.Workroom, host), peer: env.From.Host})
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
