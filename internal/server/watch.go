package server

// AI を起こす知らせ: 利用者トリガートークを待たずに AI に届ける知らせ。参加の要求が受け入れられた・断られた（窓のアクションで）知らせと、
// ほかの AI から届いた AI 間メッセージ（message.go）がある。常駐は AI の種類を知らない。
//
// 知らせは宛て先の参加者ごとの行列に入れ、受け取られるまで持つ（メモリだけ。常駐を起動し直すと消える）。行列は 1 人 wakeQueueMax 件までで、超えたら古い物から捨てる。
// 受け取る道は 2 つ:
//   - 通り道: AI の側が matomezu watch でこの口につなぐ。watch は届いた知らせを AI に渡し（標準出力に書くか、渡すコマンドを呼ぶ）、
//     結果を POST /api/ai/watch/ack で返す。常駐は知らせを通り道に貸し、結果が返るまで、ほかの道（ほかの通り道・呼び出しの返事）では渡さない:
//     delivered（渡せた）なら行列から外し、absent（その AI のプログラムにその会話が無い）なら通り道には流さず呼び出しの返事だけで渡し、
//     failed（失敗）なら間を置いて流し直す。通り道が切れたら、貸していた知らせを戻す（渡せたのに結果が届かなかった物は、もう一度渡る）。
//     同じ参加者の知らせは一度に 1 つだけ貸す（順を守る）。
//     通り道は AI のプログラムのプロセス id（host）ごと。参加者の宛て先は、join のときに MCP が添えたプロセス id。
//     MCP と通り道の両方が、AI のプログラムが立てたときのセッション id を添えていれば、それも合う通り道だけ（プロセス id が別の AI のプログラムに使い回されたときに届けない）。
//     流す知らせには、宛て先の参加者に結んだセッション id を添える（渡すコマンドが、どの会話に渡すかを決める）
//   - 参加者が決まった /api/ai の呼び出しの返事（aiwire.NoticeHeader。join_calls.go の Called）: AI 間メッセージだけを渡す（参加の知らせは、その呼び出しが返す「参加しました」が兼ねる）
//
// 通り道ごとに、受け取る側が名乗った形で流す（常駐は AI の種類を知らない）: 1 行の上限（maxLine。超える行は改行で分ける）、1 回の知らせの上限（maxNotice）、
// 知らせと知らせの間（gap。続けて流すと AI の側が 1 回の知らせにまとめ、上限を超えるため）、改行を含む知らせを 1 つで受けるか（breaks。受けるなら AI 間メッセージを送り手の行と本文の行に分ける）。1 回の知らせに入りきらない AI 間メッセージは、通り道には「届いた」の短い知らせだけを流し、
// 本文は行列に残して、その参加者の次の呼び出しの返事で渡す。
// 流す前に、もう役目の終わった知らせは捨てる: 受け入れは参加を伝え済み（Told）なら、断り・キャンセルは伝え済み（記録が無いか、伝えた印がある。departure.go）なら。参加者が受け入れ済みでなくなった AI 間メッセージも捨てる。
// 参加の知らせの行は英語の短い文で、中身（「参加しました」）は、話しかけのフックか、その参加者の次の呼び出しの返事が添える
//
//	GET  /api/ai/watch?host=<プロセス id>&session=<立てたときのセッション id>（どちらか一方は要る）[&maxLine=<字>][&maxNotice=<字>][&gap=<ミリ秒>][&breaks=1]
//	     SSE。event: wake、data: {"line", "id", "session", "text"}（text は改行を含みうる。session は宛て先の参加者に結んだセッション id、分からなければ空）
//	POST /api/ai/watch/ack {"line", "id", "result"}  result は delivered・absent・failed。{} を返す

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/umaxyon/matomezu/internal/engine"
)

// wakeLine は、AI のプログラム 1 つの、起こす知らせの通り道。行列に入った合図を ready で受ける
type wakeLine struct {
	id      int64         // 通り道の番号（貸した知らせの結果を見分ける）
	host    string        // AI のプログラムのプロセス id
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
	Breaks    bool          // 改行を含む知らせを 1 つの知らせで受ける（AI 間メッセージは、送り手の行と本文の行に分けて流す）
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
	seq         int64     // 行列の中で見分ける番号
	participant string    // 宛て先の参加者の id
	kind        string    // wakeAccepted・wakeDeclined・wakeCancelled・wakeMessage・wakeUpdate・wakeAskRefresh・wakeHost・wakeRally・wakeMessageApproved・wakeMessageCancelled
	line        string    // 流す 1 行
	head        string    // AI 間メッセージの、送り手を名乗る頭（messageHead・remoteMessageHead）
	peer        string    // ほかのホストから届いた AI 間メッセージの、送り手のホスト id
	asUser      bool      // 頭に as-user の印が付いている
	body        string    // AI 間メッセージの本文（JSON の文字列にした物。改行を受ける通り道には、送り手の行のあとの行で流す）
	pointed     bool      // 1 回の知らせに入りきらず、通り道に「届いた」だけを渡した（本文は呼び出しの返事で渡す）
	replyOnly   bool      // 通り道の AI のプログラムにその会話が無かった（absent）。呼び出しの返事だけで渡す
	lentTo      int64     // 貸している通り道の番号（0 は貸していない）
	lentPointer bool      // 貸したのが「届いた」だけの知らせか
	notBefore   time.Time // 失敗のあと、次に流せる時点
}

// WakeOut は、通り道に流す知らせ 1 つ
type WakeOut struct {
	Line    int64  `json:"line"`
	ID      string `json:"id"`
	Session string `json:"session"`
	Text    string `json:"text"`
}

const (
	wakeAccepted   = "accepted"    // 参加の要求が受け入れられた
	wakeDeclined   = "declined"    // 参加の要求が断られた
	wakeCancelled  = "cancelled"   // 参加の要求を利用者がキャンセルした
	wakeMessage    = "message"     // AI 間メッセージ
	wakeUpdate     = "update"      // 利用者が、matomezu の版を上げるよう頼んだ（update.go）
	wakeAskRefresh = "ask-refresh" // 利用者が、引継ぎページを書いて会話を空にするよう頼んだ（ask_refresh.go）
	wakeHost       = "host"        // 常駐メッセージ（フォローステップが返した、常駐からの知らせ。message.go）
	wakeRally      = "rally"       // AI ラリーを上限で止め、宛て先に届けなかったという知らせ（rally.go）

	wakeMessageApproved  = "message-approved"  // 承認待ちの AI 間メッセージを利用者が承認した（受け手に、利用者の頼みとして。pending_message.go）
	wakeMessageCancelled = "message-cancelled" // 承認待ちの AI 間メッセージを利用者がキャンセルした（送り手と受け手に。pending_message.go）
)

// asUserMark は、利用者の頼みと扱ってよい知らせの行の、頭に付ける印（requests が as-user のホストから届いた行と、利用者が画面で押した頼みの行）
const asUserMark = "(as your user's request)"

// logWake は、起こす知らせが通り道に届いたかを調べるための 1 行を常駐のログに書く
func logWake(format string, args ...any) {
	fmt.Fprintf(os.Stderr, "%s wake: %s\n", stamp(), fmt.Sprintf(format, args...))
}

// 貸した知らせの結果（POST /api/ai/watch/ack の result）
const (
	WakeDelivered = "delivered" // 渡せた
	WakeAbsent    = "absent"    // その AI のプログラムに宛て先の会話が無い
	WakeFailed    = "failed"    // 渡せなかった（間を置いて流し直す）
)

// wakeLineMax は、参加の知らせの 1 行の長さの上限（文字数）
const wakeLineMax = 300

// wakeQueueMax は、参加者 1 人の行列の上限（件）
const wakeQueueMax = 50

// wakeRetry は、失敗した知らせを流し直すまでの間
const wakeRetry = 10 * time.Second

// OpenWakesWith は、プロセス id host（立てたときのセッション id session）の AI の、起こす知らせの通り道を、受け取る側が名乗った流し方 limits でつなぐ。
// 溜まっていた知らせがあれば合図する
func (h *Hub) OpenWakesWith(host, session string, limits WakeLimits) *wakeLine {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.wakeLineSeq++
	w := &wakeLine{id: h.wakeLineSeq, host: host, session: session, limits: limits, ready: make(chan struct{}, 1), closed: make(chan struct{})}
	if h.wakeLines == nil {
		h.wakeLines = map[*wakeLine]struct{}{}
	}
	h.wakeLines[w] = struct{}{}
	w.ready <- struct{}{}
	logWake("line %d opened: host %q, session %q", w.id, host, session)
	h.noteWakesLocked()
	return w
}

// CloseWakes は、起こす知らせの通り道を外し、貸していた知らせを戻す
func (h *Hub) CloseWakes(w *wakeLine) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.closeWakesLocked(w)
}

func (h *Hub) closeWakesLocked(w *wakeLine) {
	if _, ok := h.wakeLines[w]; !ok {
		return
	}
	delete(h.wakeLines, w)
	close(w.closed)
	logWake("line %d closed", w.id)
	for _, lines := range h.wakeAbsent {
		delete(lines, w.id)
	}
	defer h.noteWakesLocked()
	for id, q := range h.wakeQueue {
		for i := range q {
			if q[i].lentTo == w.id {
				q[i].lentTo = 0
				h.signalWakes(id)
			}
		}
	}
}

// dropStaleAbsentLocked は、absent の印のうち、参加者が消えた物と、通り道がその参加者に届かなくなった物を消す（h.mu を持って呼ぶ）
func (h *Hub) dropStaleAbsentLocked() {
	reaching := map[int64]*wakeLine{}
	for l := range h.wakeLines {
		reaching[l.id] = l
	}
	for id, lines := range h.wakeAbsent {
		n, ok := h.participantNotes[id]
		for line := range lines {
			if l := reaching[line]; !ok || l == nil || !l.reaches(n) {
				delete(lines, line)
			}
		}
		if len(lines) == 0 {
			delete(h.wakeAbsent, id)
		}
	}
}

// reaches は、参加者の記録 n の宛て先に、通り道 l が合うか。AI のプログラムのプロセス id かセッション id の少なくとも一方が両方で分かって等しく、
// もう一方は、両方で分かっていれば等しい（Windows では、AI のプログラムまでたどれない watch がある）
func (l *wakeLine) reaches(n participantNote) bool {
	host := l.host != "" && l.host == n.WakeHost
	session := l.session != "" && l.session == n.WakeSession
	hostOK := l.host == "" || n.WakeHost == "" || host
	sessionOK := l.session == "" || n.WakeSession == "" || session
	return (host || session) && hostOK && sessionOK
}

// wakeReachLocked は、参加者 id に、起こす知らせを渡せる通り道がつながっているか（engine.WakeReaches・engine.WakeNone）。
// 準備中の参加者と、その会話が無い（absent）と答えた通り道は数えない（h.mu を持って呼ぶ）
func (h *Hub) wakeReachLocked(id string) string {
	n := h.participantNotes[id]
	if !n.ready() {
		return engine.WakeNone
	}
	for l := range h.wakeLines {
		if l.reaches(n) && !h.wakeAbsent[id][l.id] {
			return engine.WakeReaches
		}
	}
	return engine.WakeNone
}

// noteWakesLocked は、起こす知らせを渡せる通り道がつながっているかの変わった参加者を窓に知らせ（participant-live）、自分のワークルームの一覧を作り直させる。
// 消えた参加者と、届かなくなった（起こす先を結び直した）通り道の absent の印は消す（h.mu を持って呼ぶ）
func (h *Hub) noteWakesLocked() {
	h.dropStaleAbsentLocked()
	changed := false
	for id := range h.participantNotes {
		reaches := h.wakeReachLocked(id) == engine.WakeReaches
		if reaches == h.wakeShown[id] {
			continue
		}
		if h.wakeShown == nil {
			h.wakeShown = map[string]bool{}
		}
		if reaches {
			h.wakeShown[id] = true
		} else {
			delete(h.wakeShown, id)
		}
		h.announceLive(id)
		changed = true
	}
	for id := range h.wakeShown {
		if _, ok := h.participantNotes[id]; !ok {
			delete(h.wakeShown, id)
		}
	}
	if changed {
		h.kickRooms()
	}
}

// signalWakes は、参加者 participant に届く通り道に、流せる知らせがあるかもしれないと合図する（h.mu を持って呼ぶ）
func (h *Hub) signalWakes(participant string) {
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

// enqueueWake は、参加者 it.participant の行列に知らせ it を入れ、届く通り道に合図する（h.mu を持って呼ぶ）
func (h *Hub) enqueueWake(it wakeItem) {
	if h.wakeQueue == nil {
		h.wakeQueue = map[string][]wakeItem{}
	}
	h.wakeSeq++
	it.seq = h.wakeSeq
	q := append(h.wakeQueue[it.participant], it)
	if len(q) > wakeQueueMax {
		q = q[len(q)-wakeQueueMax:]
	}
	h.wakeQueue[it.participant] = q
	n := h.participantNotes[it.participant]
	var lines []int64
	for l := range h.wakeLines {
		if l.reaches(n) {
			lines = append(lines, l.id)
		}
	}
	logWake("%d (%s) queued for participant %s (host %q, session %q): lines that reach it %v", it.seq, it.kind, it.participant, n.WakeHost, n.WakeSession, lines)
	h.signalWakes(it.participant)
}

// stale は、知らせ it が、もう役目を終えているか（joined は受け入れ済みの参加者の id。h.mu を持って呼ぶ）
func (h *Hub) stale(it wakeItem, joined map[string]bool) bool {
	switch it.kind {
	case wakeAccepted:
		return h.participantNotes[it.participant].Told
	case wakeDeclined, wakeCancelled:
		i := h.departureOfParticipantHeld(it.participant)
		return i < 0 || h.departures[i].Told
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
		if r.accepted() {
			out[r.ID] = true
		}
	}
	return out
}

// nextWake は、通り道 l に流す知らせを 1 つ選んで l に貸し、流す形にして返す（無ければ false）。役目を終えた知らせは捨てる。
// 参加者ごとに行列の先頭から見て、呼び出しの返事だけで渡す物と、1 回の知らせに入りきらず「届いた」を渡し済みの物は飛ばす。
// 貸している物か、流し直しを待っている物に当たったら、その参加者の後ろの物も流さない（順を守る）。
// 1 回の知らせに入りきらない AI 間メッセージは、「届いた」だけの知らせにして貸す
func (h *Hub) nextWake(l *wakeLine, now time.Time) (WakeOut, bool) {
	joined := h.joinedParticipants()
	h.mu.Lock()
	defer h.mu.Unlock()
	if _, ok := h.wakeLines[l]; !ok {
		return WakeOut{}, false
	}
	var pick *wakeItem
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
		for i := range kept {
			it := &kept[i]
			if it.replyOnly || (it.pointed && !l.limits.fits(it.line)) {
				continue
			}
			if it.lentTo == 0 && !now.Before(it.notBefore) && (pick == nil || it.seq < pick.seq) {
				pick = it
			}
			break
		}
	}
	if pick == nil {
		return WakeOut{}, false
	}
	pick.lentTo = l.id
	pick.lentPointer = !l.limits.fits(pick.line)
	text := pick.line
	if l.limits.Breaks && pick.kind == wakeMessage {
		text = pick.head + "\n" + pick.body
	}
	if pick.lentPointer {
		head := "matomezu:"
		if pick.kind == wakeMessage {
			head = pick.head
		}
		text = head + " too long, call any matomezu tool"
	}
	text = l.limits.shape(text)
	h.rememberLent(text)
	logWake("%d (%s) lent to line %d", pick.seq, pick.kind, l.id)
	return WakeOut{Line: l.id, ID: strconv.FormatInt(pick.seq, 10), Session: h.participantNotes[pick.participant].SessionID, Text: text}, true
}

// AckWake は、通り道 line に貸した知らせ id の結果 result を受ける。貸した通り道からの結果だけを受け、ほかは何もしない
func (h *Hub) AckWake(line int64, id, result string, now time.Time) {
	seq, err := strconv.ParseInt(id, 10, 64)
	if err != nil {
		return
	}
	logWake("%d on line %d: %s", seq, line, result)
	h.mu.Lock()
	defer h.mu.Unlock()
	for participant, q := range h.wakeQueue {
		for i := range q {
			it := &q[i]
			if it.seq != seq {
				continue
			}
			if it.lentTo != line {
				return
			}
			it.lentTo = 0
			switch result {
			case WakeDelivered:
				if h.wakeAbsent[participant][line] {
					delete(h.wakeAbsent[participant], line)
					defer h.noteWakesLocked()
				}
				if it.lentPointer {
					it.pointed = true
				} else {
					q = append(q[:i:i], q[i+1:]...)
				}
			case WakeAbsent:
				it.replyOnly = true
				if h.wakeAbsent == nil {
					h.wakeAbsent = map[string]map[int64]bool{}
				}
				if h.wakeAbsent[participant] == nil {
					h.wakeAbsent[participant] = map[int64]bool{}
				}
				h.wakeAbsent[participant][line] = true
				defer h.noteWakesLocked()
			default:
				it.notBefore = now.Add(wakeRetry)
				time.AfterFunc(wakeRetry, func() {
					h.mu.Lock()
					defer h.mu.Unlock()
					h.signalWakes(participant)
				})
			}
			if len(q) == 0 {
				delete(h.wakeQueue, participant)
			} else {
				h.wakeQueue[participant] = q
			}
			h.signalWakes(participant)
			return
		}
	}
}

// lentWakesMax は、通り道に貸した知らせの文を覚えておく数
const lentWakesMax = 64

// rememberLent は、通り道に貸した知らせの文 text を覚える。古い物から忘れる。渡せたかの結果を待たずに覚える
// （AI のプログラムがその知らせでターンを始め、そのフックが結果より先に着くことがある）（h.mu を持って呼ぶ）
func (h *Hub) rememberLent(text string) {
	if text == "" {
		return
	}
	h.lentWakes = append(h.lentWakes, text)
	if len(h.lentWakes) > lentWakesMax {
		h.lentWakes = h.lentWakes[len(h.lentWakes)-lentWakesMax:]
	}
}

// WokenBy は、ターンの入力 prompt が、通り道に貸した知らせの文そのものか、その幾つかを改行でつないだだけの物か（知らせをそのまま利用者の入力の道で受ける AI のプログラムのターンは、それで知らせで始まったと分かる。
// AI が動いている間に届いた知らせは、AI のプログラムが 1 つの入力にまとめることがある）。利用者の文が混じっていれば当たらない。
// 当たった文は忘れる（同じ文で始まる次のターンは、利用者の入力と見る）
func (h *Hub) WokenBy(prompt string) bool {
	prompt = strings.TrimSpace(prompt)
	if prompt == "" {
		return false
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	used := lentCover(prompt, h.lentWakes, map[int]bool{})
	if used == nil {
		return false
	}
	kept := h.lentWakes[:0:0]
	for i, text := range h.lentWakes {
		if !used[i] {
			kept = append(kept, text)
		}
	}
	h.lentWakes = kept
	return true
}

// lentCover は、prompt を、lent の文（used の物を除き、1 つは 1 度だけ）を改行でつないだだけの物として読めるなら、使った文の位置を返す（読めなければ nil）
func lentCover(prompt string, lent []string, used map[int]bool) map[int]bool {
	for i, text := range lent {
		if used[i] {
			continue
		}
		rest, ok := strings.CutPrefix(prompt, text)
		if !ok {
			continue
		}
		used[i] = true
		if rest == "" {
			return used
		}
		if next, ok := strings.CutPrefix(rest, "\n"); ok {
			if got := lentCover(next, lent, used); got != nil {
				return got
			}
		}
		delete(used, i)
	}
	return nil
}

// takeCallLines は、参加者 id の行列から、呼び出しの返事で渡す行（参加の知らせのほか全部: AI 間メッセージ・常駐メッセージ・更新の頼み・AI ラリーの知らせ・
// 承認待ちの承認とキャンセルの知らせ）を取り出す。通り道に貸している物は残す（結果を待つ）。
// 参加の知らせは、呼び出しの返事の「参加しました」が兼ねるので捨てる（h.mu を持って呼ぶ）
func (h *Hub) takeCallLines(id string) []string {
	var lines []string
	var kept []wakeItem
	for _, it := range h.wakeQueue[id] {
		switch {
		case it.lentTo != 0:
			kept = append(kept, it)
		case it.kind != wakeAccepted && it.kind != wakeDeclined && it.kind != wakeCancelled:
			lines = append(lines, it.line)
		}
	}
	if len(kept) == 0 {
		delete(h.wakeQueue, id)
	} else {
		h.wakeQueue[id] = kept
	}
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
		if json.Unmarshal(body, &r) == nil && r.State == stateRequested {
			out[r.ID] = true
		}
	}
	return out
}

// cancelledText は、利用者が参加の要求をキャンセルしたと、AI の次の呼び出しの返事で伝える文
const cancelledText = "The user cancelled your request to join matomezu. Tell the user; you may ask again when the user asks."

// cancelledIn は、バルク actions のうち、要求をキャンセルとして終えるアクション（アクションの定義が cancelsJoinRequest で名乗る物）の宛先の参加者の id（h.mu を持って呼ぶ）
func (h *Hub) cancelledIn(actions []engine.BulkAction) map[string]bool {
	ids, err := h.engine.JoinActions()
	if err != nil || ids == nil || ids.Cancel == "" {
		return nil
	}
	out := map[string]bool{}
	for _, a := range actions {
		if a.Action == ids.Cancel && a.On != nil && a.On.Record != "" {
			out[a.On.Record] = true
		}
	}
	return out
}

// wakeOnParticipants は、窓のアクションの前に要求中だった参加者か、合言葉の join で受け入れた参加者（joinByPass） before のうち、受け入れられた・断られた・キャンセルされた（cancelled）参加者に知らせる（h.mu を持って呼ぶ）
func (h *Hub) wakeOnParticipants(before, cancelled map[string]bool) {
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
		case !ok && cancelled[id]:
			h.enqueueWake(wakeItem{participant: id, kind: wakeCancelled, line: noticeLine("matomezu: join cancelled")})
		case !ok:
			h.enqueueWake(wakeItem{participant: id, kind: wakeDeclined, line: noticeLine("matomezu: join declined")})
		case s.State == stateVisitor:
			h.enqueueWake(wakeItem{participant: id, kind: wakeAccepted, line: noticeLine("matomezu: joined as a visitor (read only)")})
		case s.State == stateJoined:
			// 「参加しました」は、このターンの始まりのフック（talked）か、その参加者の次の呼び出しの返事の、先に来た方が 1 度だけ添える
			// （伝えたと印を付けるので二重にならない。どちらが先かは AI のプログラムによるので、文は両方を言う）
			h.enqueueWake(wakeItem{participant: id, kind: wakeAccepted, line: noticeLine("matomezu: joined as " + rooms[s.Workroom])})
		}
	}
}

func (o Options) aiWatch(w http.ResponseWriter, r *http.Request) {
	host := r.URL.Query().Get("host")
	if host == "" && r.URL.Query().Get("session") == "" {
		http.Error(w, "host or session is needed (the process id of the AI's program, or the session id it started with)", http.StatusBadRequest)
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
	line := o.Hub.OpenWakesWith(host, q.Get("session"), WakeLimits{MaxLine: number("maxLine"), MaxNotice: number("maxNotice"), Gap: time.Duration(number("gap")) * time.Millisecond, Breaks: q.Get("breaks") == "1"})
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
				out, ok := o.Hub.nextWake(line, time.Now())
				if !ok {
					break
				}
				data, _ := json.Marshal(out)
				if _, err := fmt.Fprintf(w, "event: wake\ndata: %s\n\n", data); err != nil {
					return
				}
				flusher.Flush()
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

func (o Options) aiWatchAck(w http.ResponseWriter, r *http.Request) {
	var ack struct {
		Line   int64  `json:"line"`
		ID     string `json:"id"`
		Result string `json:"result"`
	}
	if !readJSON(w, r, &ack) {
		return
	}
	switch ack.Result {
	case WakeDelivered, WakeAbsent, WakeFailed:
	default:
		http.Error(w, "result is delivered, absent or failed", http.StatusBadRequest)
		return
	}
	o.Hub.AckWake(ack.Line, ack.ID, ack.Result, time.Now())
	writeJSON(w, struct{}{})
}
