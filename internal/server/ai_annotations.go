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

// annotatedBooks は、ブック（ids。nil なら全部）のうち、アノテーションの有る物（ゴミ箱の中のブックは入れない）の、ブックとページごとのアノテーションの組と、その id
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
		lists := h.annotationsIn(id)
		if !ok || h.outOfSight(id) || len(lists) == 0 {
			continue
		}
		pairs = append(pairs, engine.AnnotatedBook{Book: e.body, Annotations: lists})
		books = append(books, id)
	}
	return pairs, books
}

// AIAnnotations は、ブック（ids。nil なら全部）ごとに、AI に見せるアノテーションの並び（engine.AIAnnotations）を返す。
// ゴミ箱の中のブックと、アノテーションの無いブックは入れない
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

// AIBriefs は、ブックごとに、待っている物を AI に知らせる 1 行（ページの id → アノテーションの id → 1 行。engine.AIBriefs）を返す。AIAnnotations と同じブックだけ
func (h *Hub) AIBriefs() (map[string]map[string]map[string]string, error) {
	pairs, books := h.annotatedBooks(nil)
	out := map[string]map[string]map[string]string{}
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

// AIBook は、AI に見せるブック（本文）: 並びの全部のページ（バインダの中も）を AIPage に通す（読めない形のブックは、渡したまま返す）
func (h *Hub) AIBook(book json.RawMessage) (json.RawMessage, error) {
	lineup := lineupOf(book)
	if lineup == nil {
		return book, nil
	}
	shown, err := mapLineup(lineup, func(p json.RawMessage) (json.RawMessage, error) {
		return h.AIPage(book, p)
	}, nil)
	if err != nil {
		return nil, err
	}
	return withLineup(book, shown)
}

// AIPlaced は、ブック（本文）のページの id ごとの、形の描いた位置と大きさ（engine.AIPlaced。プレゼンテーションが答えなければ null）
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

// aiPage は、1 ページ（{"book", "folder", "page", "version", "annotations", "placed"}。book はそのページを持っているブックの id、folder はそのページが入っているフォルダ（ブックの直下ならブック、バインダの中ならバインダ）の id、version はそのページの版、annotations はそのページの物に立つもの、
// placed はそのページの形の描いた位置と大きさ。プレゼンテーションが答えなければ null）
func (o Options) aiPage(w http.ResponseWriter, r *http.Request) {
	want := r.PathValue("page")
	b := o.Hub.Book(o.Hub.BookOn(&engine.On{Page: want}))
	if b == nil {
		http.Error(w, "no such page", http.StatusNotFound)
		return
	}
	var page json.RawMessage
	for _, p := range pagesOfBook(b.Body) {
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
	folder := o.Hub.FolderOfPage(want)
	list, err := o.annotationsOf(b.ID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	onPage := pick(list, func(a aiAnnotation) bool { return a.Page != nil && *a.Page == want })
	if r.URL.Query().Get("outline") != "" {
		writeJSON(w, map[string]any{"book": b.ID, "folder": folder, "page": outlinePage(page), "version": o.Hub.PageVersion(want), "annotations": onPage, "placed": nil})
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
		writeJSON(w, map[string]any{"book": b.ID, "folder": folder, "page": want, "item": found, "version": o.Hub.PageVersion(want), "annotations": onItem, "placed": inside})
		return
	}
	shown, err := o.Hub.AIPage(b.Body, page)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, map[string]any{"book": b.ID, "folder": folder, "page": shown, "version": o.Hub.PageVersion(want), "annotations": onPage, "placed": placed})
}

// aiAwaiting は、AI の応えを待っているアノテーションの全部（{"awaiting": [{"book", "title", "annotation", "brief"}]}。ブックを置いた順。
// brief は種類の aiBrief が答える、見分けに要る 1 行で、種類が答えなければ無い。UserPromptSubmit のフックはこれを短い行にして貼る）と、
// 見られる前に利用者が戻した AI の変更の全部（"undone"。ai_edit_tickets.go の TellUndone）と、失敗にした AI 編集チケットの全部（"failed"。TellFailed）と、
// 郵便が消えたと記した AI 編集チケットの全部（"removed"。TellRemoved）
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
				ID   string `json:"id"`
				Page string `json:"page"`
			}
			_ = json.Unmarshal(a, &id)
			out = append(out, item{Book: b.ID, Title: head.Title, Annotation: a, Brief: briefs[b.ID][id.Page][id.ID]})
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
	removed, err := o.Hub.TellRemoved()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, map[string]any{"awaiting": out, "undone": undone, "failed": failed, "removed": removed})
}

// aiTalked は、AI のターンの始まりを受ける（AI のフックが知らせる。{"sessionId", "host", "candidates", "woken", "prompt"}）。
// ターンの入力 prompt が通り道に貸した知らせの文（幾つかを改行でつないだ物も。WokenBy）なら woken と同じ。candidates が無く woken でなければ利用者トリガートークのときに行うアクションを行い、入力が貸した知らせの文（幾つかを改行でつないだ物も。WokenBy）なら、利用者の言葉でないと伝える文（wokenText）を添える。有れば会話のセッションの結びつけだけを行う（talk_session.go）
// aiWorkTitle は、セッションの作業名を答える（読むだけ。ターンの終わりのフックが、ADE のワークスペースの表示名に書くのに読む）
func (o Options) aiWorkTitle(w http.ResponseWriter, r *http.Request) {
	var req struct {
		SessionID string `json:"sessionId"`
	}
	if r.ContentLength != 0 && !readJSON(w, r, &req) {
		return
	}
	writeJSON(w, map[string]string{"workTitle": o.Hub.WorkTitle(req.SessionID)})
}

func (o Options) aiTalked(w http.ResponseWriter, r *http.Request) {
	var req struct {
		SessionID  string   `json:"sessionId"`
		Host       string   `json:"host"`
		Candidates []string `json:"candidates"`
		Woken      bool     `json:"woken"`  // 裏の知らせで始まったターン（利用者トリガートークでない）
		Prompt     string   `json:"prompt"` // ターンの入力
	}
	if r.ContentLength != 0 && !readJSON(w, r, &req) {
		return
	}
	lent := false
	if len(req.Candidates) == 0 {
		lent = o.Hub.WokenBy(req.Prompt)
		if !req.Woken && !lent {
			if err := o.Hub.Talked(time.Now()); err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
		}
	}
	done, err := o.Hub.TalkedBy(req.SessionID, req.Host, req.Candidates)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if lent {
		done.ForAI = wokenText
	}
	writeJSON(w, done)
}
