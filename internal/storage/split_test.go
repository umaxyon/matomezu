package storage

import (
	"encoding/json"
	"maps"
	"testing"
)

// ブックの本文は、ブックのフォルダ（並びはエントリの id）・バインダ（kind を外し、ほかのフィールドは残す）・ページ（本文のバイトそのまま）に分かれ、
// Entries はエントリの id → 入っているフォルダになる。分けられないエントリ（kind が違う・id が無い・もう使われている id）は、フォルダの並びに中身ごと残る
func TestSplitBookSplitsIntoFoldersAndPages(t *testing.T) {
	taken := map[string]bool{"used": true}
	split, ok := SplitBook(json.RawMessage(`{"id":"b1","title":"T","lineup":[`+
		`{"kind":"page","id":"p1",  "items":[ {"id":"i"} ]},`+
		`{"kind":"binder","id":"f1","title":"B","pageType":"x:slide","lineup":[{"kind":"page","id":"p2"},{"kind":"page","id":"p1","again":true}]},`+
		`{"kind":"memo","id":"m1"},{"kind":"page"},{"kind":"page","id":"used"}]}`), taken)
	if !ok {
		t.Fatal("the book was not split")
	}
	rows := func(list []Row) []string {
		out := []string{}
		for _, r := range list {
			out = append(out, r.ID+" "+string(r.Body))
		}
		return out
	}
	if got := rows(split.Folders); !same(got, []string{
		`b1 {"folderRole":"book","id":"b1","lineup":[{"id":"p1","kind":"page"},{"id":"f1","kind":"binder"},{"kind":"memo","id":"m1"},{"kind":"page"},{"kind":"page","id":"used"}],"title":"T"}`,
		`f1 {"folderRole":"binder","id":"f1","lineup":[{"id":"p2","kind":"page"},{"kind":"page","id":"p1","again":true}],"pageType":"x:slide","title":"B"}`,
	}) {
		t.Fatalf("folders = %q", got)
	}
	if got := rows(split.Pages); !same(got, []string{`p1 {"kind":"page","id":"p1",  "items":[ {"id":"i"} ]}`, `p2 {"kind":"page","id":"p2"}`}) {
		t.Fatalf("pages = %q", got)
	}
	if !maps.Equal(split.Entries, map[string]string{"p1": "b1", "f1": "b1", "p2": "f1"}) {
		t.Fatalf("entries = %v", split.Entries)
	}
	// 分けた id は、使われている id に足される
	if !maps.Equal(taken, map[string]bool{"used": true, "b1": true, "f1": true, "p1": true, "p2": true}) {
		t.Fatalf("taken = %v", taken)
	}
}

// 本文が読めない・id が無い・id がもう使われているブックは、分けない
func TestSplitBookRefusesAnUnreadableBook(t *testing.T) {
	for name, body := range map[string]string{
		"not json": `not json`,
		"no id":    `{"title":"T","lineup":[]}`,
		"taken id": `{"id":"used","lineup":[{"kind":"page","id":"p1"}]}`,
	} {
		taken := map[string]bool{"used": true}
		if split, ok := SplitBook(json.RawMessage(body), taken); ok || len(split.Folders) != 0 || len(split.Pages) != 0 || len(taken) != 1 {
			t.Fatalf("%s: split = %+v, %v (taken %v); want not split", name, split, ok, taken)
		}
	}
}

// lineup が並びでないブックは分けない（中身を失わない）。lineup の無いブックは、lineup を足さずにフォルダにする。lineup が並びでないバインダは、ブックの並びに中身ごと残る
func TestSplitBookKeepsWhatIsNotALineup(t *testing.T) {
	if _, ok := SplitBook(json.RawMessage(`{"id":"b1","lineup":{"keep":"me"}}`), nil); ok {
		t.Fatal("a book whose lineup is not a list was split")
	}
	bare, ok := SplitBook(json.RawMessage(`{"id":"b1","title":"T"}`), nil)
	if !ok || len(bare.Folders) != 1 || string(bare.Folders[0].Body) != `{"folderRole":"book","id":"b1","title":"T"}` {
		t.Fatalf("a book with no lineup = %+v, %v", bare, ok)
	}
	odd, ok := SplitBook(json.RawMessage(`{"id":"b1","lineup":[{"kind":"binder","id":"f1","lineup":"oops"}]}`), nil)
	if !ok || len(odd.Folders) != 1 || string(odd.Folders[0].Body) != `{"folderRole":"book","id":"b1","lineup":[{"kind":"binder","id":"f1","lineup":"oops"}]}` {
		t.Fatalf("a binder whose lineup is not a list = %+v, %v", odd, ok)
	}
}
