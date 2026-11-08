package server

// AI 編集チケット: AI のアクションがブックを変えるたびに、ブックごとに 1 つ開く（まだ見られていない物）。どれかの窓で見えたら消し、
// 見られる前に窓の利用者の戻す・やり直すで消えたら、消えた所と AI の値を添えて「消えた」にする。消えた物は、AI のフックが聞いたとき
// （GET /api/ai/awaiting の undone）に渡し、次に利用者が AI に話しかけたら消す。ブックごとに aiEditTicketsMax まで（古い物から捨てる）。
// アクションが返した変え方（engine.AIEditTicketChange。変更提案郵便を送った・反映したなど）でも、Key で見分けるチケットを作る・閉じる・失敗にする。
// 失敗した物は、AI のフックが聞いたとき（GET /api/ai/awaiting の failed）に渡し、次に利用者が AI に話しかけたら消す。
//
//	POST /api/ai-edit-tickets   {"book", "act", "outcome": "seen" | "lost", "lost"} 窓が、AI の変更（act は book の知らせの印）を見た・見られる前に消えた

import (
	"encoding/json"
	"net/http"
	"slices"

	"github.com/umaxyon/matomezu/internal/engine"
)

const aiEditTicketsMax = 100

// AIEditTicket は AI 編集チケット 1 つ
type AIEditTicket struct {
	Act     string          `json:"act,omitempty"`     // book の知らせの印（1 回の Perform。起動し直しても重ならない）。アクションが返した変え方で作った物は空
	Key     string          `json:"key,omitempty"`     // アクションが返した変え方で作った物の見分け（郵便の id など）
	At      string          `json:"at"`                // 変えた時点
	Version int64           `json:"version"`           // 変えた後のブックの版
	Lost    json.RawMessage `json:"lost,omitempty"`    // 見られる前に消えたとき、窓が知らせた消えた所と AI の値
	Told    bool            `json:"told,omitempty"`    // 消えた・失敗したことを AI に渡した
	Failed  bool            `json:"failed,omitempty"`  // アクションが返した変え方で失敗にした
	Changed []string        `json:"changed,omitempty"` // 失敗にしたときの、変わった・無くなった物の id
}

// changeAIEditTicket は、アクションが返した変え方 c のとおりにチケットを作る・閉じる・失敗にする（閉じる・失敗にするのは、まだ待っている物だけ。h.mu を持って呼ぶ）
func (h *Hub) changeAIEditTicket(c engine.AIEditTicketChange, at string) error {
	list := slices.Clone(h.aiEditTickets[c.Book])
	if c.Outcome == "open" {
		return h.putAIEditTickets(c.Book, append(list, AIEditTicket{Key: c.Key, At: at, Version: h.books[c.Book].version}))
	}
	i := slices.IndexFunc(list, func(t AIEditTicket) bool { return t.Key == c.Key && !t.Failed })
	if i < 0 {
		return nil
	}
	switch c.Outcome {
	case "closed":
		list = slices.Delete(list, i, i+1)
	case "failed":
		list[i].Failed = true
		list[i].Changed = c.Changed
	}
	return h.putAIEditTickets(c.Book, list)
}

// recordAIEditTicket は、AI のアクション act がブック book を版 version にしたことを残す（h.mu を持って呼ぶ）
func (h *Hub) recordAIEditTicket(book string, act string, version int64, at string) error {
	list := append(slices.Clone(h.aiEditTickets[book]), AIEditTicket{Act: act, At: at, Version: version})
	// 多すぎたら、見られていない物の古い方から捨てる（消えた物は AI に渡すまで残す）
	for len(list) > aiEditTicketsMax {
		i := slices.IndexFunc(list, func(c AIEditTicket) bool { return c.Lost == nil && !c.Failed })
		if i < 0 {
			i = 0
		}
		list = slices.Delete(list, i, i+1)
	}
	return h.putAIEditTickets(book, list)
}

func (h *Hub) putAIEditTickets(book string, list []AIEditTicket) error {
	body, err := json.Marshal(list)
	if err != nil {
		return err
	}
	if err := h.store.PutAIEditTickets(book, body); err != nil {
		return err
	}
	if len(list) == 0 {
		delete(h.aiEditTickets, book)
	} else {
		h.aiEditTickets[book] = list
	}
	return nil
}

// SettleAIEditTicket は、窓が AI の変更 act（ブック book）を見た（lost が nil）か、見られる前に消えた（lost に消えた所と AI の値）ことを受ける。
// まだ見られていないチケットだけを変える（ほかの窓で見えて、もう無ければ何もしない）
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
			if err := h.putAIEditTickets(id, list); err != nil {
				return nil, err
			}
		}
	}
	return out, nil
}

// FailedAIEditTicket は、アクションが返した変え方で失敗にしたチケット 1 つ（AI に渡す形。Key は郵便の id など）
type FailedAIEditTicket struct {
	Book    string   `json:"book"`
	Title   string   `json:"title"`
	Key     string   `json:"key"`
	Changed []string `json:"changed"`
}

// TellFailed は、アクションが返した変え方で失敗にしたチケットの全部（ゴミ箱のブックの物は除く。ブックを置いた順）を返し、AI に渡した印を付ける
func (h *Hub) TellFailed() ([]FailedAIEditTicket, error) {
	h.mu.Lock()
	defer h.mu.Unlock()
	out := []FailedAIEditTicket{}
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
			if err := h.putAIEditTickets(id, list); err != nil {
				return nil, err
			}
		}
	}
	return out, nil
}

// forgetToldAIEditTickets は、AI に渡した、見られる前に消えた AI の変更と失敗にしたチケットを消す（利用者が AI に話しかけたとき。h.mu を持って呼ぶ）
func (h *Hub) forgetToldAIEditTickets() error {
	for _, id := range slices.Clone(h.order) {
		list := h.aiEditTickets[id]
		kept := slices.DeleteFunc(slices.Clone(list), func(c AIEditTicket) bool { return c.Told })
		if len(kept) != len(list) {
			if err := h.putAIEditTickets(id, kept); err != nil {
				return err
			}
		}
	}
	return nil
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
