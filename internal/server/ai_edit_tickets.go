package server

// AI 編集チケット: AI のアクションがブックを変えるたびに、ブックごとに 1 つ開く（まだ見られていない物）。どれかの窓で見えたら消し、
// 見られる前に窓の利用者の戻す・やり直すで消えたら、消えた所と AI の値を添えて「見られる前に消えた」にする。その物は、AI のフックが聞いたとき
// （GET /api/ai/awaiting の undone）に渡し、次に利用者が AI に話しかけたら消す。ブックごとに aiEditTicketsMax まで（古い物から捨てる）。
// アクションが返した変え方（engine.AIEditTicketChange。変更提案郵便を送った・反映した・消したなど）でも、アクションの対象の種類 Subject と Key で見分ける AI 編集チケットを
// 作る・閉じる・失敗にする・郵便が消えたと記す。失敗した物と郵便が消えたと記した物は、AI のフックが聞いたとき（GET /api/ai/awaiting の failed と removed）に渡し、
// 次に利用者が AI に話しかけたら消す。Key で見分ける物は、上限でも捨てない（閉じる・失敗にする・消えたと記すまで残す）。
//
//	POST /api/ai-edit-tickets   {"book", "act", "outcome": "seen" | "lost", "lost"} 窓が、AI の変更（act は book の知らせの印）を見た・見られる前に消えた

import (
	"encoding/json"
	"maps"
	"net/http"
	"slices"

	"github.com/umaxyon/matomezu/internal/engine"
	"github.com/umaxyon/matomezu/internal/storage"
)

const aiEditTicketsMax = 100

// AIEditTicket は AI 編集チケット 1 つ
type AIEditTicket struct {
	Act     string          `json:"act,omitempty"`     // book の知らせの印（1 回の Perform。起動し直しても重ならない）。アクションが返した変え方で作った物は空
	Key     string          `json:"key,omitempty"`     // アクションが返した変え方で作った物の見分け（郵便の id など）
	Subject string          `json:"subject,omitempty"` // アクションが返した変え方で作った物の、アクションの対象の種類（Key はこの種類の中で見分ける。空なら種類を問わない）
	At      string          `json:"at"`                // 変えた時点
	Version int64           `json:"version"`           // 変えた後のブックの版
	Lost    json.RawMessage `json:"lost,omitempty"`    // 見られる前に消えたとき、窓が知らせた消えた所と AI の値
	Told    bool            `json:"told,omitempty"`    // 消えた・失敗したことを AI に渡した
	Failed  bool            `json:"failed,omitempty"`  // アクションが返した変え方で失敗にした
	Changed []string        `json:"changed,omitempty"` // 失敗にしたときの、変わった・無くなった物の id
	Removed string          `json:"removed,omitempty"` // アクションが返した変え方で、郵便が消えたと記したときの消えたわけ（limit か user。空ならそうしていない）
}

// changedTickets は、対象の種類 subject のアクションが返した変え方 c のとおりに AI 編集チケットの並び list を作り直す（作る・閉じる・失敗にする・消えたと記す。
// 閉じる・失敗にする・消えたと記すのは、まだ待っている物だけ）。
// 作るときの変えた後のブックの版は version。変えなければ false
func changedTickets(list []AIEditTicket, subject string, c engine.AIEditTicketChange, version int64, at string) ([]AIEditTicket, bool) {
	list = slices.Clone(list)
	if c.Outcome == "open" {
		return append(list, AIEditTicket{Key: c.Key, Subject: subject, At: at, Version: version}), true
	}
	i := slices.IndexFunc(list, func(t AIEditTicket) bool {
		return t.Key == c.Key && (t.Subject == "" || t.Subject == subject) && !t.Failed && t.Removed == ""
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

// recordedTickets は、AI のアクション act がブックを版 version にしたことを AI 編集チケットの並び list に足す
func recordedTickets(list []AIEditTicket, act string, version int64, at string) []AIEditTicket {
	list = append(slices.Clone(list), AIEditTicket{Act: act, At: at, Version: version})
	// 多すぎたら、見られていない物の古い方から捨てる（消えた物は AI に渡すまで残す）。それも無ければ、消えた物の古い方から捨てる。
	// Key で見分ける物は捨てない（アクションが閉じる・失敗にする・消えたと記すまで残す）
	for len(list) > aiEditTicketsMax {
		i := slices.IndexFunc(list, func(c AIEditTicket) bool { return c.Key == "" && c.Lost == nil })
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

// putTicketLists は、ブックごとの AI 編集チケットの並び lists を 1 つのまとまりで書いて持つ（空の並びなら消す。h.mu を持って呼ぶ）
func (h *Hub) putTicketLists(lists map[string][]AIEditTicket) error {
	if len(lists) == 0 {
		return nil
	}
	batch := storage.Batch{}
	for _, book := range slices.Sorted(maps.Keys(lists)) {
		body, err := json.Marshal(lists[book])
		if err != nil {
			return err
		}
		batch.AIEditTickets = append(batch.AIEditTickets, storage.BookBody{Book: book, Body: body})
	}
	if _, err := h.store.Apply(batch); err != nil {
		return err
	}
	for book, list := range lists {
		if len(list) == 0 {
			delete(h.aiEditTickets, book)
		} else {
			h.aiEditTickets[book] = list
		}
	}
	return nil
}

func (h *Hub) putAIEditTickets(book string, list []AIEditTicket) error {
	return h.putTicketLists(map[string][]AIEditTicket{book: list})
}

// SettleAIEditTicket は、窓が AI の変更 act（ブック book）を見た（lost が nil）か、見られる前に消えた（lost に消えた所と AI の値）ことを受ける。
// まだ見られていない AI 編集チケットだけを変える（ほかの窓で見えて、もう無ければ何もしない）
func (h *Hub) SettleAIEditTicket(book string, act string, lost json.RawMessage) error {
	h.mu.Lock()
	defer h.mu.Unlock()
	list := slices.Clone(h.aiEditTickets[book])
	i := slices.IndexFunc(list, func(c AIEditTicket) bool { return c.Act == act && c.Lost == nil })
	if i < 0 {
		return nil
	}
	if lost == nil {
		list = slices.Delete(list, i, i+1)
	} else {
		list[i].Lost = lost
	}
	return h.putAIEditTickets(book, list)
}

// UndoneAIEditTicket は、見られる前に消えた AI の変更 1 つ（AI に渡す形）
type UndoneAIEditTicket struct {
	Book  string          `json:"book"`
	Title string          `json:"title"`
	At    string          `json:"at"`
	Lost  json.RawMessage `json:"lost"`
}

// TellUndone は、見られる前に消えた AI の変更の全部（ゴミ箱のブックの物は除く。ブックを置いた順）を返し、AI に渡した印を付ける
func (h *Hub) TellUndone() ([]UndoneAIEditTicket, error) {
	h.mu.Lock()
	defer h.mu.Unlock()
	out := []UndoneAIEditTicket{}
	changed := map[string][]AIEditTicket{}
	for _, id := range h.order {
		e, ok := h.books[id]
		list := slices.Clone(h.aiEditTickets[id])
		if !ok || e.trashed || len(list) == 0 {
			continue
		}
		var head struct {
			Title string `json:"title"`
		}
		_ = json.Unmarshal(e.body, &head)
		told := false
		for i, c := range list {
			if c.Lost == nil || c.Key != "" {
				continue
			}
			out = append(out, UndoneAIEditTicket{Book: id, Title: head.Title, At: c.At, Lost: c.Lost})
			if !c.Told {
				list[i].Told = true
				told = true
			}
		}
		if told {
			changed[id] = list
		}
	}
	if err := h.putTicketLists(changed); err != nil {
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

// TellFailed は、アクションが返した変え方で失敗にした AI 編集チケットの全部（ゴミ箱のブックの物は除く。ブックを置いた順）を返し、AI に渡した印を付ける
func (h *Hub) TellFailed() ([]FailedAIEditTicket, error) {
	h.mu.Lock()
	defer h.mu.Unlock()
	out := []FailedAIEditTicket{}
	changed := map[string][]AIEditTicket{}
	for _, id := range h.order {
		e, ok := h.books[id]
		list := slices.Clone(h.aiEditTickets[id])
		if !ok || e.trashed || len(list) == 0 {
			continue
		}
		var head struct {
			Title string `json:"title"`
		}
		_ = json.Unmarshal(e.body, &head)
		told := false
		for i, c := range list {
			if !c.Failed {
				continue
			}
			out = append(out, FailedAIEditTicket{Book: id, Title: head.Title, Key: c.Key, Changed: append([]string{}, c.Changed...)})
			if !c.Told {
				list[i].Told = true
				told = true
			}
		}
		if told {
			changed[id] = list
		}
	}
	if err := h.putTicketLists(changed); err != nil {
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

// TellRemoved は、アクションが返した変え方で消えたと記した AI 編集チケットの全部（ゴミ箱のブックの物は除く。ブックを置いた順）を返し、AI に渡した印を付ける
func (h *Hub) TellRemoved() ([]RemovedAIEditTicket, error) {
	h.mu.Lock()
	defer h.mu.Unlock()
	out := []RemovedAIEditTicket{}
	changed := map[string][]AIEditTicket{}
	for _, id := range h.order {
		e, ok := h.books[id]
		list := slices.Clone(h.aiEditTickets[id])
		if !ok || e.trashed || len(list) == 0 {
			continue
		}
		var head struct {
			Title string `json:"title"`
		}
		_ = json.Unmarshal(e.body, &head)
		told := false
		for i, c := range list {
			if c.Removed == "" {
				continue
			}
			out = append(out, RemovedAIEditTicket{Book: id, Title: head.Title, Key: c.Key, Cause: c.Removed})
			if !c.Told {
				list[i].Told = true
				told = true
			}
		}
		if told {
			changed[id] = list
		}
	}
	if err := h.putTicketLists(changed); err != nil {
		return nil, err
	}
	return out, nil
}

// forgetToldAIEditTickets は、AI に渡した、見られる前に消えた AI の変更と、失敗にした・消えたと記した AI 編集チケットを消す（利用者が AI に話しかけたとき。h.mu を持って呼ぶ）
func (h *Hub) forgetToldAIEditTickets() error {
	changed := map[string][]AIEditTicket{}
	for _, id := range slices.Clone(h.order) {
		list := h.aiEditTickets[id]
		kept := slices.DeleteFunc(slices.Clone(list), func(c AIEditTicket) bool { return c.Told })
		if len(kept) != len(list) {
			changed[id] = kept
		}
	}
	return h.putTicketLists(changed)
}

// aiEditTicket は、窓が AI の変更を見た・見られる前に消えたことを受ける
func (o Options) aiEditTicket(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Book    string          `json:"book"`
		Act     string          `json:"act"`
		Outcome string          `json:"outcome"`
		Lost    json.RawMessage `json:"lost"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxBody)).Decode(&in); err != nil || in.Book == "" || in.Act == "" ||
		(in.Outcome != "seen" && in.Outcome != "lost") || (in.Outcome == "lost" && len(in.Lost) == 0) {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	lost := in.Lost
	if in.Outcome == "seen" {
		lost = nil
	}
	if err := o.Hub.SettleAIEditTicket(in.Book, in.Act, lost); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, map[string]any{})
}
