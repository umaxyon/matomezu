package server

import (
	"encoding/json"
	"strings"
	"testing"
)

// 目次は、並びに直に入るページと、バインダの中のページを、並びの順にたどる（空のバインダは何も足さない）
func TestWalksTheLineupWithBinders(t *testing.T) {
	t.Parallel()
	const book = `{"id":"b1","title":"T","lineup":[` +
		`{"kind":"page","id":"p1","type":"@matomezu/drawing:drawing","title":"図"},` +
		`{"kind":"binder","id":"f1","title":"スライド","pageType":"@matomezu/slide-page:slide","lineup":[` +
		`{"kind":"page","id":"s1","type":"@matomezu/slide-page:slide","title":"1"},` +
		`{"kind":"page","id":"s2","type":"@matomezu/slide-page:slide","title":"2"}]},` +
		`{"kind":"binder","id":"f2","title":"空","pageType":"@matomezu/slide-page:slide","lineup":[]}]}`
	var ids []string
	for _, p := range pagesOfBook(json.RawMessage(book)) {
		var head struct{ ID string }
		_ = json.Unmarshal(p, &head)
		ids = append(ids, head.ID)
	}
	if strings.Join(ids, ",") != "p1,s1,s2" {
		t.Fatalf("pages = %v", ids)
	}
	outlined := string(outlineBook(json.RawMessage(book), func(string) int64 { return 3 }, func(string, string) (Referred, bool) { return Referred{}, false }))
	for _, want := range []string{
		`{"kind":"page","id":"p1","title":"図","type":"@matomezu/drawing:drawing","size":`,
		`{"kind":"binder","id":"f1","title":"スライド","pageType":"@matomezu/slide-page:slide","lineup":[{"kind":"page","id":"s1","title":"1","type":"@matomezu/slide-page:slide","size":`,
		`{"kind":"binder","id":"f2","title":"空","pageType":"@matomezu/slide-page:slide","lineup":[]}`,
	} {
		if !strings.Contains(outlined, want) {
			t.Fatalf("outline = %s; want %s", outlined, want)
		}
	}
	// ページには、そのページの版が付く
	if n := strings.Count(outlined, `,"version":3}`); n != 3 {
		t.Fatalf("outline = %s; want the version on each of the 3 pages", outlined)
	}
}
