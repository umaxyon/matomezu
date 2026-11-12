package server

import (
	"encoding/json"
	"net/http"
	"slices"
	"time"

	"github.com/umaxyon/matomezu/internal/engine"
)

// aiAnnotation は AI に見せるアノテーションのうち、常駐が読み分けに使うフィールド（ほかは engine が返したまま渡す）
type aiAnnotation struct {
	Page    *string  `json:"page"`
	Awaits  bool     `json:"awaits"`
	Anchors []string `json:"anchors"`
}

// annotatedBooks は、ブック（ids。nil なら全部）のうち、アノテーションの有る物（ゴミ箱のブックは入れない）の、ブックとアノテーションの並びと、その id
func (h *Hub) annotatedBooks(ids []string) ([]engine.AnnotatedBook, []string) {
	h.mu.Lock()
	defer h.mu.Unlock()
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
	return pairs, books
}

// AIAnnotations は、ブック（ids。nil なら全部）ごとに、AI に見せるアノテーションの並び（engine.AIAnnotations）を返す。
// ゴミ箱のブックと、アノテーションの無いブックは入れない
func (h *Hub) AIAnnotations(ids []string) (map[string][]json.RawMessage, error) {
	pairs, books := h.annotatedBooks(ids)
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

// AIBriefs は、ブックごとに、待っている物を AI に知らせる 1 行（アノテーションの id → 1 行。engine.AIBriefs）を返す。AIAnnotations と同じブックだけ
func (h *Hub) AIBriefs() (map[string]map[string]string, error) {
	pairs, books := h.annotatedBooks(nil)
	out := map[string]map[string]string{}
	if len(pairs) == 0 {
		return out, nil
	}
	lists, err := h.engine.AIBriefs(pairs)
	if err != nil {
		return nil, err
	}
	for i, briefs := range lists {
		out[books[i]] = briefs
	}
	return out, nil
}

// AIPage は、AI に見せるページ（engine.AIPage。背景の図形の情報は見せない）
func (h *Hub) AIPage(book, page json.RawMessage) (json.RawMessage, error) {
	return h.engine.AIPage(book, page)
}

// AIBook は、AI に見せるブック（本文）: 全部のページを AIPage に通す（読めない形のブックは、渡したまま返す）
func (h *Hub) AIBook(book json.RawMessage) (json.RawMessage, error) {
	var body map[string]json.RawMessage
	if json.Unmarshal(book, &body) != nil {
		return book, nil
	}
	var pages []json.RawMessage
	if json.Unmarshal(body["pages"], &pages) != nil {
		return book, nil
	}
	for i, p := range pages {
		shown, err := h.AIPage(book, p)
		if err != nil {
			return nil, err
		}
		pages[i] = shown
	}
	raw, err := json.Marshal(pages)
	if err != nil {
		return nil, err
	}
	body["pages"] = raw
	return json.Marshal(body)
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
	if r.URL.Query().Get("outline") != "" {
		writeJSON(w, map[string]any{"id": b.ID, "page": outlinePage(page), "version": b.Version, "annotations": onPage, "placed": nil})
		return
	}
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
	if item := r.URL.Query().Get("item"); item != "" {
		found, ids, ok, err := o.Hub.AIItem(page, item)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if !ok {
			http.Error(w, "no such item", http.StatusNotFound)
			return
		}
		within := func(id string) bool { return slices.Contains(ids, id) }
		onItem := pick(list, func(a aiAnnotation) bool {
			return a.Page != nil && *a.Page == want && slices.ContainsFunc(a.Anchors, within)
		})
		var boxes []map[string]any
		_ = json.Unmarshal(placed, &boxes)
		inside := []map[string]any{}
		for _, box := range boxes {
			if id, _ := box["id"].(string); within(id) {
				inside = append(inside, box)
			}
		}
		writeJSON(w, map[string]any{"id": b.ID, "page": want, "item": found, "version": b.Version, "annotations": onItem, "placed": inside})
		return
	}
	shown, err := o.Hub.AIPage(b.Body, page)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, map[string]any{"id": b.ID, "page": shown, "version": b.Version, "annotations": onPage, "placed": placed})
}

// aiAwaiting は、AI の応えを待っているアノテーションの全部（{"awaiting": [{"book", "title", "annotation", "brief"}]}。ブックを置いた順。
// brief は種類の aiBrief が答える、見分けに要る 1 行で、種類が答えなければ無い。UserPromptSubmit のフックはこれを短い行にして貼る）と、
// 見られる前に利用者が戻した AI の変更の全部（"undone"。ai_edit_tickets.go の TellUndone）と、失敗にした AI 編集チケットの全部（"failed"。TellFailed）
func (o Options) aiAwaiting(w http.ResponseWriter, _ *http.Request) {
	all, err := o.Hub.AIAnnotations(nil)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	briefs, err := o.Hub.AIBriefs()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	type item struct {
		Book       string          `json:"book"`
		Title      string          `json:"title"`
		Annotation json.RawMessage `json:"annotation"`
		Brief      string          `json:"brief,omitempty"`
	}
	out := []item{}
	for _, b := range o.Hub.AIBooks() {
		var head struct {
			Title string `json:"title"`
		}
		_ = json.Unmarshal(b.Body, &head)
		for _, a := range pick(all[b.ID], awaiting) {
			var id struct {
				ID string `json:"id"`
			}
			_ = json.Unmarshal(a, &id)
			out = append(out, item{Book: b.ID, Title: head.Title, Annotation: a, Brief: briefs[b.ID][id.ID]})
		}
	}
	undone, err := o.Hub.TellUndone()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	failed, err := o.Hub.TellFailed()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, map[string]any{"awaiting": out, "undone": undone, "failed": failed})
}

// aiTalked は、AI のターンの始まりを受ける（AI のフックが知らせる。{"sessionId", "host", "candidates"}）。
// candidates が無く woken でなければ利用者トリガートークのときに行うアクションを行い、有れば会話のセッションの結びつけだけを行う（talk_session.go）
func (o Options) aiTalked(w http.ResponseWriter, r *http.Request) {
	var req struct {
		SessionID  string   `json:"sessionId"`
		Host       string   `json:"host"`
		Candidates []string `json:"candidates"`
		Woken      bool     `json:"woken"` // 裏の知らせで始まったターン（利用者トリガートークでない）
	}
	if r.ContentLength != 0 && !readJSON(w, r, &req) {
		return
	}
	if len(req.Candidates) == 0 && !req.Woken {
		if err := o.Hub.Talked(time.Now()); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
	}
	done, err := o.Hub.TalkedBy(req.SessionID, req.Host, req.Candidates)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, done)
}
