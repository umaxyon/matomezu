package storage

import (
	"encoding/json"
	"errors"
	"path/filepath"
	"slices"
	"strings"
	"testing"
)

func putTexts(t *testing.T, s Storage, texts ...SearchText) {
	t.Helper()
	if _, err := s.Apply(Batch{SearchTexts: texts}); err != nil {
		t.Fatal(err)
	}
}

func refs(r SearchResult) []string {
	out := []string{}
	for _, h := range r.Hits {
		out = append(out, h.Kind+"/"+h.Ref)
	}
	return out
}

func search(t *testing.T, s Storage, terms ...string) SearchResult {
	t.Helper()
	r, err := s.Search(SearchQuery{Terms: terms, Limit: 50})
	if err != nil {
		t.Fatal(err)
	}
	return r
}

// 版の食い違いで断られた書き込みは、同じまとまりの探す文字も書かない
func TestSearchTextsAreNotWrittenWhenTheRecordIsRefused(t *testing.T) {
	s := open(t, filepath.Join(t.TempDir(), "data.db"))
	if _, err := s.Apply(Batch{
		Records:     []RecordWrite{{Subject: "x:card", ID: "c1", Body: json.RawMessage(`{"id":"c1"}`)}},
		SearchTexts: []SearchText{{Kind: "x:card", Ref: "c1", Title: "first", Body: "before"}},
	}); err != nil {
		t.Fatal(err)
	}
	_, err := s.Apply(Batch{
		Records:     []RecordWrite{{Subject: "x:card", ID: "c1", Body: json.RawMessage(`{"id":"c1","a":1}`), Base: 7}},
		SearchTexts: []SearchText{{Kind: "x:card", Ref: "c1", Title: "first", Body: "after"}},
	})
	if !errors.Is(err, ErrConflict) {
		t.Fatalf("a stale write = %v", err)
	}
	if r := search(t, s, "after"); r.Total != 0 {
		t.Fatalf("the refused text was found: %+v", r)
	}
	if r := search(t, s, "before"); r.Total != 1 {
		t.Fatalf("the text before was lost: %+v", r)
	}
}

// 入れ直しは、種類の全部を渡した文字にし、渡さなかった参照先と、台帳から無くなった種類の文字を消す
func TestSyncSearchDropsGoneKindsAndRefs(t *testing.T) {
	s := open(t, filepath.Join(t.TempDir(), "data.db"))
	putTexts(t, s,
		SearchText{Kind: "a", Ref: "1", Body: "alpha text"},
		SearchText{Kind: "a", Ref: "2", Body: "alpha other"},
		SearchText{Kind: "gone", Ref: "1", Body: "alpha gone"},
	)
	if err := s.SyncSearch([]string{"a"}, []SearchText{{Kind: "a", Ref: "1", Body: "alpha changed"}}); err != nil {
		t.Fatal(err)
	}
	if got := refs(search(t, s, "alpha")); !slices.Equal(got, []string{"a/1"}) {
		t.Fatalf("after sync = %v", got)
	}
	if r := search(t, s, "changed"); r.Total != 1 {
		t.Fatalf("the new text = %+v", r)
	}
}

// 1〜2 字の言葉は LIKE で横断検索の当たり、3 字以上と混ぜても 1 回で探せる
func TestShortTermsAreFoundWithLike(t *testing.T) {
	s := open(t, filepath.Join(t.TempDir(), "data.db"))
	putTexts(t, s,
		SearchText{Kind: "a", Ref: "1", Title: "ログイン", Body: "画面"},
		SearchText{Kind: "a", Ref: "2", Title: "12 ticket", Body: ""},
		SearchText{Kind: "a", Ref: "3", Title: "other", Body: "nothing"},
	)
	if got := refs(search(t, s, "画面")); !slices.Equal(got, []string{"a/1"}) {
		t.Fatalf("2 characters = %v", got)
	}
	if got := refs(search(t, s, "12")); !slices.Equal(got, []string{"a/2"}) {
		t.Fatalf("the number = %v", got)
	}
	got := refs(search(t, s, "画面", "ticket"))
	slices.Sort(got)
	if !slices.Equal(got, []string{"a/1", "a/2"}) {
		t.Fatalf("mixed = %v", got)
	}
}

// " % _ \ を含む言葉は、そのままの字として当たる（式の記号にならない）
func TestSpecialCharactersInTermsAreLiteral(t *testing.T) {
	s := open(t, filepath.Join(t.TempDir(), "data.db"))
	putTexts(t, s,
		SearchText{Kind: "a", Ref: "1", Body: `say "hello" now`},
		SearchText{Kind: "a", Ref: "2", Body: "100% done"},
		SearchText{Kind: "a", Ref: "3", Body: "a_b and a-b"},
		SearchText{Kind: "a", Ref: "4", Body: `path\to`},
		SearchText{Kind: "a", Ref: "5", Body: "plain words"},
	)
	cases := map[string]string{`"hello"`: "a/1", "100%": "a/2", "%": "a/2", "a_b": "a/3", "_": "a/3", `h\x`: "", `\`: "a/4", `h" OR "p`: ""}
	for term, want := range cases {
		got := refs(search(t, s, term))
		if (want == "" && len(got) != 0) || (want != "" && !slices.Equal(got, []string{want})) {
			t.Fatalf("term %q found %v; want %q", term, got, want)
		}
	}
}

// 題に当たった物は本文だけに当たった物より上（LIKE で当たった物も）。同じなかでは新しい物が上
func TestTitleMatchesComeBeforeBodyMatches(t *testing.T) {
	s := open(t, filepath.Join(t.TempDir(), "data.db"))
	putTexts(t, s,
		SearchText{Kind: "a", Ref: "body-long", Title: "nothing", Body: "the keyword is here in the body"},
		SearchText{Kind: "a", Ref: "title-long", Title: "keyword", Body: "unrelated"},
		SearchText{Kind: "a", Ref: "body-short", Title: "nothing", Body: "ab in the body"},
		SearchText{Kind: "a", Ref: "title-short", Title: "ab", Body: "unrelated"},
	)
	if got := refs(search(t, s, "keyword")); !slices.Equal(got, []string{"a/title-long", "a/body-long"}) {
		t.Fatalf("keyword = %v", got)
	}
	if got := refs(search(t, s, "ab")); !slices.Equal(got, []string{"a/title-short", "a/body-short"}) {
		t.Fatalf("ab = %v", got)
	}
	r := search(t, s, "keyword")
	if r.Hits[0].Part != "title" || r.Hits[1].Part != "body" {
		t.Fatalf("parts = %+v", r.Hits)
	}
}

// 複数の言葉は OR。総数は上限で切れても全部の数で、Offset で続きを取れる
func TestSearchTermsAreOredAndPaged(t *testing.T) {
	s := open(t, filepath.Join(t.TempDir(), "data.db"))
	putTexts(t, s,
		SearchText{Kind: "a", Ref: "1", Body: "apple pie"},
		SearchText{Kind: "a", Ref: "2", Body: "banana split"},
		SearchText{Kind: "a", Ref: "3", Body: "cherry tart"},
	)
	r, err := s.Search(SearchQuery{Terms: []string{"apple", "BANANA"}, Limit: 1})
	if err != nil || r.Total != 2 || len(r.Hits) != 1 {
		t.Fatalf("page 1 = %+v, %v", r, err)
	}
	next, err := s.Search(SearchQuery{Terms: []string{"apple", "BANANA"}, Limit: 1, Offset: 1})
	if err != nil || next.Total != 2 || len(next.Hits) != 1 || next.Hits[0].Ref == r.Hits[0].Ref {
		t.Fatalf("page 2 = %+v, %v", next, err)
	}
}

// 日本語 3 字は MATCH で横断検索の当たり、切り出しは当たった所の前後
func TestJapaneseTermsAndSnippets(t *testing.T) {
	s := open(t, filepath.Join(t.TempDir(), "data.db"))
	long := strings.Repeat("あ", 40) + "パスワード確認" + strings.Repeat("い", 40)
	putTexts(t, s, SearchText{Kind: "a", Ref: "1", Body: long}, SearchText{Kind: "a", Ref: "2", Body: "関係ない"})
	r := search(t, s, "パスワード")
	if len(r.Hits) != 1 || r.Hits[0].Ref != "1" {
		t.Fatalf("hits = %+v", r)
	}
	want := "…" + strings.Repeat("あ", SnippetAround) + "パスワード確認" + strings.Repeat("い", SnippetAround-2) + "…"
	if r.Hits[0].Snippet != want {
		t.Fatalf("snippet = %q; want %q", r.Hits[0].Snippet, want)
	}
	// 当たる所が見つからなければ頭から切る
	if got := Snippet("ＡＢＣ"+strings.Repeat("x", 80), []string{"abc"}); !strings.HasPrefix(got, "ＡＢＣ") || !strings.HasSuffix(got, "…") {
		t.Fatalf("head = %q", got)
	}
}

// 種類の絞り: 種類だけ、その種類の索引キーでの絞り。宣言に無いキーは ErrUnknownKey
func TestSearchKindFilters(t *testing.T) {
	s := open(t, filepath.Join(t.TempDir(), "data.db"))
	if err := s.SetKinds([]KindSpec{{Subject: "a", Keys: []KeySpec{{Name: "lane", Type: "text"}}}}); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Apply(Batch{
		Records: []RecordWrite{
			{Subject: "a", ID: "1", Body: json.RawMessage(`{"id":"1"}`), Keys: map[string]any{"lane": "todo"}},
			{Subject: "a", ID: "2", Body: json.RawMessage(`{"id":"2"}`), Keys: map[string]any{"lane": "done"}},
		},
		SearchTexts: []SearchText{
			{Kind: "a", Ref: "1", Body: "common words"},
			{Kind: "a", Ref: "2", Body: "common words"},
			{Kind: "b", Ref: "1", Body: "common words"},
		},
	}); err != nil {
		t.Fatal(err)
	}
	q := func(f ...KindFilter) ([]string, error) {
		r, err := s.Search(SearchQuery{Terms: []string{"common"}, Kinds: f, Limit: 50})
		got := refs(r)
		slices.Sort(got)
		return got, err
	}
	if got, _ := q(KindFilter{Kind: "b"}); !slices.Equal(got, []string{"b/1"}) {
		t.Fatalf("kind b = %v", got)
	}
	if got, _ := q(KindFilter{Kind: "a", Where: []Cond{{Key: "lane", Op: "eq", Value: "todo"}}}); !slices.Equal(got, []string{"a/1"}) {
		t.Fatalf("lane todo = %v", got)
	}
	if got, _ := q(KindFilter{Kind: "a", Where: []Cond{{Key: "lane", Op: "eq", Value: "todo"}}}, KindFilter{Kind: "b"}); !slices.Equal(got, []string{"a/1", "b/1"}) {
		t.Fatalf("two kinds = %v", got)
	}
	if _, err := q(KindFilter{Kind: "a", Where: []Cond{{Key: "nothing", Op: "eq", Value: "x"}}}); !errors.Is(err, ErrUnknownKey) {
		t.Fatalf("unknown key = %v", err)
	}
}

// 更新すると同じ行を差し替え、消すと当たらなくなる
func TestSearchTextsAreReplacedAndRemoved(t *testing.T) {
	s := open(t, filepath.Join(t.TempDir(), "data.db"))
	putTexts(t, s, SearchText{Kind: "a", Ref: "1", Body: "first version"})
	putTexts(t, s, SearchText{Kind: "a", Ref: "1", Body: "second edition"})
	if search(t, s, "first").Total != 0 || search(t, s, "second").Total != 1 {
		t.Fatal("the text was not replaced")
	}
	putTexts(t, s, SearchText{Kind: "a", Ref: "1", Removed: true})
	if search(t, s, "second").Total != 0 {
		t.Fatal("the removed text was found")
	}
}

// Keep が false の当たりは、横断検索の当たりにも総数にも入れず、数だけ Skipped に残す
func TestSearchKeepSkipsMatches(t *testing.T) {
	s := open(t, filepath.Join(t.TempDir(), "data.db"))
	putTexts(t, s,
		SearchText{Kind: "a", Ref: "1", Body: "common words"},
		SearchText{Kind: "a", Ref: "2", Body: "common words"},
		SearchText{Kind: "a", Ref: "3", Body: "common words"},
	)
	r, err := s.Search(SearchQuery{Terms: []string{"common"}, Limit: 1, Keep: func(_, ref string) bool { return ref != "2" }})
	if err != nil || r.Total != 2 || r.Skipped != 1 || len(r.Hits) != 1 || r.Hits[0].Ref == "2" {
		t.Fatalf("keep = %+v, %v", r, err)
	}
}
