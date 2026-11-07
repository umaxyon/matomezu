package server

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/umaxyon/matomezu/internal/engine"
)

// aiAnnotation は AI に見せるアノテーションのうち、常駐が読み分けに使うフィールド（ほかは engine が返したまま渡す）
type aiAnnotation struct {
	Page   *string `json:"page"`
	Awaits bool    `json:"awaits"`
}

// AIAnnotations は、ブック（ids。nil なら全部）ごとに、AI に見せるアノテーションの並び（engine.AIAnnotations）を返す。
// ゴミ箱のブックと、アノテーションの無いブックは入れない
func (h *Hub) AIAnnotations(ids []string) (map[string][]json.RawMessage, error) {
	h.mu.Lock()
	var pairs []engine.AnnotatedBook
	var books []string
	if ids == nil {
		ids = h.order
	}
	for _, id := range ids {
		e, ok := h.books[id]
		list, has := h.annotations[id]
		if !ok || e.trashed || !has {
			continue
		}
		pairs = append(pairs, engine.AnnotatedBook{Book: e.body, Annotations: list})
		books = append(books, id)
	}
	h.mu.Unlock()
	out := map[string][]json.RawMessage{}
	if len(pairs) == 0 {
		return out, nil
	}
	lists, err := h.engine.AIAnnotations(pairs)
	if err != nil {
		return nil, err
	}
	for i, raw := range lists {
		var list []json.RawMessage
		if err := json.Unmarshal(raw, &list); err != nil {
			return nil, err
		}
		out[books[i]] = list
	}
	return out, nil
}

// AIPlaced は、ブック（本文）のページの id ごとの、形の描いた位置と大きさ（engine.AIPlaced。見せ方が答えなければ null）
func (h *Hub) AIPlaced(book json.RawMessage) (json.RawMessage, error) {
	return h.engine.AIPlaced(book)
}

// pick は、並びのうち keep が真の物（読めない物は除く）
func pick(list []json.RawMessage, keep func(aiAnnotation) bool) []json.RawMessage {
	out := []json.RawMessage{}
	for _, raw := range list {
		var a aiAnnotation
		if json.Unmarshal(raw, &a) == nil && keep(a) {
			out = append(out, raw)
		}
	}
	return out
}

func awaiting(a aiAnnotation) bool { return a.Awaits }

// annotationsOf は、1 冊のブックの AI に見せるアノテーション（無ければ空の並び）
func (o Options) annotationsOf(book string) ([]json.RawMessage, error) {
	all, err := o.Hub.AIAnnotations([]string{book})
	if err != nil {
		return nil, err
	}
	if list := all[book]; list != nil {
		return list, nil
	}
	return []json.RawMessage{}, nil
}

// aiPage は、ブックの 1 ページ（{"id", "page", "version", "annotations", "placed"}。annotations はそのページの物に立つもの、
// placed はそのページの形の描いた位置と大きさ。見せ方が答えなければ null）
func (o Options) aiPage(w http.ResponseWriter, r *http.Request) {
	b := o.Hub.Book(r.PathValue("id"))
	if b == nil {
		http.Error(w, "no such book", http.StatusNotFound)
		return
	}
	var body struct {
		Pages []json.RawMessage `json:"pages"`
	}
	_ = json.Unmarshal(b.Body, &body)
	want := r.PathValue("page")
	var page json.RawMessage
	for _, p := range body.Pages {
		var head struct {
			ID string `json:"id"`
		}
		if json.Unmarshal(p, &head) == nil && head.ID == want {
			page = p
		}
	}
	if page == nil {
		http.Error(w, "no such page", http.StatusNotFound)
		return
	}
	list, err := o.annotationsOf(b.ID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	onPage := pick(list, func(a aiAnnotation) bool { return a.Page != nil && *a.Page == want })
	all, err := o.Hub.AIPlaced(b.Body)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	var byPage map[string]json.RawMessage
	_ = json.Unmarshal(all, &byPage)
	placed := byPage[want]
	if placed == nil {
		placed = json.RawMessage("null")
	}
	writeJSON(w, map[string]any{"id": b.ID, "page": page, "version": b.Version, "annotations": onPage, "placed": placed})
}

// aiAwaiting は、AI の応えを待っているアノテーションの全部（{"awaiting": [{"book", "title", "annotation"}]}。ブックを置いた順）と、
// 見られる前に利用者が戻した AI の変更の全部（"undone"。ai_changes.go の TellUndone）
func (o Options) aiAwaiting(w http.ResponseWriter, _ *http.Request) {
	all, err := o.Hub.AIAnnotations(nil)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	type item struct {
		Book       string          `json:"book"`
		Title      string          `json:"title"`
		Annotation json.RawMessage `json:"annotation"`
	}
	out := []item{}
	for _, b := range o.Hub.AIBooks() {
		var head struct {
			Title string `json:"title"`
		}
		_ = json.Unmarshal(b.Body, &head)
		for _, a := range pick(all[b.ID], awaiting) {
			out = append(out, item{Book: b.ID, Title: head.Title, Annotation: a})
		}
	}
	undone, err := o.Hub.TellUndone()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, map[string]any{"awaiting": out, "undone": undone})
}

// aiTalked は、利用者が AI に話しかけたことを受ける（AI のフックが知らせる。{}）
func (o Options) aiTalked(w http.ResponseWriter, _ *http.Request) {
	if err := o.Hub.Talked(time.Now()); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, map[string]any{})
}
