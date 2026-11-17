package server

// 1 回の Perform が変えた物の書き込み: 組み立て（planWrites。何も変えない）→ 置き場所に 1 つのまとまりで書く（store.Apply）→ メモリと窓に当てる（applyWrites。失敗しない）。
// 書けなければ、置き場所もメモリも窓も何も変わらず、行い直せる。
// Perform は 1 つずつ行う（h.mu）ので、置いてある版と違う書き込みは起きない。版の確かめ（Base）は、置き場所と食い違ったときの守り

import (
	"encoding/json"
	"fmt"
	"os"
	"slices"

	"github.com/umaxyon/matomezu/internal/engine"
	"github.com/umaxyon/matomezu/internal/storage"
)

// rowPut は、書くページ・フォルダ 1 つ（version は書いた後の版。removed なら消す）
type rowPut struct {
	id      string
	body    json.RawMessage
	version int64
	removed bool
}

// writePlan は、書く物の全部と、当てるときに要る物
type writePlan struct {
	batch   storage.Batch
	pages   []rowPut
	folders []rowPut
	removed []string        // 置いてあって消すブック
	tickets *[]AIEditTicket // 書き換えた AI 編集チケットの並びの全部（変えなければ nil）
	records []recordPut     // 変えたレコードの全部
	quiet   bool            // 窓に知らせず、触れた時刻も残さない（テストの用意で世界を置き直すとき）
}

// planWrites は out の変えた物を、置き場所に書く形（batch）と、当てる物にする。subject はアクションの対象の種類（ブックが対象なら空）。何も変えない（h.mu を持って呼ぶ）。
// 新しく足すページ・フォルダの id が、世界にもう在れば nil を返す（エンジンが受けたのは要るブックだけなので、ほかのブックと重なっていないかは、ここで確かめる。
// ページもフォルダも id は世界の中で重ならず、エントリはちょうど 1 つのフォルダに入る）
func (h *Hub) planWrites(out engine.Output, subject, by, act, at string) (*writePlan, error) {
	for _, id := range out.Created {
		_, page := h.pages[id]
		_, folder := h.folders[id]
		if page || folder {
			return nil, nil
		}
	}
	plan := &writePlan{}
	gone := []string{}
	for _, c := range out.Pages {
		base := h.pages[c.ID].version
		plan.batch.Pages = append(plan.batch.Pages, storage.RowWrite{ID: c.ID, Body: c.Row, Base: base, Removed: c.Removed})
		plan.pages = append(plan.pages, rowPut{c.ID, c.Row, base + 1, c.Removed})
		if c.Removed {
			gone = append(gone, c.ID)
		}
	}
	changed := map[string]json.RawMessage{} // 変わったフォルダの id → 新しい本文（無くなったなら nil）
	for _, c := range out.Folders {
		base := h.folders[c.ID].version
		plan.batch.Folders = append(plan.batch.Folders, storage.RowWrite{ID: c.ID, Body: c.Row, Base: base, Removed: c.Removed})
		plan.folders = append(plan.folders, rowPut{c.ID, c.Row, base + 1, c.Removed})
		if c.Removed {
			changed[c.ID] = nil
		} else {
			changed[c.ID] = c.Row
		}
	}
	plan.batch.Entries = h.entryPuts(changed, gone)
	has := map[string]bool{} // 書いたか、置いてあるブック（消したら外す）
	for id := range h.books {
		has[id] = true
	}
	for _, id := range out.Books {
		if body, folder := changed[id]; folder && body == nil {
			if has[id] {
				plan.removed = append(plan.removed, id)
			}
			delete(has, id)
			continue
		}
		has[id] = true
	}
	plan.batch.RemovedBooks = plan.removed
	// AI 編集チケット: 消すブックの分を外し、AI のアクションなら 1 つ開く（変えたページとフォルダ。消すブックの物は入れない）
	tickets, ticketsChanged := h.aiEditTickets, false
	removedBooks, goneRows := map[string]bool{}, map[string]bool{}
	for _, id := range plan.removed {
		removedBooks[id] = true
		for _, row := range h.rowsUnder(id) {
			goneRows[row] = true
		}
	}
	if len(plan.removed) > 0 {
		tickets, ticketsChanged = prunedTickets(tickets, removedBooks, goneRows)
	}
	if by == "ai" {
		unseen := []string{}
		for _, c := range slices.Concat(out.Pages, out.Folders) {
			if !goneRows[c.ID] {
				unseen = append(unseen, c.ID)
			}
		}
		if len(unseen) > 0 {
			tickets, ticketsChanged = recordedTickets(tickets, act, at, unseen), true
		}
	}
	if len(out.Settings) > 0 {
		plan.batch.Settings = &storage.UserBody{User: user, Body: out.Settings}
	}
	h.planRecords(plan, out)
	for page, body := range out.Annotations {
		plan.batch.Annotations = append(plan.batch.Annotations, storage.PageBody{Page: page, Body: body})
	}
	// AI 編集チケットの変え方は順に当てる（同じブックの物は前の結果に重ねる）。消えたブックを指す物は飛ばす
	for _, c := range out.AIEditTickets {
		if !has[c.Book] {
			continue
		}
		if list, changed := changedTickets(tickets, subject, c, at); changed {
			tickets, ticketsChanged = list, true
		}
	}
	if ticketsChanged {
		body, err := ticketsBody(tickets)
		if err != nil {
			return nil, err
		}
		plan.tickets, plan.batch.AIEditTickets = &tickets, body
	}
	return plan, nil
}

// unreadableWrite は、out が読めないページの行に触れるか: 読めないページの行を変える（消すのはよい）、kind が unreadable のページの行を書く、
// 並びに kind が unreadable の要素を持つフォルダの行を書く。読めないページの行はそのまま残す決まりの、エンジンの後ろの守り（Perform が断る。h.mu を持って呼ぶ）
func (h *Hub) unreadableWrite(out engine.Output) bool {
	for _, c := range out.Pages {
		if c.Removed {
			continue
		}
		if _, unreadable := h.pageWarnings[c.ID]; unreadable || kindOf(c.Row) == "unreadable" {
			return true
		}
	}
	for _, c := range out.Folders {
		if !c.Removed && slices.ContainsFunc(lineupOf(c.Row), func(e json.RawMessage) bool { return kindOf(e) == "unreadable" }) {
			return true
		}
	}
	return false
}

// rowNotice は、窓に知らせるページ・フォルダ 1 つ（field は "page" か "folder"）
func rowNotice(field string, put rowPut) map[string]any {
	if put.removed {
		return map[string]any{"id": put.id, "removed": true}
	}
	return map[string]any{"id": put.id, field: put.body, "version": put.version}
}

// applyWrites は、書き終えた物をメモリに当て、窓に知らせる。失敗しない（h.mu を持って呼ぶ）
func (h *Hub) applyWrites(plan *writePlan, out engine.Output, p Perform, by, act string) {
	pages := make([]map[string]any, 0, len(plan.pages))
	for _, put := range plan.pages {
		if put.removed {
			delete(h.pages, put.id)
		} else {
			h.pages[put.id] = row{put.body, put.version}
		}
		pages = append(pages, rowNotice("page", put))
	}
	folders := make([]map[string]any, 0, len(plan.folders))
	for _, put := range plan.folders {
		if put.removed {
			delete(h.folders, put.id)
		} else {
			h.folders[put.id] = newFolderRow(put.body, put.version)
		}
		folders = append(folders, rowNotice("folder", put))
	}
	for _, e := range plan.batch.Entries {
		if e.Folder == "" {
			delete(h.places, e.ID)
		} else {
			h.places[e.ID] = e.Folder
		}
	}
	for _, id := range out.Books {
		if _, ok := h.folders[id]; ok && !slices.Contains(h.order, id) {
			h.order = append(h.order, id)
		}
	}
	h.rebuild(out.Books...)
	if !plan.quiet && (len(pages) > 0 || len(folders) > 0) {
		h.broadcast("changed", map[string]any{"pages": pages, "folders": folders, "books": out.Books, "client": p.Client, "seq": p.Seq, "by": by, "act": act, "action": p.Action})
	}
	for _, id := range out.Books {
		if e, ok := h.books[id]; ok {
			if !plan.quiet {
				h.touch(id, stamp())
			}
			h.checkBook(id, e.body)
		}
	}
	if plan.tickets != nil {
		h.aiEditTickets = *plan.tickets
	}
	for _, id := range plan.removed {
		h.dropBook(id)
	}
	if len(out.Settings) > 0 {
		h.settings = out.Settings
		h.broadcast("settings", map[string]any{"settings": out.Settings, "client": p.Client, "seq": p.Seq})
		h.reusePluginsForSettings()
	}
	h.applyRecords(plan, out, p)
	for page, body := range out.Annotations {
		h.applyAnnotations(page, body, p.Client, p.Seq)
	}
	// ブックを消したら、そのページのアノテーションの warning も一覧から外す
	if len(plan.removed) > 0 {
		if err := h.checkAnnotations(); err != nil {
			fmt.Fprintln(os.Stderr, "engine: could not check the annotations:", err)
		}
	}
}

// checkBook は、書いたブック id（組んだ本文 body）を今のプラグインで確かめ、warning の一覧を直す（確かめられなければ、ログに書いて一覧はそのまま。h.mu を持って呼ぶ）
func (h *Hub) checkBook(id string, body json.RawMessage) {
	found, err := h.engine.CheckBooks([]json.RawMessage{body})
	if err != nil {
		fmt.Fprintln(os.Stderr, "engine: could not check the book:", err)
		return
	}
	h.recordWarnings([]string{id}, found)
}

func compareStrings(a, b string) int {
	switch {
	case a < b:
		return -1
	case a > b:
		return 1
	}
	return 0
}
