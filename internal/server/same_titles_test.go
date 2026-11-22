package server

import (
	"regexp"
	"strings"
	"testing"
)

// AI がブックの名前を、同じフォルダの中の別のブックと同じ名前に変えようとすると、断りの種類 title-taken で断られる
func TestTheAICannotRenameABookOntoATakenTitle(t *testing.T) {
	s, _ := newServerOn(t, Options{}, libraryStore(t, true))
	header := joinedAI(t, s)
	perform := func(body string) string {
		_, got := send(t, "POST", s.URL+"/api/ai/perform", body, header)
		return got
	}
	if got := perform(`{"action":"@matomezu/base:book-create","args":{"title":"N"}}`); !strings.HasPrefix(got, `{"ok":true`) {
		t.Fatalf("book-create = %s", got)
	}
	if got := perform(`{"action":"@matomezu/base:book-create","args":{"title":"N"}}`); !strings.Contains(got, "title-taken") {
		t.Fatalf("book-create on a taken title = %s", got)
	}
	made := perform(`{"action":"@matomezu/base:book-create","args":{"title":"M"}}`)
	found := regexp.MustCompile(`"book":"([^"]+)"`).FindStringSubmatch(made)
	if found == nil {
		t.Fatalf("book-create = %s", made)
	}
	id := found[1]
	if got := perform(`{"action":"@matomezu/base:book-update","args":{"title":"N"},"on":{"book":"` + id + `"}}`); !strings.Contains(got, "title-taken") {
		t.Fatalf("book-update on a taken title = %s", got)
	}
}

// 名前が当たった相手がシステムフォルダなら、AI への断りに、その印（systemFolder）が添わる
func TestATitleTakenByASystemFolderNamesItsMark(t *testing.T) {
	s, _ := newServerOn(t, Options{}, libraryStore(t, true))
	header := joinedAI(t, s)
	_, got := send(t, "POST", s.URL+"/api/ai/perform", `{"action":"@matomezu/base:book-create","args":{"title":"Documents","into":"library-home"}}`, header)
	if !strings.Contains(got, `"kind":"title-taken"`) || !strings.Contains(got, `"systemFolder":"@matomezu/base:documents"`) {
		t.Fatalf("book-create on the title of Documents = %s", got)
	}
}
