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

// rallyPasses は、届ける AI 間メッセージ d を、AI ラリーの上限の内として数える。上限を超えるなら数えず、宛て先に 1 度だけ知らせて偽を返す（h.mu を持って呼ぶ）
func (h *Hub) rallyPasses(d delivery) bool {
	if h.rallies == nil {
		h.rallies = map[rallyKey]int{}
		h.ralliesStopped = map[rallyKey]bool{}
	}
	k := rallyKey{from: d.from, to: d.to}
	limit := rallyLocalLimit
	if d.peer != "" {
		k = rallyKey{fromHost: d.peer, fromRoom: d.envelope.From.Workroom, to: d.to}
		limit = d.limit
	}
	n := h.rallies[k] + 1
	// 封筒に送り手の側の数を載せないホストからのときは、こちらの数だけで決める
	if n > limit && (d.peer == "" || d.envelope.Rally == 0 || d.envelope.Rally > limit) {
		if !h.ralliesStopped[k] {
			h.ralliesStopped[k] = true
			h.enqueueWake(wakeItem{participant: d.to, kind: wakeRally, line: hostLine(rallyStoppedForRecipient(d, limit))})
		}
		return false
	}
	h.rallies[k] = n
	delete(h.ralliesStopped, k)
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
// もう受け入れ済みでない参加者の数も捨てる（joined は受け入れ済みの参加者の id）（h.mu を持って呼ぶ）
func (h *Hub) rallyReset(participant string, joined map[string]bool) {
	gone := func(id string) bool { return id != "" && !joined[id] }
	for k := range h.rallies {
		if k.from == participant || k.to == participant || gone(k.from) || gone(k.to) {
			delete(h.rallies, k)
			delete(h.ralliesStopped, k)
		}
	}
	for k := range h.ralliesStopped {
		if k.from == participant || k.to == participant || gone(k.from) || gone(k.to) {
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
}

// rallyStoppedDetail は、上限を超えて届けなかった AI 間メッセージの、送り手への断りの句（to は宛て先のワークルーム名）
func rallyStoppedDetail(to string, limit int) string {
	return "you and the AI in " + to + " sent each other " + strconv.Itoa(limit) + " messages without your users talking to you, so matomezu stopped the exchange and did not deliver this one. " +
		"Tell your user that the exchange stopped at the limit and waits for the user; send it again only when the user asks"
}

// rallyStoppedForRecipient は、上限を超えて届けなかった AI 間メッセージ d の宛て先に、常駐から 1 度だけ知らせる文
func rallyStoppedForRecipient(d delivery, limit int) string {
	from := "the AI in " + d.envelope.From.Workroom
	if d.peer != "" {
		from += " on host " + d.host
	}
	return fmt.Sprintf("you and %s sent each other %d messages without your users talking to you, so matomezu stopped the exchange: a message from it was not delivered. "+
		"Tell your user that the exchange stopped at the limit and waits for the user", from, limit)
}

// rallyRefusal は、AI ラリーの上限を超えて届けなかった AI 間メッセージの、送り手への断り（to は宛て先のワークルーム名）
func rallyRefusal(to string, limit int) MessageSent {
	return MessageSent{Reason: "rally-limit", Detail: rallyStoppedDetail(to, limit)}
}
