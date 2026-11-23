package server

import (
	"encoding/json"
	"net/http"
	"slices"
	"time"

	"github.com/umaxyon/matomezu/internal/engine"
	"github.com/umaxyon/matomezu/internal/storage"
)

// aiAnnotation は AI に見せるアノテーションのうち、常駐が読み分けに使うフィールド（ほかは engine が返したまま渡す）
type aiAnnotation struct {
	Page    *string  `json:"page"`
	Awaits  bool     `json:"awaits"`
	Anchors []string `json:"anchors"`
}

// stageEntry は、ステージエントリ（ブックか、ブックの外のページ・バインダ）を AI に指し示す形（{"kind", "id"}。kind は book・page・binder）
type stageEntry struct {
	Kind string `json:"kind"`
	ID   string `json:"id"`
}

// stageEntriesNotInBooks は、ブックの外のステージエントリ（書庫ホームかフォルダの直下に在るページとバインダ。ゴミ箱の中・読めない物は入れない）の全部
// （entriesNotInBooks の順。entriesNotInBooks はエンジンに渡す行のための並びで、ゴミ箱の直下の物も持つ。h.mu を持って呼ぶ）
func (h *Hub) stageEntriesNotInBooks() []stageEntry {
	out := []stageEntry{}
	for _, id := range h.entriesNotInBooks() {
		switch {
		case h.entryNotInBook(id) == id:
			out = append(out, stageEntry{Kind: storage.KindPage, ID: id})
		case h.binderNotInBook(id):
			out = append(out, stageEntry{Kind: storage.KindBinder, ID: id})
		}
	}
	return out
}

// binderNotInBook は、id がブックの外のバインダ（書庫ホームかフォルダの直下に在るバインダ。ゴミ箱の中・読めない物は当たらない）か（h.mu を持って呼ぶ）
func (h *Hub) binderNotInBook(id string) bool {
	binder, ok := h.folders[id]
	return ok && binder.role == storage.RoleBinder && h.folders[h.places[id]].isOpen() && !h.outOfSight(id)
}

// pagesNotInBooks は、ブックの外のページ（書庫ホームかフォルダの直下に在るページと、その直下のバインダの中のページ。ゴミ箱の中・読めない物は入れない）の id の全部
// （stageEntriesNotInBooks の順、バインダの中は並びの順。h.mu を持って呼ぶ）
func (h *Hub) pagesNotInBooks() []string {
	out := []string{}
	for _, e := range h.stageEntriesNotInBooks() {
		if e.Kind == storage.KindPage {
			out = append(out, e.ID)
			continue
		}
		for _, page := range h.folders[e.ID].entries {
			if _, ok := h.pages[page]; ok {
				out = append(out, page)
			}
		}
	}
	return out
}

// StageEntriesNotInBooks は、ブックの外のステージエントリの全部（stageEntriesNotInBooks）と、その名前（同じ順）
func (h *Hub) StageEntriesNotInBooks() (entries []stageEntry, titles []string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	entries = h.stageEntriesNotInBooks()
	for _, e := range entries {
		title, _ := h.titleOfStageEntry(e.ID)
		titles = append(titles, title)
	}
	return entries, titles
}

// PageNotInBook は、ブックの外のページ id（pagesNotInBooks と同じ決まり）のステージエントリ（そのページか、それを持つバインダ）と本文（ブックの外のページでなければ本文は nil）
func (h *Hub) PageNotInBook(id string) (stageEntry, json.RawMessage) {
	h.mu.Lock()
	defer h.mu.Unlock()
	switch e := h.entryNotInBook(id); e {
	case "":
		return stageEntry{}, nil
	case id:
		return stageEntry{Kind: storage.KindPage, ID: id}, h.pages[id].body
	default:
		return stageEntry{Kind: storage.KindBinder, ID: e}, h.pages[id].body
	}
}

// annotated は、ステージエントリ（ids。ブックか、ブックの外のページ・バインダの id。ページとフォルダの id は世界の中で重ならないので、1 つの並びで受ける。nil なら全部: ブックの並び、続けてブックの外のステージエントリ）のうち、
// アノテーションの有る物（ゴミ箱の中・読めない物は入れない）の、エンジンに渡す組と、その id
func (h *Hub) annotated(ids []string) ([]engine.Annotated, []string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	return h.annotatedIn(ids)
}

// annotatedIn は annotated の中身（h.mu を持って呼ぶ）
func (h *Hub) annotatedIn(ids []string) ([]engine.Annotated, []string) {
	var pairs []engine.Annotated
	var kept []string
	if ids == nil {
		ids = slices.Clone(h.order)
		for _, e := range h.stageEntriesNotInBooks() {
			ids = append(ids, e.ID)
		}
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
			continue
		}
		if !h.binderNotInBook(id) {
			continue
		}
		bodies, lists := []json.RawMessage{}, map[string]json.RawMessage{}
		for _, page := range h.folders[id].entries {
			bodies = append(bodies, h.pages[page].body)
			if list, ok := h.annotations[page]; ok {
				lists[page] = list
			}
		}
		if len(lists) > 0 {
			pairs = append(pairs, engine.AnnotatedBinder(bodies, lists))
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

// annotationsOf は、ステージエントリ 1 つ（ブックか、ブックの外のページ・バインダ）の AI に見せるアノテーション（無ければ空の並び）
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

// aiPage は、1 ページ（{"entry", "folder", "page", "version", "annotations", "placed"}。entry はそのページのステージエントリ（そのページを持っているブックか、ブックの外のページならそのページ、ブックの外のバインダの中ならそのバインダ）、
// folder はそのページが入っているフォルダ（ブックの直下ならブック、バインダの中ならバインダ、ブックの外のページなら書庫のフォルダ）の id、version はそのページの版、annotations はそのページの物に立つもの、
// placed はそのページの形の描いた位置と大きさ。プレゼンテーションが答えなければ null）
func (o Options) aiPage(w http.ResponseWriter, r *http.Request) {
	want := r.PathValue("page")
	entry, page := o.Hub.PageNotInBook(want)
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

// aiAwaiting は、AI の応えを待っているアノテーションの全部（{"awaiting": [{"entry", "title", "annotation", "brief"}]}。entry はステージエントリ（ブックか、ブックの外のページ・バインダ）、title はその名前。ブックを置いた順、続けてブックの外のステージエントリ、
// 続けて、?session= の会話のセッションに結んだ参加者のワーカーブック（フックが聞く。参加者が呼んだことにはしない）。
// brief は種類の aiBrief が答える、見分けに要る 1 行で、種類が答えなければ無い。UserPromptSubmit のフックはこれを短い行にして貼る）と、
// 見られる前に利用者が戻した AI の変更の全部（"undone"。ai_edit_tickets.go の TellUndone）と、失敗にした AI 編集チケットの全部（"failed"。TellFailed）と、
// 郵便が消えたと記した AI 編集チケットの全部（"removed"。TellRemoved）
func (o Options) aiAwaiting(w http.ResponseWriter, r *http.Request) {
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
	add := func(entry stageEntry, title string) {
		for _, a := range pick(all[entry.ID], awaiting) {
			var id struct {
				ID   string `json:"id"`
				Page string `json:"page"`
			}
			_ = json.Unmarshal(a, &id)
			out = append(out, item{Entry: entry, Title: title, Annotation: a, Brief: briefs[entry.ID][id.Page][id.ID]})
		}
	}
	for _, b := range o.Hub.AIBooks() {
		title, _, _ := rowHead(b.Body)
		add(stageEntry{Kind: storage.KindBook, ID: b.ID}, title)
	}
	// 聞いた会話のセッション（session。フックが渡す）の AI のワーカーブック（バックヤードの中なので AIBooks に無い）も
	if id, title := o.Hub.MyWorkerBook(o.Hub.joinedOfSession(r.URL.Query().Get("session"))); id != "" {
		add(stageEntry{Kind: storage.KindBook, ID: id}, title)
	}
	entries, titles := o.Hub.StageEntriesNotInBooks()
	for i, e := range entries {
		add(e, titles[i])
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

// joinedOfSession は、会話のセッション session に結んだ、参加が確定した参加者の id（無いか、2 人以上なら空）。呼んだことにはしない（SessionParticipant と違い、起こす宛て先も残さない）
func (h *Hub) joinedOfSession(session string) string {
	if session == "" {
		return ""
	}
	records, err := h.records()
	if err != nil {
		return ""
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	return h.sessionParticipantHeld(records, session)
}
