package server

// AI 編集チケット: AI のアクションがブックを変えるたびに、ブックごとに 1 つ開く（まだ見られていない物）。どれかの窓で見えたら消し、
// 見られる前に窓の利用者の戻す・やり直すで消えたら、消えた所と AI の値を添えて「消えた」にする。消えた物は、AI のフックが聞いたとき
// （GET /api/ai/awaiting の undone）に渡し、次に利用者が AI に話しかけたら消す。ブックごとに aiEditTicketsMax まで（古い物から捨てる）。
//
//	POST /api/ai-edit-tickets   {"book", "act", "outcome": "seen" | "lost", "lost"} 窓が、AI の変更（act は book の知らせの印）を見た・見られる前に消えた

import (
	"encoding/json"
	"net/http"
	"slices"
)

const aiEditTicketsMax = 100

// AIEditTicket は AI 編集チケット 1 つ
type AIEditTicket struct {
	Act     string          `json:"act"`            // book の知らせの印（1 回の Perform。起動し直しても重ならない）
	At      string          `json:"at"`             // 変えた時点
	Version int64           `json:"version"`        // 変えた後のブックの版
	Lost    json.RawMessage `json:"lost,omitempty"` // 見られる前に消えたとき、窓が知らせた消えた所と AI の値
	Told    bool            `json:"told,omitempty"` // 消えたことを AI に渡した
}

// recordAIEditTicket は、AI のアクション act がブック book を版 version にしたことを残す（h.mu を持って呼ぶ）
func (h *Hub) recordAIEditTicket(book string, act string, version int64, at string) error {
	list := append(slices.Clone(h.aiEditTickets[book]), AIEditTicket{Act: act, At: at, Version: version})
	// 多すぎたら、見られていない物の古い方から捨てる（消えた物は AI に渡すまで残す）
	for len(list) > aiEditTicketsMax {
		i := slices.IndexFunc(list, func(c AIEditTicket) bool { return c.Lost == nil })
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
			if c.Lost == nil {
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

// forgetToldAIEditTickets は、AI に渡した、見られる前に消えた AI の変更を消す（利用者が AI に話しかけたとき。h.mu を持って呼ぶ）
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
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil || in.Book == "" || in.Act == "" ||
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
