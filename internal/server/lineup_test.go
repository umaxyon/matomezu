package server

import (
	"encoding/json"
	"strings"
	"testing"
)

// 並びを歩く関数: フォルダの中のページも並びの順に読み、替えるときはフォルダの形（kind・id・title・pageType・lineup）を残す。空のフォルダもそのまま
func TestWalksTheLineupWithFolders(t *testing.T) {
	const book = `{"id":"b1","title":"T","lineup":[` +
		`{"kind":"page","id":"p1","type":"@matomezu/drawing:drawing","title":"図"},` +
		`{"kind":"folder","id":"f1","title":"スライド","pageType":"@matomezu/slide-book:slide","lineup":[` +
		`{"kind":"page","id":"s1","type":"@matomezu/slide-book:slide","title":"1"},` +
		`{"kind":"page","id":"s2","type":"@matomezu/slide-book:slide","title":"2"}]},` +
		`{"kind":"folder","id":"f2","title":"空","pageType":"@matomezu/slide-book:slide","lineup":[]}]}`
	var ids []string
	for _, p := range pagesOfBook(json.RawMessage(book)) {
		var head struct{ ID string }
		_ = json.Unmarshal(p, &head)
		ids = append(ids, head.ID)
	}
	if strings.Join(ids, ",") != "p1,s1,s2" {
		t.Fatalf("pages = %v", ids)
	}
	outlined := string(outlineBook(json.RawMessage(book)))
	for _, want := range []string{
		`{"kind":"page","id":"p1","title":"図","type":"@matomezu/drawing:drawing","size":`,
		`{"kind":"folder","id":"f1","title":"スライド","pageType":"@matomezu/slide-book:slide","lineup":[{"kind":"page","id":"s1","title":"1","type":"@matomezu/slide-book:slide","size":`,
		`{"kind":"folder","id":"f2","title":"空","pageType":"@matomezu/slide-book:slide","lineup":[]}`,
	} {
		if !strings.Contains(outlined, want) {
			t.Fatalf("outline = %s; want %s", outlined, want)
		}
	}
}
