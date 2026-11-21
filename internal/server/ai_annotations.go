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

// stageEntry は、ステージエントリ（ブックか、ブックの外のページ）を AI に指し示す形（{"kind", "id"}。kind は book か page）
type stageEntry struct {
	Kind string `json:"kind"`
	ID   string `json:"id"`
}

// pagesNotInBooks は、ブックの外のページ（書庫ホームかフォルダの直下に在るページ。バインダの中・ゴミ箱の中・読めない物は入れない）の id の全部（entriesNotInBooks の順。h.mu を持って呼ぶ）
func (h *Hub) pagesNotInBooks() []string {
	out := []string{}
	for _, id := range h.entriesNotInBooks() {
		if h.entryNotInBook(id) == id {
			out = append(out, id)
		}
	}
	return out
}

// PagesNotInBooks は、ブックの外のページの id の全部（pagesNotInBooks）
func (h *Hub) PagesNotInBooks() []string {
	h.mu.Lock()
	defer h.mu.Unlock()
	return h.pagesNotInBooks()
}

// PageNotInBook は、ブックの外のページ id の本文（ブックの外のページでなければ nil。pagesNotInBooks と同じ決まり）
func (h *Hub) PageNotInBook(id string) json.RawMessage {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.entryNotInBook(id) != id {
		return nil
	}
	return h.pages[id].body
}

// annotated は、ステージエントリ（ids。ブックか、ブックの外のページの id。nil なら全部: ブックの並び、続けてブックの外のページ）のうち、
// アノテーションの有る物（ゴミ箱の中・読めない物は入れない）の、エンジンに渡す組と、その id
func (h *Hub) annotated(ids []string) ([]engine.Annotated, []string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	var pairs []engine.Annotated
	var kept []string
	if ids == nil {
		ids = slices.Concat(h.order, h.pagesNotInBooks())
	}
	for _, id := range ids {
		if e, ok := h.books[id]; ok {
			if lists := h.annotationsIn(id); !h.outOfSight(id) && len(lists) > 0 {
				pairs = append(pairs, engine.AnnotatedBook(e.body, lists))
				kept = append(kept, id)
			}
			continue
		}
		if list, ok := h.annotations[id]; ok && h.entryNotInBook(id) == id {
			pairs = append(pairs, engine.AnnotatedPage(h.pages[id].body, map[string]json.RawMessage{id: list}))
			kept = append(kept, id)
		}
	}
	return pairs, kept
}

// AIAnnotations は、ステージエントリ（ids。nil なら全部）ごとに、AI に見せるアノテーションの並び（engine.AIAnnotations）を返す。
// ゴミ箱の中の物と、アノテーションの無い物は入れない
func (h *Hub) AIAnnotations(ids []string) (map[string][]json.RawMessage, error) {
	pairs, kept := h.annotated(ids)
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
		out[kept[i]] = list
	}
	return out, nil
}

// AIBriefs は、ステージエントリごとに、待っている物を AI に知らせる 1 行（ページの id → アノテーションの id → 1 行。engine.AIBriefs）を返す。AIAnnotations と同じ物だけ
func (h *Hub) AIBriefs() (map[string]map[string]map[string]string, error) {
	pairs, kept := h.annotated(nil)
	out := map[string]map[string]map[string]string{}
	if len(pairs) == 0 {
		return out, nil
	}
	lists, err := h.engine.AIBriefs(pairs)
	if err != nil {
		return nil, err
	}
	for i, briefs := range lists {
		out[kept[i]] = briefs
	}
	return out, nil
}

// AIPage は、AI に見せるページ（engine.AIPage。背景の図形の情報は見せない）
func (h *Hub) AIPage(page json.RawMessage) (json.RawMessage, error) {
	return h.engine.AIPage(page)
}

// AIBook は、AI に見せるブック（本文）: 並びの全部のページ（バインダの中も）を AIPage に通す（読めない形のブックは、渡したまま返す）
func (h *Hub) AIBook(book json.RawMessage) (json.RawMessage, error) {
	lineup := lineupOf(book)
	if lineup == nil {
		return book, nil
	}
	shown, err := mapLineup(lineup, h.AIPage, nil)
	if err != nil {
		return nil, err
	}
	return withLineup(book, shown)
}

// AIPlaced は、ブック（本文）のページの id ごとの、形の描いた位置と大きさ（engine.AIPlaced。プレゼンテーションが答えなければ null）
func (h *Hub) AIPlaced(book json.RawMessage) (json.RawMessage, error) {
	return h.engine.AIPlaced(book)
}

// AIPagePlaced は、ページ 1 枚の、形の描いた位置と大きさ（engine.AIPagePlaced。プレゼンテーションが答えなければ null）
func (h *Hub) AIPagePlaced(page json.RawMessage) (json.RawMessage, error) {
	return h.engine.AIPagePlaced(page)
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

// annotationsOf は、ステージエントリ 1 つ（ブックか、ブックの外のページ）の AI に見せるアノテーション（無ければ空の並び）
func (o Options) annotationsOf(entry string) ([]json.RawMessage, error) {
	all, err := o.Hub.AIAnnotations([]string{entry})
	if err != nil {
		return nil, err
	}
	if list := all[entry]; list != nil {
		return list, nil
	}
	return []json.RawMessage{}, nil
}

// aiPage は、1 ページ（{"entry", "folder", "page", "version", "annotations", "placed"}。entry はそのページのステージエントリ（そのページを持っているブックか、ブックの外のページならそのページ）、
// folder はそのページが入っているフォルダ（ブックの直下ならブック、バインダの中ならバインダ、ブックの外のページなら書庫のフォルダ）の id、version はそのページの版、annotations はそのページの物に立つもの、
// placed はそのページの形の描いた位置と大きさ。プレゼンテーションが答えなければ null）
func (o Options) aiPage(w http.ResponseWriter, r *http.Request) {
	want := r.PathValue("page")
	entry := stageEntry{Kind: "page", ID: want}
	page := o.Hub.PageNotInBook(want)
	if b := o.Hub.Book(o.Hub.BookOn(&engine.On{Page: want})); b != nil {
		entry = stageEntry{Kind: "book", ID: b.ID}
		for _, p := range pagesOfBook(b.Body) {
			var head struct {
				ID string `json:"id"`
			}
			if json.Unmarshal(p, &head) == nil && head.ID == want {
				page = p
			}
		}
	}
	if page == nil {
		http.Error(w, "no such page", http.StatusNotFound)
		return
	}
	folder := o.Hub.FolderOfPage(want)
	list, err := o.annotationsOf(entry.ID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	onPage := pick(list, func(a aiAnnotation) bool { return a.Page != nil && *a.Page == want })
	if r.URL.Query().Get("outline") != "" {
		writeJSON(w, map[string]any{"entry": entry, "folder": folder, "page": outlinePage(page), "version": o.Hub.PageVersion(want), "annotations": onPage, "placed": nil})
		return
	}
	placed, err := o.Hub.AIPagePlaced(page)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
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
		writeJSON(w, map[string]any{"entry": entry, "folder": folder, "page": want, "item": found, "version": o.Hub.PageVersion(want), "annotations": onItem, "placed": inside})
		return
	}
	shown, err := o.Hub.AIPage(page)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, map[string]any{"entry": entry, "folder": folder, "page": shown, "version": o.Hub.PageVersion(want), "annotations": onPage, "placed": placed})
}

// aiAwaiting は、AI の応えを待っているアノテーションの全部（{"awaiting": [{"entry", "title", "annotation", "brief"}]}。entry はステージエントリ（ブックか、ブックの外のページ）、title はその名前。ブックを置いた順、続けてブックの外のページ。
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
		Entry      stageEntry      `json:"entry"`
		Title      string          `json:"title"`
		Annotation json.RawMessage `json:"annotation"`
		Brief      string          `json:"brief,omitempty"`
	}
	out := []item{}
	add := func(entry stageEntry, body json.RawMessage) {
		var head struct {
			Title string `json:"title"`
		}
		_ = json.Unmarshal(body, &head)
		for _, a := range pick(all[entry.ID], awaiting) {
			var id struct {
				ID   string `json:"id"`
				Page string `json:"page"`
			}
			_ = json.Unmarshal(a, &id)
			out = append(out, item{Entry: entry, Title: head.Title, Annotation: a, Brief: briefs[entry.ID][id.Page][id.ID]})
		}
	}
	for _, b := range o.Hub.AIBooks() {
		add(stageEntry{Kind: "book", ID: b.ID}, b.Body)
	}
	for _, id := range o.Hub.PagesNotInBooks() {
		add(stageEntry{Kind: "page", ID: id}, o.Hub.PageNotInBook(id))
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
