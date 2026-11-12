package storage

import (
	"encoding/json"
	"errors"
	"path/filepath"
	"testing"
)

const memo = "@ex/memo:memo"

var memoKeys = []KeySpec{{"board", "text"}, {"order", "number"}, {"doneAt", "text"}}

func put(t *testing.T, s Storage, subject, id string, base int64, keys map[string]any) {
	t.Helper()
	body := json.RawMessage(`{"id":"` + id + `"}`)
	if _, err := s.Apply(Batch{Records: []RecordWrite{{Subject: subject, ID: id, Body: body, Base: base, Keys: keys}}}); err != nil {
		t.Fatal(err)
	}
}

func ids(found []Found) []string {
	out := []string{}
	for _, f := range found {
		out = append(out, f.ID)
	}
	return out
}

func same(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

func TestKindTablesFindByKeys(t *testing.T) {
	path := filepath.Join(t.TempDir(), "m.db")
	s, err := OpenSQLite(path)
	if err != nil {
		t.Fatal(err)
	}
	// 種類を伝える前に書いたレコードは、伝えたときに種類の表へ移る
	put(t, s, memo, "m0", 0, nil)
	if err := s.SetKinds([]KindSpec{{memo, memoKeys}}); err != nil {
		t.Fatal(err)
	}
	put(t, s, memo, "m1", 0, map[string]any{"board": "a", "order": 1.0})
	put(t, s, memo, "m2", 0, map[string]any{"board": "a", "order": 2.0, "doneAt": "t"})
	put(t, s, memo, "m3", 0, map[string]any{"board": "b", "order": 3.0})
	put(t, s, "@ex/other:x", "x1", 0, nil)

	find := func(q Query) []Found {
		t.Helper()
		found, err := s.Find(memo, q)
		if err != nil {
			t.Fatal(err)
		}
		return found
	}
	if got := ids(find(Query{})); !same(got, []string{"m0", "m1", "m2", "m3"}) {
		t.Fatalf("all: %v", got)
	}
	if got := ids(find(Query{Where: []Cond{{"board", "eq", "a"}, {"doneAt", "absent", nil}}})); !same(got, []string{"m1"}) {
		t.Fatalf("board a and not done: %v", got)
	}
	if got := ids(find(Query{Where: []Cond{{"order", "gt", 1.0}}, Order: &Order{"order", true}, Limit: 1})); !same(got, []string{"m3"}) {
		t.Fatalf("newest: %v", got)
	}
	// 値の無いレコードは、どちらの向きでも後ろ
	if got := ids(find(Query{Order: &Order{"order", false}})); !same(got, []string{"m1", "m2", "m3", "m0"}) {
		t.Fatalf("asc: %v", got)
	}
	keysOnly := find(Query{Where: []Cond{{"board", "eq", "a"}}, KeysOnly: true})
	if len(keysOnly) != 2 || keysOnly[0].Body != nil || keysOnly[1].Keys["doneAt"] != "t" || keysOnly[0].Keys["order"] != 1.0 {
		t.Fatalf("keys only: %+v", keysOnly)
	}
	if _, err := s.Find(memo, Query{Where: []Cond{{"nope", "eq", "a"}}}); !errors.Is(err, ErrUnknownKey) {
		t.Fatalf("unknown key: %v", err)
	}
	if _, err := s.Find(memo, Query{Where: []Cond{{"order", "eq", "1"}}}); !errors.Is(err, ErrUnknownKey) {
		t.Fatalf("wrong type: %v", err)
	}
	// 伝えられたことの無い種類は、中を解釈しない表から全部を返し、索引キーは使えない
	if other, err := s.Find("@ex/other:x", Query{}); err != nil || !same(ids(other), []string{"x1"}) {
		t.Fatalf("other: %v %v", other, err)
	}
	if r, err := s.Record(memo, "m2"); err != nil || r == nil || r.Version != 1 {
		t.Fatalf("record: %+v %v", r, err)
	}
	if r, err := s.Record(memo, "none"); err != nil || r != nil {
		t.Fatalf("no record: %+v %v", r, err)
	}
	// 直すと版が進み、索引キーも入れ替わる。版が違えば書かない
	put(t, s, memo, "m1", 1, map[string]any{"board": "b", "order": 1.0})
	if got := ids(find(Query{Where: []Cond{{"board", "eq", "b"}}})); !same(got, []string{"m1", "m3"}) {
		t.Fatalf("after update: %v", got)
	}
	if _, err := s.Apply(Batch{Records: []RecordWrite{{Subject: memo, ID: "m1", Body: json.RawMessage(`{}`), Base: 1}}}); !errors.Is(err, ErrConflict) {
		t.Fatalf("conflict: %v", err)
	}
	all, err := s.Records()
	if err != nil || len(all) != 5 || all[0].Subject != memo || all[4].Subject != "@ex/other:x" {
		t.Fatalf("records: %+v %v", all, err)
	}

	// 宣言が変わると列を作り直し、値は入れ直すまで無い。入れ直すと探せる。開き直しても残る
	if err := s.SetKinds([]KindSpec{{memo, []KeySpec{{"board", "text"}}}}); err != nil {
		t.Fatal(err)
	}
	if got := ids(find(Query{Where: []Cond{{"board", "present", nil}}})); len(got) != 0 {
		t.Fatalf("before fill: %v", got)
	}
	if err := s.FillKeys(memo, map[string]map[string]any{"m1": {"board": "z"}, "m3": {"board": "z"}}); err != nil {
		t.Fatal(err)
	}
	s.Close()
	s, err = OpenSQLite(path)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	if found, err := s.Find(memo, Query{Where: []Cond{{"board", "eq", "z"}}}); err != nil || !same(ids(found), []string{"m1", "m3"}) {
		t.Fatalf("after reopen: %v %v", found, err)
	}
	// 消す
	if _, err := s.Apply(Batch{Records: []RecordWrite{{Subject: memo, ID: "m3", Base: 1, Removed: true}}}); err != nil {
		t.Fatal(err)
	}
	if r, _ := s.Record(memo, "m3"); r != nil {
		t.Fatal("m3 is still there")
	}
}
