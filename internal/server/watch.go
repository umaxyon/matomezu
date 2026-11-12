package server

// AI を起こす知らせ: 利用者が窓で行った事のうち、AI に話しかけを待たずに届ける物を、AI のプログラムのプロセス id（host）ごとの通り道に 1 行ずつ流す。
// AI の側は matomezu watch がこの口につなぎ、届いた 1 行を標準出力に書く（Claude Code のプラグインの monitor が動かす。届いた行で AI のターンが始まる）。
// 流すのは、窓のアクションで、要求中の参加者が受け入れられた・断られた（レコードが消えた）とき。宛て先は、その参加者が join のときに MCP が添えたプロセス id。
// 行は英語の短い知らせだけで、中身（「参加しました」・アノテーション）はこれまでどおり話しかけのフックが添える。
// 通り道がつながっていない間の知らせは溜めない（そのときは、利用者が次に話しかけたときにフックで届く）
//
//	GET /api/ai/watch?host=<プロセス id>  SSE。event: wake、data: {"text"}

import (
	"encoding/json"
	"net/http"
	"strings"
)

// watcher は、AI のプログラム 1 つの、起こす知らせの通り道
type watcher struct {
	host string
	ch   chan event
}

// wakeLineMax は、流す 1 行の長さの上限（文字数）
const wakeLineMax = 300

// Watch は、プロセス id host の AI の、起こす知らせの通り道をつなぐ
func (h *Hub) Watch(host string) *watcher {
	h.mu.Lock()
	defer h.mu.Unlock()
	w := &watcher{host: host, ch: make(chan event, clientBuffer)}
	if h.watchers == nil {
		h.watchers = map[*watcher]struct{}{}
	}
	h.watchers[w] = struct{}{}
	return w
}

// Unwatch は、起こす知らせの通り道を外す
func (h *Hub) Unwatch(w *watcher) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if _, ok := h.watchers[w]; ok {
		delete(h.watchers, w)
		close(w.ch)
	}
}

// wake は、プロセス id host の AI の通り道の全部に、1 行 text を流す。改行はつぶし、長ければ切る。貯まりきった通り道は外す（h.mu を持って呼ぶ）
func (h *Hub) wake(host, text string) {
	if host == "" {
		return
	}
	line := strings.Join(strings.Fields(text), " ")
	if r := []rune(line); len(r) > wakeLineMax {
		line = string(r[:wakeLineMax])
	}
	data, _ := json.Marshal(map[string]string{"text": line})
	for w := range h.watchers {
		if w.host != host {
			continue
		}
		select {
		case w.ch <- event{"wake", data}:
		default:
			delete(h.watchers, w)
			close(w.ch)
		}
	}
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

// wakeOnParticipants は、窓のアクションの前に要求中だった参加者 before のうち、受け入れられた・断られた参加者の AI を起こす（h.mu を持って呼ぶ）
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
		host := h.participantNotes[id].Host
		s, ok := now[id]
		switch {
		case !ok:
			h.wake(host, "matomezu: the user declined your request to join (participant "+id+"). Tell the user, and do not ask again unless the user asks.")
		case s.State == "joined":
			h.wake(host, "matomezu: the user accepted your request to join (participant "+id+", workroom "+rooms[s.Workroom]+"). The welcome comes with this turn.")
		}
	}
}

func (o Options) aiWatch(w http.ResponseWriter, r *http.Request) {
	host := r.URL.Query().Get("host")
	if host == "" {
		http.Error(w, "host is needed (the process id of the AI's program)", http.StatusBadRequest)
		return
	}
	watched := o.Hub.Watch(host)
	defer o.Hub.Unwatch(watched)
	o.stream(w, r, watched.ch)
}
