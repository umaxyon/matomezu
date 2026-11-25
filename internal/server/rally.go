package server

// AI ラリー: 利用者トリガートークが無いまま、2 つのワークルームの AI が AI 間メッセージで起こし合うこと。
// 常駐は、受ける側で、送り手から宛て先への向きごとに、利用者トリガートークの後に起こした数を数え、上限を超える物は届けずに断る（送り手には断りの答え、
// 宛て先には常駐から 1 度だけ知らせる）。数は、どちらかの AI に利用者トリガートークがあったら 0 に戻す。
// ほかのホストの利用者トリガートークは受ける側には分からないので、送り手のホストが、送り手の AI の利用者トリガートークの後にその宛て先へ送った数を
// 封筒に載せ（Envelope.Rally）、受ける側は自分の数と封筒の数の両方が上限を超えたときだけ断る。数はメモリだけに持つ（常駐を起動し直したら 0）

import (
	"fmt"
	"strconv"
)

// rallyLocalLimit は、同じホストの中の AI ラリーの上限（向きごとの数）
const rallyLocalLimit = 50

// ペアリングしたホストの rallyLimit（そのホストから届く AI ラリーの上限）の既定と範囲（core/def/subject.ts の PAIRED_HOST_RALLY_LIMIT）
const (
	rallyLimitDefault = 15
	rallyLimitMin     = 1
	rallyLimitMax     = 50
)

// rallyKey は、AI ラリーの向き: 送り手（このホストの参加者の id か、ほかのホストの {ホスト id, ワークルーム名}）から、宛て先の参加者へ
type rallyKey struct {
	from     string // このホストの送り手の参加者の id（ほかのホストからなら空）
	fromHost string // ほかのホストの送り手のホスト id
	fromRoom string // ほかのホストの送り手のワークルーム名
	to       string // 宛て先の参加者の id
}

// rallySentKey は、このホストの参加者 from が、ほかのホストのワークルームへ送った向き
type rallySentKey struct {
	from string
	host string
	room string
}

// rallyLimitOf は、ペアリングしたホストの記録の上限（範囲の外は既定）
func rallyLimitOf(r pairedHostRecord) int {
	if r.RallyLimit < rallyLimitMin || r.RallyLimit > rallyLimitMax {
		return rallyLimitDefault
	}
	return r.RallyLimit
}

// rallyOf は、AI 間メッセージ d の AI ラリーの向きと上限
func rallyOf(d delivery) (rallyKey, int) {
	if d.peer != "" {
		return rallyKey{fromHost: d.peer, fromRoom: d.envelope.From.Workroom, to: d.to}, d.limit
	}
	return rallyKey{from: d.from, to: d.to}, rallyLocalLimit
}

// rallyOver は、AI 間メッセージ d が、同じ向きに先に ahead 通届けるとしたら、AI ラリーの上限を超えるか（数えない。h.mu を持って呼ぶ）
func (h *Hub) rallyOver(d delivery, ahead int) bool {
	k, limit := rallyOf(d)
	n := h.rallies[k] + 1 + ahead
	// 封筒に送り手の側の数を載せないホストからのときは、こちらの数だけで決める
	return n > limit && (d.peer == "" || d.envelope.Rally == 0 || d.envelope.Rally > limit)
}

// rallyStop は、上限を超えて AI 間メッセージ d を届けないことを、宛て先に 1 度だけ知らせる（h.mu を持って呼ぶ）
func (h *Hub) rallyStop(d delivery) {
	if h.ralliesStopped == nil {
		h.ralliesStopped = map[rallyKey]bool{}
	}
	k, limit := rallyOf(d)
	if !h.ralliesStopped[k] {
		h.ralliesStopped[k] = true
		h.enqueueWake(wakeItem{participant: d.to, kind: wakeRally, line: hostLine(rallyStoppedForRecipient(d, limit))})
	}
}

// rallyPasses は、届ける AI 間メッセージ d を、AI ラリーの上限の内として数える。上限を超えるなら数えず、宛て先に 1 度だけ知らせて偽を返す（h.mu を持って呼ぶ）
func (h *Hub) rallyPasses(d delivery) bool {
	if h.rallyOver(d, 0) {
		h.rallyStop(d)
		return false
	}
	if h.rallies == nil {
		h.rallies = map[rallyKey]int{}
	}
	k, _ := rallyOf(d)
	h.rallies[k]++
	if h.ralliesStopped[k] {
		// 止めたあとで、どちらかの利用者が話しかけて数が戻った。宛て先に、また届くことを先に知らせる（続けて返してよいと分かるように）
		delete(h.ralliesStopped, k)
		h.enqueueWake(wakeItem{participant: d.to, kind: wakeRally, line: hostLine(rallyResumedForRecipient(d))})
	}
	return true
}

// rallyCountSent は、このホストの参加者 from がほかのホスト host のワークルーム room へ送る数を 1 つ進め、利用者トリガートークの後の何通目かを返す（h.mu を持って呼ぶ）
func (h *Hub) rallyCountSent(from, host, room string) int {
	if h.ralliesSent == nil {
		h.ralliesSent = map[rallySentKey]int{}
	}
	k := rallySentKey{from: from, host: host, room: room}
	h.ralliesSent[k]++
	return h.ralliesSent[k]
}

// rallyReset は、参加者 participant に利用者トリガートークがあったので、その参加者が送り手か宛て先の AI ラリーの数を 0 に戻す。
// 止めた印は残し、次に届くときに宛て先へまた届くことを知らせる。もう受け入れ済みでない参加者の数と印は捨てる（joined は受け入れ済みの参加者の id）（h.mu を持って呼ぶ）
func (h *Hub) rallyReset(participant string, joined map[string]bool) {
	gone := func(id string) bool { return id != "" && !joined[id] }
	for k := range h.rallies {
		if k.from == participant || k.to == participant || gone(k.from) || gone(k.to) {
			delete(h.rallies, k)
		}
	}
	for k := range h.ralliesStopped {
		if gone(k.from) || gone(k.to) {
			delete(h.ralliesStopped, k)
		}
	}
	for k := range h.ralliesSent {
		if k.from == participant || gone(k.from) {
			delete(h.ralliesSent, k)
		}
	}
}

// UserTalkedIn は、会話のセッション session の参加者に利用者トリガートークがあったことを受ける（AI ラリーの数を戻す）
func (h *Hub) UserTalkedIn(session string) {
	id := h.joinedOfSession(session)
	if id == "" {
		return
	}
	joined := h.joinedParticipants()
	h.mu.Lock()
	defer h.mu.Unlock()
	h.rallyReset(id, joined)
	h.cancelReceiverPendingHeld(id) // 承認待ちは、利用者の話しかけでキャンセル扱い（知らせあり。pending_message.go）
}

// rallyStoppedDetail は、上限を超えて届けなかった AI 間メッセージの、送り手への断りの句（to は宛て先のワークルーム名）
func rallyStoppedDetail(to string, limit int) string {
	return "you and the AI in " + to + " sent each other " + strconv.Itoa(limit) + " messages without your users talking to you, so matomezu stopped the exchange and did not deliver this one. " +
		"Tell your user that the exchange stopped at the limit and waits for the user; send it again only when the user asks"
}

// rallySender は、AI 間メッセージ d の送り手を、宛て先への文の中で呼ぶ句
func rallySender(d delivery) string {
	from := "the AI in " + d.envelope.From.Workroom
	if d.peer != "" {
		from += " on host " + d.host
	}
	return from
}

// rallyStoppedForRecipient は、上限を超えて届けなかった AI 間メッセージ d の宛て先に、常駐から 1 度だけ知らせる文
func rallyStoppedForRecipient(d delivery, limit int) string {
	return fmt.Sprintf("you and %s sent each other %d messages without your users talking to you, so matomezu stopped the exchange: a message from it was not delivered. "+
		"Tell your user that the exchange stopped at the limit and waits for the user. When either user talks to their AI, its messages arrive again and matomezu tells you so; then answer them as usual", rallySender(d), limit)
}

// rallyResumedForRecipient は、止めたあとでまた届く AI 間メッセージ d の前に、宛て先へ知らせる文
func rallyResumedForRecipient(d delivery) string {
	return "a user talked to their AI after matomezu stopped the exchange with " + rallySender(d) + ", so its messages arrive again; answer them as usual"
}

// rallyRefusal は、AI ラリーの上限を超えて届けなかった AI 間メッセージの、送り手への断り（to は宛て先のワークルーム名）
func rallyRefusal(to string, limit int) MessageSent {
	return MessageSent{Reason: "rally-limit", Detail: rallyStoppedDetail(to, limit)}
}
