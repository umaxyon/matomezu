package server

// AI を起こす知らせ: 利用者トリガートークを待たずに AI に届ける 1 行。参加の要求が受け入れられた・断られた（窓のアクションで）知らせと、
// ほかの AI から届いた AI 間メッセージ（message.go）がある。常駐は AI の種類を知らない。
//
// 知らせは宛て先の参加者ごとの行列に入れ、受け取られるまで持つ（メモリだけ。常駐を起動し直すと消える）。行列は 1 人 wakeQueueMax 件までで、超えたら古い物から捨てる。
// 受け取る道は 2 つあり、先に取った方が行列から外すので、二度は届かない:
//   - 通り道: AI の側が matomezu watch でこの口につなぐ（Claude Code のプラグインの monitor が動かす。届いた行で AI のターンが始まる）。
//     通り道は AI のプログラムのプロセス id（host）ごと。参加者の宛て先は、join のときに MCP が添えたプロセス id。
//     MCP と通り道の両方が、AI のプログラムが立てたときのセッション id を添えていれば、それも合う通り道だけ（プロセス id が別の AI のプログラムに使い回されたときに届けない）。
//     書き出せた知らせだけを行列から外す（書き出せずに切れたら残り、次につながった通り道に流す）
//   - 参加の id の付いた /api/ai の呼び出しの返事（NoticeHeader。join.go の Called）: AI 間メッセージだけを渡す（参加の知らせは、その呼び出しが返す「参加しました」が兼ねる）
//
// 通り道ごとに、受け取る側が名乗った形で流す（常駐は AI の種類を知らない）: 1 行の上限（maxLine。超える行は改行で分ける）、1 回の知らせの上限（maxNotice）、
// 知らせと知らせの間（gap。続けて流すと AI の側が 1 回の知らせにまとめ、上限を超えるため）。1 回の知らせに入りきらない AI 間メッセージは、通り道には「届いた」の短い知らせだけを流し、
// 本文は行列に残して、参加の id の付いた次の呼び出しの返事で渡す。
// 流す前に、もう役目の終わった知らせは捨てる: 受け入れは参加を伝え済み（Told）なら、断りは伝え済み（goneTold）なら。参加者が受け入れ済みでなくなった AI 間メッセージも捨てる。
// 参加の知らせの行は英語の短い文で、中身（「参加しました」）は、話しかけのフックか、参加の id の付いた次の呼び出しの返事が添える
//
//	GET /api/ai/watch?host=<プロセス id>[&session=<立てたときのセッション id>][&maxLine=<字>][&maxNotice=<字>][&gap=<ミリ秒>]  SSE。event: wake、data: {"text"}（text は改行を含みうる）

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// wakeLine は、AI のプログラム 1 つの、起こす知らせの通り道。行列に入った合図を ready で受ける
type wakeLine struct {
	host    string
	session string        // AI のプログラムが立てたときのセッション id（分からなければ空）
	limits  WakeLimits    // 受け取る側が名乗った流し方
	ready   chan struct{} // 宛て先の行列に何か入った合図（1 つだけ持つ）
	closed  chan struct{} // 通り道を外した（常駐を止めるとき）
}

// WakeLimits は、受け取る側が名乗る流し方（0 は上限なし・間なし）
type WakeLimits struct {
	MaxLine   int           // 1 行の上限（字）。超える行は改行で分ける
	MaxNotice int           // 1 回の知らせの上限（字。分けた改行も数える）
	Gap       time.Duration // 知らせと知らせの間
}

// shape は、行 line を 1 行の上限で改行で分けた文
func (lim WakeLimits) shape(line string) string {
	r := []rune(line)
	if lim.MaxLine <= 0 || len(r) <= lim.MaxLine {
		return line
	}
	var parts []string
	for len(r) > lim.MaxLine {
		parts = append(parts, string(r[:lim.MaxLine]))
		r = r[lim.MaxLine:]
	}
	return strings.Join(append(parts, string(r)), "\n")
}

// fits は、行 line が 1 回の知らせに入るか
func (lim WakeLimits) fits(line string) bool {
	return lim.MaxNotice <= 0 || len([]rune(lim.shape(line))) <= lim.MaxNotice
}

// wakeItem は、行列の知らせ 1 つ
type wakeItem struct {
	seq         int64  // 行列の中で見分ける番号
	participant string // 宛て先の参加者の id
	kind        string // wakeAccepted・wakeDeclined・wakeMessage
	line        string // 流す 1 行
	from        string // AI 間メッセージの送り手のワークルーム名
	chars       int    // AI 間メッセージの本文の字数
	pointed     bool   // 1 回の知らせに入りきらず、通り道に「届いた」だけを流した（本文は次の呼び出しの返事で渡す）
	pointer     bool   // nextWake が返した、「届いた」だけの知らせ（doneWake は行列から外さず pointed にする）
}

const (
	wakeAccepted = "accepted" // 参加の要求が受け入れられた
	wakeDeclined = "declined" // 参加の要求が断られた
	wakeMessage  = "message"  // AI 間メッセージ
)

// wakeLineMax は、参加の知らせの 1 行の長さの上限（文字数）
const wakeLineMax = 300

// wakeQueueMax は、参加者 1 人の行列の上限（件）
const wakeQueueMax = 50

// OpenWakesWith は、受け取る側が名乗った流し方 limits で通り道をつなぐ。溜まっていた知らせがあれば合図する
func (h *Hub) OpenWakesWith(host, session string, limits WakeLimits) *wakeLine {
	h.mu.Lock()
	defer h.mu.Unlock()
	w := &wakeLine{host: host, session: session, limits: limits, ready: make(chan struct{}, 1), closed: make(chan struct{})}
	if h.wakeLines == nil {
		h.wakeLines = map[*wakeLine]struct{}{}
	}
	h.wakeLines[w] = struct{}{}
	w.ready <- struct{}{}
	return w
}

// CloseWakes は、起こす知らせの通り道を外す（行列はそのまま残る）
func (h *Hub) CloseWakes(w *wakeLine) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.closeWakesLocked(w)
}

func (h *Hub) closeWakesLocked(w *wakeLine) {
	if _, ok := h.wakeLines[w]; ok {
		delete(h.wakeLines, w)
		close(w.closed)
	}
}

// reaches は、参加者の記録 n の宛て先に、通り道 l が合うか
func (l *wakeLine) reaches(n participantNote) bool {
	return n.WakeHost != "" && l.host == n.WakeHost && (n.WakeSession == "" || l.session == "" || l.session == n.WakeSession)
}

// enqueueWake は、参加者 it.participant の行列に知らせ it を入れ、届く通り道に合図する（h.mu を持って呼ぶ）
func (h *Hub) enqueueWake(it wakeItem) {
	if h.wakeQueue == nil {
		h.wakeQueue = map[string][]wakeItem{}
	}
	h.wakeSeq++
	it.seq = h.wakeSeq
	participant := it.participant
	q := append(h.wakeQueue[participant], it)
	if len(q) > wakeQueueMax {
		q = q[len(q)-wakeQueueMax:]
	}
	h.wakeQueue[participant] = q
	n := h.participantNotes[participant]
	for l := range h.wakeLines {
		if l.reaches(n) {
			select {
			case l.ready <- struct{}{}:
			default:
			}
		}
	}
}

// stale は、知らせ it が、もう役目を終えているか（joined は受け入れ済みの参加者の id。h.mu を持って呼ぶ）
func (h *Hub) stale(it wakeItem, joined map[string]bool) bool {
	switch it.kind {
	case wakeAccepted:
		return h.participantNotes[it.participant].Told
	case wakeDeclined:
		return h.goneTold[it.participant]
	default:
		return !joined[it.participant]
	}
}

// joinedParticipants は、受け入れ済みの参加者の id の集まり
func (h *Hub) joinedParticipants() map[string]bool {
	out := map[string]bool{}
	records, err := h.records()
	if err != nil {
		return out
	}
	for _, r := range records {
		if r.State == "joined" {
			out[r.ID] = true
		}
	}
	return out
}

// nextWake は、通り道 l に流す、行列の先頭の知らせ（無ければ false）。文は l の流し方で分けてある。役目を終えた知らせは捨てる。行列からは外さない（書き出せたら doneWake で外す）。
// 1 回の知らせに入りきらない AI 間メッセージは、「届いた」だけの知らせにして返し、それを流したあとは通り道に流さない（次の呼び出しの返事で渡す）
func (h *Hub) nextWake(l *wakeLine) (wakeItem, bool) {
	joined := h.joinedParticipants()
	h.mu.Lock()
	defer h.mu.Unlock()
	if _, ok := h.wakeLines[l]; !ok {
		return wakeItem{}, false
	}
	var first *wakeItem
	for id, q := range h.wakeQueue {
		if !l.reaches(h.participantNotes[id]) {
			continue
		}
		kept := q[:0]
		for _, it := range q {
			if !h.stale(it, joined) {
				kept = append(kept, it)
			}
		}
		if len(kept) == 0 {
			delete(h.wakeQueue, id)
			continue
		}
		h.wakeQueue[id] = kept
		for _, it := range kept {
			if it.pointed && !l.limits.fits(it.line) {
				continue
			}
			if first == nil || it.seq < first.seq {
				first = &it
			}
			break
		}
	}
	if first == nil {
		return wakeItem{}, false
	}
	it := *first
	if !l.limits.fits(it.line) {
		it.pointer = true
		it.line = "matomezu: the AI in workroom " + quote(it.from) + " sent you a message (" + strconv.Itoa(it.chars) + " characters, too long for this notice). Call any matomezu tool to receive it."
	}
	it.line = l.limits.shape(it.line)
	return it, true
}

// doneWake は、届いた知らせ it を行列から外す（ほかの道が先に外していれば何もしない）
func (h *Hub) doneWake(it wakeItem) {
	h.mu.Lock()
	defer h.mu.Unlock()
	q := h.wakeQueue[it.participant]
	for i, x := range q {
		if x.seq == it.seq {
			if it.pointer {
				q[i].pointed = true
			} else {
				q = append(q[:i:i], q[i+1:]...)
			}
			break
		}
	}
	if len(q) == 0 {
		delete(h.wakeQueue, it.participant)
	} else {
		h.wakeQueue[it.participant] = q
	}
}

// takeMessages は、参加者 id の行列の AI 間メッセージの行を全部取り出し、行列を空にする（参加の知らせは、呼び出しの返事の「参加しました」が兼ねるので捨てる。h.mu を持って呼ぶ）
func (h *Hub) takeMessages(id string) []string {
	var lines []string
	for _, it := range h.wakeQueue[id] {
		if it.kind == wakeMessage {
			lines = append(lines, it.line)
		}
	}
	delete(h.wakeQueue, id)
	return lines
}

// noticeLine は、参加の知らせの文を 1 行にする（改行はつぶし、長ければ切る）
func noticeLine(text string) string {
	line := strings.Join(strings.Fields(text), " ")
	if r := []rune(line); len(r) > wakeLineMax {
		line = string(r[:wakeLineMax])
	}
	return line
}

// requestedParticipants は、要求中の参加者の id の集まり（h.mu を持って呼ぶ）
func (h *Hub) requestedParticipants() map[string]bool {
	out := map[string]bool{}
	for _, body := range h.recordsOfRole("participants") {
		var r participantRecord
		if json.Unmarshal(body, &r) == nil && r.State == "requested" {
			out[r.ID] = true
		}
	}
	return out
}

// wakeOnParticipants は、窓のアクションの前に要求中だった参加者 before のうち、受け入れられた・断られた参加者に知らせる（h.mu を持って呼ぶ）
func (h *Hub) wakeOnParticipants(before map[string]bool) {
	if len(before) == 0 {
		return
	}
	now := map[string]participantRecord{}
	for _, body := range h.recordsOfRole("participants") {
		var r participantRecord
		if json.Unmarshal(body, &r) == nil {
			now[r.ID] = r
		}
	}
	rooms := map[string]string{}
	for _, body := range h.recordsOfRole("workrooms") {
		var r workroomRecord
		if json.Unmarshal(body, &r) == nil {
			rooms[r.ID] = r.Name
		}
	}
	for id := range before {
		s, ok := now[id]
		switch {
		case !ok:
			h.enqueueWake(wakeItem{participant: id, kind: wakeDeclined, line: noticeLine("matomezu: the user declined your request to join (participant " + id + "). Tell the user, and do not ask again unless the user asks.")})
		case s.State == "joined":
			// 「参加しました」が届く所は、セッション id の結び方で決まる（AI の種類は見ない）。
			// join で結んだ AI は受け入れた時点で準備中でなく、参加の id の付いた次の呼び出しの返事に添う。フックで結ぶ AI は、このターンの話しかけのフックが添える
			welcome := "The welcome comes with this turn."
			if h.participantNotes[id].BoundBy == boundByJoin {
				welcome = "The welcome comes with your next matomezu call."
			}
			h.enqueueWake(wakeItem{participant: id, kind: wakeAccepted, line: noticeLine("matomezu: the user accepted your request to join (participant " + id + ", workroom " + rooms[s.Workroom] + "). " + welcome)})
		}
	}
}

func (o Options) aiWatch(w http.ResponseWriter, r *http.Request) {
	host := r.URL.Query().Get("host")
	if host == "" {
		http.Error(w, "host is needed (the process id of the AI's program)", http.StatusBadRequest)
		return
	}
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming is not supported", http.StatusInternalServerError)
		return
	}
	q := r.URL.Query()
	number := func(name string) int {
		n, _ := strconv.Atoi(q.Get(name))
		return max(n, 0)
	}
	line := o.Hub.OpenWakesWith(host, q.Get("session"), WakeLimits{MaxLine: number("maxLine"), MaxNotice: number("maxNotice"), Gap: time.Duration(number("gap")) * time.Millisecond})
	defer o.Hub.CloseWakes(line)
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.WriteHeader(http.StatusOK)
	flusher.Flush()
	every := o.Keep
	if every == 0 {
		every = keepAlive
	}
	tick := time.NewTicker(every)
	defer tick.Stop()
	for {
		select {
		case <-line.ready:
			for {
				it, ok := o.Hub.nextWake(line)
				if !ok {
					break
				}
				data, _ := json.Marshal(map[string]string{"text": it.line})
				if _, err := fmt.Fprintf(w, "event: wake\ndata: %s\n\n", data); err != nil {
					return
				}
				flusher.Flush()
				if r.Context().Err() != nil {
					return
				}
				o.Hub.doneWake(it)
				if line.limits.Gap > 0 {
					select {
					case <-time.After(line.limits.Gap):
					case <-line.closed:
						return
					case <-r.Context().Done():
						return
					}
				}
			}
		case <-tick.C:
			if _, err := fmt.Fprint(w, "event: keep\ndata: {}\n\n"); err != nil {
				return
			}
			flusher.Flush()
		case <-line.closed:
			return
		case <-r.Context().Done():
			return
		}
	}
}
