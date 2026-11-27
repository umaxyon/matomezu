package server

// 外れた参加者の記録: 参加者のレコードがアクションで消えたとき（受け入れで別の会話に替えた・利用者が外した・セッションが終わったと見た・要求を断った・キャンセルした）、
// その会話に伝えるまで、参加者の id とセッション id で引ける記録を持つ。置き場所に残すので、常駐や MCP が起動し直しても（--resume など）伝わる。
// 伝えるのは、その参加者の id を名乗る呼び出しの返事か、そのセッションのターンの始まりのフック（talked）か、そのセッション id を運ぶ呼び出しの返事の、先に来た方の 1 度だけ。
// ワークルームから外れた会話には、次のターンの始まりのフックで、外れたと分かるセッション名も 1 度だけ書かせる

import (
	"encoding/json"
	"fmt"
	"os"
	"slices"
	"time"

	"github.com/umaxyon/matomezu/internal/engine"
	"github.com/umaxyon/matomezu/internal/storage"
)

// departure は、外れた参加者 1 人の記録
type departure struct {
	Participant string   `json:"participant"`
	Sessions    []string `json:"sessions,omitempty"` // 結ばれていたセッション id と、起こす知らせの宛て先のセッション id（空は省く）
	Workroom    string   `json:"workroom,omitempty"` // 入っていたワークルームの名前（要求中・ビジターは空）
	Why         string   `json:"why"`                // departTaken など
	At          string   `json:"at"`
	Told        bool     `json:"told,omitempty"`   // AI に伝えた
	Titled      bool     `json:"titled,omitempty"` // 外れたと分かるセッション名をフックに渡した（ワークルームに入っていなかった物は渡さない）
}

// 外れた訳（データから決める）
const (
	departTaken     = "taken"     // 入っていたワークルームに、同じアクションで別の参加者が入った（利用者が受け入れで替えた）
	departRemoved   = "removed"   // 利用者が外した
	departEnded     = "ended"     // 常駐が、セッションが終わった（ビジターはしばらく呼ばれない）と見て外した
	departDeclined  = "declined"  // 利用者が要求を断った
	departCancelled = "cancelled" // 利用者が要求をキャンセルした
)

// departuresMax は、持つ記録の数の上限（超えたら古い物から捨てる）
const departuresMax = 100

// leavingParticipants は、アクションの出力 out が消す参加者のレコードの、消す前の中身と、消す前のワークルームの id → 名前（h.mu を持って呼ぶ）
func (h *Hub) leavingParticipants(records []engine.RecordChange) (map[string]participantRecord, map[string]string) {
	subject := h.roles["participants"]
	if subject == "" {
		return nil, nil
	}
	leaving := map[string]participantRecord{}
	for _, c := range records {
		if c.Subject != subject || string(c.Record) != removedRecord {
			continue
		}
		entry, ok := h.recordTables[subject][c.ID]
		var s participantRecord
		if ok && json.Unmarshal(entry.body, &s) == nil {
			leaving[c.ID] = s
		}
	}
	if len(leaving) == 0 {
		return nil, nil
	}
	rooms := map[string]string{}
	if list, err := h.workroomsHeld(); err == nil {
		for _, r := range list {
			rooms[r.ID] = r.Name
		}
	}
	return leaving, rooms
}

// noteDepartures は、頼み p を書いたあと、消えた参加者 leaving（消す前の中身。rooms は消す前のワークルームの id → 名前）の記録を残す。
// 常駐が知らせずに消した要求中の参加者（セッションが終わった）と、自分のセッションで入り直した会話（そのセッションに参加（要求）中の参加者が結ばれている）は残さない（h.mu を持って呼ぶ）
func (h *Hub) noteDepartures(leaving map[string]participantRecord, rooms map[string]string, p Perform) {
	if len(leaving) == 0 {
		return
	}
	cancelled := h.cancelledIn(p.Actions)
	ids := make([]string, 0, len(leaving))
	for id := range leaving {
		ids = append(ids, id)
	}
	slices.Sort(ids)
	now := storage.Stamp(time.Now())
	changed := false
	for _, id := range ids {
		s := leaving[id]
		why := ""
		switch {
		case s.State == stateRequested && p.ended:
			continue
		case s.State == stateRequested && cancelled[id]:
			why = departCancelled
		case s.State == stateRequested:
			why = departDeclined
		case !s.accepted():
			continue
		case s.State == stateJoined && h.roomTakenHeld(rooms[s.Workroom], id):
			why = departTaken
		case p.ended:
			why = departEnded
		default:
			why = departRemoved
		}
		n := h.participantNotes[id]
		var sessions []string
		for _, session := range []string{n.SessionID, n.WakeSession} {
			if session != "" && !slices.Contains(sessions, session) {
				sessions = append(sessions, session)
			}
		}
		held := len(sessions) > 0
		for _, session := range sessions {
			held = held && h.sessionSittingHeld(session)
		}
		if held {
			continue
		}
		d := departure{Participant: id, Sessions: sessions, Why: why, At: now}
		if s.State == stateJoined {
			d.Workroom = rooms[s.Workroom]
		}
		// 同じ会話の前の記録は、新しい記録に置き換える
		h.departures = slices.DeleteFunc(h.departures, func(o departure) bool {
			return o.Participant == id || slices.ContainsFunc(o.Sessions, func(x string) bool { return slices.Contains(sessions, x) })
		})
		h.departures = append(h.departures, d)
		changed = true
	}
	if !changed {
		return
	}
	if over := len(h.departures) - departuresMax; over > 0 {
		h.departures = slices.Delete(h.departures, 0, over)
	}
	h.saveDeparturesHeld()
}

// roomTakenHeld は、名前 name のワークルームに、参加者 except のほかの受け入れ済みの参加者が今いるか（ワークルームを作り直したときも、名前で見る。h.mu を持って呼ぶ）
func (h *Hub) roomTakenHeld(name, except string) bool {
	if name == "" {
		return false
	}
	rooms, err := h.workroomsHeld()
	if err != nil {
		return false
	}
	records, err := h.participantsHeld()
	if err != nil {
		return false
	}
	for _, s := range records {
		if s.ID != except && s.State == stateJoined && roomName(rooms, s.Workroom) == name {
			return true
		}
	}
	return false
}

// sessionSittingHeld は、セッション session に、参加（要求）中の参加者が結ばれているか（結ばれたか、起こす知らせの宛て先か。h.mu を持って呼ぶ）
func (h *Hub) sessionSittingHeld(session string) bool {
	records, err := h.participantsHeld()
	if err != nil {
		return false
	}
	for _, s := range records {
		n := h.participantNotes[s.ID]
		if s.sitting() && (n.SessionID == session || n.WakeSession == session) {
			return true
		}
	}
	return false
}

// saveDeparturesHeld は、記録を置き場所に書く（書けなければログに残す。メモリの記録はそのまま使う。h.mu を持って呼ぶ）
func (h *Hub) saveDeparturesHeld() {
	body, err := json.Marshal(h.departures)
	if err == nil {
		err = h.store.PutDepartures(user, body)
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, "could not save the departures:", err)
	}
}

// departureOfParticipantHeld は、参加者 id の記録の番号（無ければ -1。h.mu を持って呼ぶ）
func (h *Hub) departureOfParticipantHeld(id string) int {
	if id == "" {
		return -1
	}
	return slices.IndexFunc(h.departures, func(d departure) bool { return d.Participant == id })
}

// departureOfSessionHeld は、セッション session の記録の番号（無ければ -1）。そのセッションに参加（要求）中の参加者がまた結ばれていれば、記録は役目を終えたので捨てる（h.mu を持って呼ぶ）
func (h *Hub) departureOfSessionHeld(session string) int {
	if session == "" {
		return -1
	}
	i := slices.IndexFunc(h.departures, func(d departure) bool { return slices.Contains(d.Sessions, session) })
	if i < 0 {
		return -1
	}
	if h.sessionSittingHeld(session) {
		h.departures = slices.Delete(h.departures, i, i+1)
		h.saveDeparturesHeld()
		return -1
	}
	return i
}

// tellDepartureHeld は、記録 i をまだ AI に伝えていなければ、伝えたと印を付けて、伝える英語の文を返す（伝え済みなら空。h.mu を持って呼ぶ）
func (h *Hub) tellDepartureHeld(i int) string {
	if i < 0 || h.departures[i].Told {
		return ""
	}
	h.departures[i].Told = true
	text := departureText(h.departures[i])
	h.dropSettledDepartureHeld(i)
	h.saveDeparturesHeld()
	return text
}

// dropSettledDepartureHeld は、記録 i が伝え終わっていれば（AI に伝え、セッション名も渡したか渡さない物）捨てる（h.mu を持って呼ぶ）
func (h *Hub) dropSettledDepartureHeld(i int) {
	d := h.departures[i]
	if d.Told && (d.Titled || d.Workroom == "" || len(d.Sessions) == 0) {
		h.departures = slices.Delete(h.departures, i, i+1)
	}
}

// DepartedSession は、参加者に結ばれていない呼び出しが運んだセッション id session の記録を、まだ伝えていなければ伝える文（無ければ空。ai の包みが返事のヘッダに付ける）
func (h *Hub) DepartedSession(session string) string {
	h.mu.Lock()
	defer h.mu.Unlock()
	return h.tellDepartureHeld(h.departureOfSessionHeld(session))
}

// departedTitleHeld は、セッション session の記録が、外れたと分かるセッション名をまだ渡していないワークルームの物なら、その名前を返し、渡したと印を付ける
// （利用者の設定が書くのを止めていれば、名前は空で、渡したと見る。h.mu を持って呼ぶ）
func (h *Hub) departedTitleHeld(session string) string {
	i := h.departureOfSessionHeld(session)
	if i < 0 || h.departures[i].Titled || h.departures[i].Workroom == "" {
		return ""
	}
	title, ok, err := h.engine.LeftTitle(h.settings, h.departures[i].Workroom)
	if err != nil {
		return ""
	}
	h.departures[i].Titled = true
	h.dropSettledDepartureHeld(i)
	h.saveDeparturesHeld()
	if !ok {
		return ""
	}
	return title
}

// departureText は、外れた記録 d を AI に伝える英語の文
func departureText(d departure) string {
	in := ""
	if d.Workroom != "" {
		in = " (workroom " + d.Workroom + ")"
	}
	switch d.Why {
	case departTaken:
		return "You are no longer a participant of matomezu: the user accepted another conversation into your workroom " + d.Workroom +
			" in your place. Every action is refused now (not-joined). Tell the user; do not join again unless the user asks."
	case departEnded:
		return "You are no longer a participant of matomezu" + in + ": matomezu saw your session end and removed you. " +
			"Every action is refused now (not-joined). Tell the user; do not join again unless the user asks."
	case departCancelled:
		return cancelledText
	case departDeclined:
		return declinedText
	default:
		return "You are no longer a participant of matomezu" + in + ". The reason is known: the user removed you on the matomezu screen. " +
			"Every action is refused now (not-joined). Tell the user this reason; do not join again unless the user asks."
	}
}
