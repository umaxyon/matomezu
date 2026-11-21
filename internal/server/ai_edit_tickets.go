package server

// AI 編集チケット: AI のアクションがページかフォルダを変えるたびに、1 回のアクションに 1 つ開く（変えたページとフォルダのうち、まだどの窓でも見られていない物の id を持つ）。
// 窓で見えた物は外し、全部見えたら消す。見られる前に窓の利用者の戻す・やり直すで消えたら、消えた所と AI の値を添えて「見られる前に消えた」にする
// （ステージエントリごと）。その物は、AI のフックが聞いたとき
// （GET /api/ai/awaiting の undone）に渡し、次の利用者トリガートークで消す。全部で aiEditTicketsMax まで（古い物から捨てる）。
// アクションが返した変え方（engine.AIEditTicketChange。変更提案郵便を送った・反映した・消したなど）でも、アクションの対象の種類 Subject と Key とブックで見分ける AI 編集チケットを
// 作る・閉じる・失敗にする・郵便が消えたと記す。失敗した物と郵便が消えたと記した物は、AI のフックが聞いたとき（GET /api/ai/awaiting の failed と removed）に渡し、
// 次の利用者トリガートークで消す。Key で見分ける物は、上限でも捨てない（閉じる・失敗にする・消えたと記すまで残す）。
// 並びは全部で 1 つ（古い順）で、ブックか、ブックの外のページ・バインダを消すと、その物の分も一緒に消す。
//
//	POST /api/ai-edit-tickets   {"act", "places", "outcome": "seen" | "lost", "entry", "lost"} 窓が、AI の変更（act は changed の知らせの印）のうち、
//	                            ページとフォルダ places を見た・見られる前に消えた（消えたときだけ、変えた物のステージエントリ entry と、消えた所と AI の値 lost
//	                            [{"entry", "at", …}]。lost の entry はページかフォルダの id、at はその行の中の道。消えたのがステージエントリの外の物だけなら、lost は空の並び）

import (
	"encoding/json"
	"net/http"
	"slices"

	"github.com/umaxyon/matomezu/internal/engine"
	"github.com/umaxyon/matomezu/internal/storage"
)

const aiEditTicketsMax = 100

// LostIn は、見られる前に消えた AI の変更の、ステージエントリ 1 つの分（Entry はその id。Lost は、窓が知らせた消えた所と AI の値）
type LostIn struct {
	Entry string          `json:"entry"`
	Lost  json.RawMessage `json:"lost"`
}

// AIEditTicket は AI 編集チケット 1 つ（AI のアクションごとの物は Act、アクションが返した変え方で作った物は Key を持つ）
type AIEditTicket struct {
	Act     string   `json:"act,omitempty"`     // changed の知らせの印（1 回の Perform。起動し直しても重ならない）。アクションが返した変え方で作った物は空
	Unseen  []string `json:"unseen,omitempty"`  // Act の物の、変えたページとフォルダのうち、まだどの窓でも見られていない物の id
	Lost    []LostIn `json:"lost,omitempty"`    // Act の物の、見られる前に消えた分（ステージエントリごと。窓が知らせた順）
	Key     string   `json:"key,omitempty"`     // アクションが返した変え方で作った物の見分け（郵便の id など）
	Subject string   `json:"subject,omitempty"` // アクションが返した変え方で作った物の、アクションの対象の種類（Key はこの種類の中で見分ける。空なら種類を問わない）
	Book    string   `json:"book,omitempty"`    // アクションが返した変え方で作った物の、アクションが名指したブック
	At      string   `json:"at"`                // 変えた時点
	Told    bool     `json:"told,omitempty"`    // 消えた・失敗したことを AI に渡した
	Failed  bool     `json:"failed,omitempty"`  // アクションが返した変え方で失敗にした
	Changed []string `json:"changed,omitempty"` // 失敗にしたときの、変わった・無くなった物の id
	Removed string   `json:"removed,omitempty"` // アクションが返した変え方で、郵便が消えたと記したときの消えたわけ（limit か user。空ならそうしていない）
}

// changedTickets は、対象の種類 subject のアクションが返した変え方 c のとおりに AI 編集チケットの並び list を作り直す（作る・閉じる・失敗にする・消えたと記す。
// 閉じる・失敗にする・消えたと記すのは、まだ待っている物だけ）。
// 変えなければ false
func changedTickets(list []AIEditTicket, subject string, c engine.AIEditTicketChange, at string) ([]AIEditTicket, bool) {
	list = slices.Clone(list)
	if c.Outcome == "open" {
		return append(list, AIEditTicket{Key: c.Key, Subject: subject, Book: c.Book, At: at}), true
	}
	i := slices.IndexFunc(list, func(t AIEditTicket) bool {
		return t.Key == c.Key && t.Book == c.Book && (t.Subject == "" || t.Subject == subject) && !t.Failed && t.Removed == ""
	})
	if i < 0 {
		return list, false
	}
	switch c.Outcome {
	case "closed":
		list = slices.Delete(list, i, i+1)
	case "failed":
		list[i].Failed = true
		list[i].Changed = c.Changed
	case "removed":
		list[i].Removed = c.Cause
	default:
		return list, false
	}
	return list, true
}

// recordedTickets は、AI のアクション act がページとフォルダ unseen を変えたことを AI 編集チケットの並び list に足す
func recordedTickets(list []AIEditTicket, act string, at string, unseen []string) []AIEditTicket {
	list = append(slices.Clone(list), AIEditTicket{Act: act, Unseen: unseen, At: at})
	// 多すぎたら、見られていない物の古い方から捨てる（消えた物は AI に渡すまで残す）。それも無ければ、消えた物の古い方から捨てる。
	// Key で見分ける物は捨てない（アクションが閉じる・失敗にする・消えたと記すまで残す）
	for len(list) > aiEditTicketsMax {
		i := slices.IndexFunc(list, func(c AIEditTicket) bool { return c.Key == "" && len(c.Lost) == 0 })
		if i < 0 {
			i = slices.IndexFunc(list, func(c AIEditTicket) bool { return c.Key == "" })
		}
		if i < 0 {
			break
		}
		list = slices.Delete(list, i, i+1)
	}
	return list
}

// prunedTickets は、消すブック books（その中のページとフォルダの id と、消すブックの外のページ・バインダの id は gone）の分を AI 編集チケットの並び list から外す:
// Key で見分ける物はそのブックの物を消し、Act の物は、まだ見られていない物の id と、見られる前に消えた分から、消す物の分を外す（何も残らない物は消す）。変えなければ false
func prunedTickets(list []AIEditTicket, books, gone map[string]bool) ([]AIEditTicket, bool) {
	out := make([]AIEditTicket, 0, len(list))
	changed := false
	for _, t := range list {
		if t.Key != "" {
			if books[t.Book] {
				changed = true
				continue
			}
			out = append(out, t)
			continue
		}
		unseen := slices.DeleteFunc(slices.Clone(t.Unseen), func(id string) bool { return gone[id] })
		lost := slices.DeleteFunc(slices.Clone(t.Lost), func(l LostIn) bool { return books[l.Entry] || gone[l.Entry] })
		if len(unseen) == len(t.Unseen) && len(lost) == len(t.Lost) {
			out = append(out, t)
			continue
		}
		changed = true
		if len(unseen) == 0 && len(lost) == 0 {
			continue
		}
		t.Unseen, t.Lost = unseen, lost
		out = append(out, t)
	}
	return out, changed
}

// ticketsBody は、AI 編集チケットの並び list の、置き場所に書く形（空なら空の並び）
func ticketsBody(list []AIEditTicket) (json.RawMessage, error) {
	if len(list) == 0 {
		return json.RawMessage("[]"), nil
	}
	return json.Marshal(list)
}

// putTickets は、AI 編集チケットの並びの全部を list にして書いて持つ（h.mu を持って呼ぶ）
func (h *Hub) putTickets(list []AIEditTicket) error {
	body, err := ticketsBody(list)
	if err != nil {
		return err
	}
	if err := h.store.PutAIEditTickets(body); err != nil {
		return err
	}
	h.aiEditTickets = list
	return nil
}

// SettleAIEditTicket は、窓が AI の変更 act のうち、ページとフォルダ places を見た（lost が nil）か、ステージエントリ entry の分が見られる前に消えた（lost に消えた所と AI の値）ことを受ける。
// まだ見られていない物だけを変える（ほかの窓で見えて、もう無ければ何もしない）。全部見えて、消えた分も無ければ、AI 編集チケットを消す
func (h *Hub) SettleAIEditTicket(act, entry string, places []string, lost json.RawMessage) error {
	h.mu.Lock()
	defer h.mu.Unlock()
	list := slices.Clone(h.aiEditTickets)
	i := slices.IndexFunc(list, func(c AIEditTicket) bool { return c.Key == "" && c.Act == act })
	if i < 0 {
		return nil
	}
	t := list[i]
	left := slices.DeleteFunc(slices.Clone(t.Unseen), func(id string) bool { return slices.Contains(places, id) })
	if len(left) == len(t.Unseen) {
		return nil
	}
	t.Unseen = left
	if lost != nil {
		// 渡したあとに消えた分が増えたら、それも渡すまで残す
		t.Lost, t.Told = append(slices.Clone(t.Lost), LostIn{Entry: entry, Lost: lost}), false
	}
	if len(t.Unseen) == 0 && len(t.Lost) == 0 {
		list = slices.Delete(list, i, i+1)
	} else {
		list[i] = t
	}
	return h.putTickets(list)
}

// titleOfTold は、AI に渡す物のブック id の名前（置いていないブックとゴミ箱の中のブックの物は渡さないので false。h.mu を持って呼ぶ）
func (h *Hub) titleOfTold(id string) (string, bool) {
	e, ok := h.books[id]
	if !ok || h.outOfSight(id) {
		return "", false
	}
	var head struct {
		Title string `json:"title"`
	}
	_ = json.Unmarshal(e.body, &head)
	return head.Title, true
}

// titleOfStageEntry は、AI に渡す物のステージエントリ id（ブックか、書庫ホームかフォルダの直下のページ・バインダ）の名前
// （置いていない物と、AI に見せない物は渡さないので false。h.mu を持って呼ぶ）
func (h *Hub) titleOfStageEntry(id string) (string, bool) {
	if title, ok := h.titleOfTold(id); ok {
		return title, true
	}
	if h.entryNotInBook(id) == id {
		title, _, _ := rowHead(h.pages[id].body)
		return title, true
	}
	binder, ok := h.folders[id]
	holder, held := h.folders[h.places[id]]
	if !ok || binder.role != storage.RoleBinder || !held || !holder.isOpen() || h.outOfSight(id) {
		return "", false
	}
	title, _, _ := rowHead(binder.body)
	return title, true
}

// tell は、AI 編集チケットの並びの古い順に each を呼び、渡した（true を返した）物に、AI に渡した印を付けて書く（h.mu を持って呼ぶ）
func (h *Hub) tell(each func(t AIEditTicket) bool) error {
	list := slices.Clone(h.aiEditTickets)
	told := false
	for i, t := range list {
		if each(t) && !t.Told {
			list[i].Told = true
			told = true
		}
	}
	if !told {
		return nil
	}
	return h.putTickets(list)
}

// UndoneAIEditTicket は、見られる前に消えた AI の変更の、ステージエントリ 1 つの分（AI に渡す形。Entry はその id）
type UndoneAIEditTicket struct {
	Entry string          `json:"entry"`
	Title string          `json:"title"`
	At    string          `json:"at"`
	Lost  json.RawMessage `json:"lost"`
}

// TellUndone は、見られる前に消えた AI の変更の全部（ゴミ箱の中の物は除く。変えた順）を返し、AI に渡した印を付ける
func (h *Hub) TellUndone() ([]UndoneAIEditTicket, error) {
	h.mu.Lock()
	defer h.mu.Unlock()
	out := []UndoneAIEditTicket{}
	err := h.tell(func(t AIEditTicket) bool {
		given := false
		if t.Key != "" {
			return false
		}
		for _, l := range t.Lost {
			if title, ok := h.titleOfStageEntry(l.Entry); ok {
				out = append(out, UndoneAIEditTicket{Entry: l.Entry, Title: title, At: t.At, Lost: l.Lost})
				given = true
			}
		}
		return given
	})
	if err != nil {
		return nil, err
	}
	return out, nil
}

// FailedAIEditTicket は、アクションが返した変え方で失敗にした AI 編集チケット 1 つ（AI に渡す形。Key は郵便の id など）
type FailedAIEditTicket struct {
	Book    string   `json:"book"`
	Title   string   `json:"title"`
	Key     string   `json:"key"`
	Changed []string `json:"changed"`
}

// TellFailed は、アクションが返した変え方で失敗にした AI 編集チケットの全部（ゴミ箱の中のブックの物は除く。変えた順）を返し、AI に渡した印を付ける
func (h *Hub) TellFailed() ([]FailedAIEditTicket, error) {
	h.mu.Lock()
	defer h.mu.Unlock()
	out := []FailedAIEditTicket{}
	err := h.tell(func(t AIEditTicket) bool {
		title, ok := h.titleOfTold(t.Book)
		if !t.Failed || !ok {
			return false
		}
		out = append(out, FailedAIEditTicket{Book: t.Book, Title: title, Key: t.Key, Changed: append([]string{}, t.Changed...)})
		return true
	})
	if err != nil {
		return nil, err
	}
	return out, nil
}

// RemovedAIEditTicket は、アクションが返した変え方で、郵便が消えたと記した AI 編集チケット 1 つ（AI に渡す形。Key は郵便の id など、Cause は消えたわけ）
type RemovedAIEditTicket struct {
	Book  string `json:"book"`
	Title string `json:"title"`
	Key   string `json:"key"`
	Cause string `json:"cause"`
}

// TellRemoved は、アクションが返した変え方で消えたと記した AI 編集チケットの全部（ゴミ箱の中のブックの物は除く。変えた順）を返し、AI に渡した印を付ける
func (h *Hub) TellRemoved() ([]RemovedAIEditTicket, error) {
	h.mu.Lock()
	defer h.mu.Unlock()
	out := []RemovedAIEditTicket{}
	err := h.tell(func(t AIEditTicket) bool {
		title, ok := h.titleOfTold(t.Book)
		if t.Removed == "" || !ok {
			return false
		}
		out = append(out, RemovedAIEditTicket{Book: t.Book, Title: title, Key: t.Key, Cause: t.Removed})
		return true
	})
	if err != nil {
		return nil, err
	}
	return out, nil
}

// forgetToldAIEditTickets は、AI に渡した、見られる前に消えた AI の変更と、失敗にした・消えたと記した AI 編集チケットを消す（利用者トリガートークのとき。h.mu を持って呼ぶ）
func (h *Hub) forgetToldAIEditTickets() error {
	kept := slices.DeleteFunc(slices.Clone(h.aiEditTickets), func(c AIEditTicket) bool { return c.Told })
	if len(kept) == len(h.aiEditTickets) {
		return nil
	}
	return h.putTickets(kept)
}

// aiEditTicket は、窓が AI の変更を見た・見られる前に消えたことを受ける
func (o Options) aiEditTicket(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Entry   string          `json:"entry"`
		Act     string          `json:"act"`
		Places  []string        `json:"places"`
		Outcome string          `json:"outcome"`
		Lost    json.RawMessage `json:"lost"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxBody)).Decode(&in); err != nil || in.Act == "" ||
		(in.Outcome != "seen" && in.Outcome != "lost") || (in.Outcome == "lost" && (in.Entry == "" || len(in.Lost) == 0)) {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	lost := in.Lost
	if in.Outcome == "seen" {
		lost = nil
	}
	if err := o.Hub.SettleAIEditTicket(in.Act, in.Entry, in.Places, lost); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, map[string]any{})
}
