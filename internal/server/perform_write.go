package server

// 1 回の Perform が変えた物の書き込み: 組み立て（planWrites。何も変えない）→ 置き場所に 1 つのまとまりで書く（store.Apply）→ メモリと窓に当てる（applyWrites。失敗しない）。
// 書けなければ、置き場所もメモリも窓も何も変わらず、行い直せる

import (
	"encoding/json"
	"fmt"
	"slices"

	"github.com/umaxyon/matomezu/internal/engine"
	"github.com/umaxyon/matomezu/internal/storage"
)

// bookPut は、書くブック 1 冊（version は書いた後の版）と、今のプラグインで確かめた warning
type bookPut struct {
	id       string
	body     json.RawMessage
	version  int64
	warnings []engine.BookWarning
}

// writePlan は、書く物の全部と、当てるときに要る物
type writePlan struct {
	batch   storage.Batch
	puts    []bookPut
	removed []string                  // 置いてあって消すブック
	tickets map[string][]AIEditTicket // 書き換えた AI 編集チケットの並び（ブックごと）
	records []recordPut               // 変えたレコードの全部
}

// planWrites は out の変えた物を、置き場所に書く形（batch）と、当てる物にする。subject はアクションの対象の種類（ブックが対象なら空）。何も変えない（h.mu を持って呼ぶ）
func (h *Hub) planWrites(out engine.Output, subject, by, act, at string) (*writePlan, error) {
	plan := &writePlan{tickets: map[string][]AIEditTicket{}}
	versions := map[string]int64{} // この Perform で書くブックの、書いた後の版
	versionOf := func(id string) int64 {
		if v, ok := versions[id]; ok {
			return v
		}
		return h.books[id].version
	}
	has := map[string]bool{} // 書いたか、置いてあるブック（消したら外す）
	for id := range h.books {
		has[id] = true
	}
	ticketsOf := func(id string) []AIEditTicket {
		if l, ok := plan.tickets[id]; ok {
			return l
		}
		return h.aiEditTickets[id]
	}
	for _, body := range out.Books {
		var head struct {
			ID string `json:"id"`
		}
		if err := json.Unmarshal(body, &head); err != nil || head.ID == "" {
			return nil, fmt.Errorf("the engine gave a book without an id: %s", body)
		}
		id := head.ID
		base := versionOf(id)
		versions[id] = base + 1
		found, err := h.engine.CheckBooks([]json.RawMessage{body})
		if err != nil {
			return nil, err
		}
		has[id] = true
		plan.batch.Books = append(plan.batch.Books, storage.BookWrite{ID: id, Body: body, Base: base})
		plan.puts = append(plan.puts, bookPut{id: id, body: body, version: base + 1, warnings: found})
		if by == "ai" {
			plan.tickets[id] = recordedTickets(ticketsOf(id), act, base+1, at)
		}
	}
	for _, id := range out.Removed {
		if !has[id] {
			continue
		}
		delete(has, id)
		delete(versions, id)
		delete(plan.tickets, id)
		plan.removed = append(plan.removed, id)
		plan.batch.Removed = append(plan.batch.Removed, id)
	}
	if len(out.Settings) > 0 {
		plan.batch.Settings = &storage.UserBody{User: user, Body: out.Settings}
	}
	h.planRecords(plan, out)
	for book, body := range out.Annotations {
		plan.batch.Annotations = append(plan.batch.Annotations, storage.BookBody{Book: book, Body: body})
	}
	// AI 編集チケットの変え方は順に当てる（同じブックの物は前の結果に重ねる）。消えたブックを指す物は飛ばす
	for _, c := range out.AIEditTickets {
		if !has[c.Book] {
			continue
		}
		if list, changed := changedTickets(ticketsOf(c.Book), subject, c, versionOf(c.Book), at); changed {
			plan.tickets[c.Book] = list
		}
	}
	for book, list := range plan.tickets {
		body, err := json.Marshal(list)
		if err != nil {
			return nil, err
		}
		plan.batch.AIEditTickets = append(plan.batch.AIEditTickets, storage.BookBody{Book: book, Body: body})
	}
	slices.SortFunc(plan.batch.AIEditTickets, func(a, b storage.BookBody) int { return compareStrings(a.Book, b.Book) })
	return plan, nil
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

// applyWrites は、書き終えた物をメモリに当て、窓に知らせる。失敗しない（h.mu を持って呼ぶ）
func (h *Hub) applyWrites(plan *writePlan, out engine.Output, p Perform, by, act string) {
	for _, put := range plan.puts {
		if _, ok := h.books[put.id]; !ok {
			h.order = append(h.order, put.id)
		}
		h.books[put.id] = entry{put.body, put.version, trashed(put.body)}
		h.broadcast("book", map[string]any{"book": put.body, "version": put.version, "client": p.Client, "seq": p.Seq, "by": by, "act": act, "action": p.Action})
		h.touch(put.id, stamp())
		h.recordWarnings([]string{put.id}, put.warnings)
	}
	for book, list := range plan.tickets {
		if len(list) == 0 {
			delete(h.aiEditTickets, book)
		} else {
			h.aiEditTickets[book] = list
		}
	}
	for _, id := range plan.removed {
		h.dropBook(id, p.Client, p.Seq)
	}
	if len(out.Settings) > 0 {
		h.settings = out.Settings
		h.broadcast("settings", map[string]any{"settings": out.Settings, "client": p.Client, "seq": p.Seq})
	}
	h.applyRecords(plan, out, p)
	for book, body := range out.Annotations {
		h.applyAnnotations(book, body, p.Client, p.Seq)
	}
}
