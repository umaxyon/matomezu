package server

import (
	"encoding/json"
	"path/filepath"
	"testing"

	"github.com/umaxyon/matomezu/internal/engine"
	"github.com/umaxyon/matomezu/internal/storage"
)

// /api/data は、行と一緒に、読めないブックの warning を文に埋める値ごと返す（ゴミ箱の中も入り、読めるブックの W007 と読めない物のフォルダの中は入らない）
func TestDataTellsTheUnreadableBooks(t *testing.T) {
	t.Parallel()
	s, h := serveStore(t, filepath.Join(t.TempDir(), "data.db"))
	h.mu.Lock()
	h.bookWarnings = map[string]engine.BookWarning{
		"b1": {Book: "b1", Code: "W027", Unreadable: true, Params: map[string]string{"book": "b1", "title": "B", "pages": "1", "type": "@foo/stamps:board"}},
		"b2": {Book: "b2", Code: "W007", Params: map[string]string{"book": "b2"}},
		"b3": {Book: "b3", Code: "W005", Unreadable: true},
		"b4": {Book: "b4", Code: "W005", Unreadable: true, Params: map[string]string{"book": "b4"}},
	}
	h.places["b3"] = storage.TrashID
	h.places["b4"] = storage.UnreadableID
	h.mu.Unlock()
	_, body := send(t, "GET", s.URL+"/api/data", "", nil)
	var got struct {
		UnreadableBooks []struct {
			Code   string            `json:"code"`
			Plugin *string           `json:"plugin"`
			Params map[string]string `json:"params"`
		} `json:"unreadableBooks"`
	}
	if err := json.Unmarshal([]byte(body), &got); err != nil {
		t.Fatal(err)
	}
	if len(got.UnreadableBooks) != 2 {
		t.Fatalf("unreadableBooks = %+v", got.UnreadableBooks)
	}
	first, trash := got.UnreadableBooks[0], got.UnreadableBooks[1]
	if first.Code != "W027" || first.Plugin == nil || *first.Plugin != "" || first.Params["title"] != "B" || first.Params["type"] != "@foo/stamps:board" {
		t.Fatalf("b1 = %+v", first)
	}
	if trash.Code != "W005" || trash.Params == nil || len(trash.Params) != 0 {
		t.Fatalf("b3 = %+v", trash)
	}
}

// 書き込みの changed には、毎回、そのときの読めないブックの全部が載る（書いたブックと関わらない読めないブックも。窓は届いたら入れ替える）
func TestChangedTellsAllTheUnreadableBooks(t *testing.T) {
	t.Parallel()
	hub, _, c := bulkHub(t)
	hub.mu.Lock()
	hub.bookWarnings["b9"] = engine.BookWarning{Book: "b9", Code: "W005", Unreadable: true, Params: map[string]string{"book": "b9"}}
	hub.mu.Unlock()
	done, err := hub.Perform(Perform{Actions: []engine.BulkAction{
		step("@matomezu/paper:item-place", `{"item":"@matomezu/box:shape-nest-box","at":{"x":1,"y":2}}`, &engine.On{Page: "p1"}, "k1"),
	}, Client: c.id, Seq: 1})
	if err != nil || !done.OK {
		t.Fatalf("perform = %+v, %v", done, err)
	}
	got := drained(c)
	if len(got) == 0 || got[0].name != "changed" {
		t.Fatalf("events = %v", got)
	}
	var changed struct {
		UnreadableBooks []struct {
			Code   string            `json:"code"`
			Params map[string]string `json:"params"`
		} `json:"unreadableBooks"`
	}
	if err := json.Unmarshal(got[0].data, &changed); err != nil || len(changed.UnreadableBooks) != 1 || changed.UnreadableBooks[0].Params["book"] != "b9" {
		t.Fatalf("changed = %s", got[0].data)
	}
}
