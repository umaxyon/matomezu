package server

import (
	"encoding/json"
	"net/http"
	"net/url"
	"strings"
	"testing"

	"github.com/umaxyon/matomezu/internal/aiwire"
)

// AI がリフレッシュリクエストを受けさせると、常駐は、話しかけのフックが会話を空にできると名乗った参加者のときだけ引継ぎページを書いて覚え、
// AI のプログラムの部品が訊いたら matomezu: で始まる文を 1 度だけ渡す。渡した文で始まるターンは、利用者の話に数えない
func TestRefreshRequestIsKeptOnlyForARefreshableAI(t *testing.T) {
	s, hub := joinWorld(t, joinStore(t))
	a := joinedIn(t, s.URL, "LA", "100", "SA", "ひよこ")
	noticeOf(t, s.URL, a)
	var project string
	for id := range recordsOf(t, s.URL, "@matomezu/taskboard:project") {
		project = id
	}
	for _, name := range []string{"x", "y"} {
		if code, got := postPerform(t, s.URL, `{"action":"@matomezu/taskboard:ticket-add","args":{"project":"`+project+`","name":"`+name+`","assignees":["ひよこ"]}}`); code != 200 || !strings.Contains(got, `"ok":true`) {
			t.Fatalf("ticket-add %s = %d %s", name, code, got)
		}
	}
	var x, y string
	for id, r := range recordsOf(t, s.URL, "@matomezu/taskboard:ticket") {
		switch r["name"] {
		case "x":
			x = id
		case "y":
			y = id
		}
	}
	as := map[string]string{aiwire.ParticipantHeader: a}
	if got, _ := call(t, "POST", s.URL+"/api/ai/perform", `{"action":"@matomezu/taskboard:ticket-start","args":{},"on":{"record":"`+y+`"}}`, as); !strings.HasPrefix(got, `{"ok":true`) {
		t.Fatalf("ticket-start = %s", got)
	}
	refresh := `{"action":"@matomezu/base:refresh-request","args":{"type":"@matomezu/markdown:markdown","title":"handoff"}}`
	if got, _ := call(t, "POST", s.URL+"/api/ai/perform", refresh, as); !strings.Contains(got, "has not told matomezu") {
		t.Fatalf("refresh-request before the announcement = %s", got)
	}
	if got, _ := call(t, "POST", s.URL+"/api/ai/talked", `{"sessionId":"SA","refreshable":true}`, nil); got == "" {
		t.Fatal("talked answered nothing")
	}
	got, _ := call(t, "POST", s.URL+"/api/ai/perform", refresh, as)
	var done struct {
		OK     bool
		Result struct{ Page, Book string }
	}
	if json.Unmarshal([]byte(got), &done) != nil || !done.OK || done.Result.Page == "" {
		t.Fatalf("refresh-request = %s", got)
	}
	var due struct{ Text string }
	out, _ := call(t, "POST", s.URL+"/api/ai/refresh-due", `{"sessionId":"SA"}`, nil)
	if json.Unmarshal([]byte(out), &due) != nil || !strings.HasPrefix(due.Text, "matomezu: Your conversation was refreshed") || !strings.Contains(due.Text, done.Result.Page) {
		t.Fatalf("refresh-due = %s", out)
	}
	if !hub.WokenBy(due.Text) {
		t.Fatal("the turn started by the refresh text counts as the user's")
	}
	if again, _ := call(t, "POST", s.URL+"/api/ai/refresh-due", `{"sessionId":"SA"}`, nil); !strings.Contains(again, `"text":""`) {
		t.Fatalf("refresh-due again = %s", again)
	}
	// 書けたら引継ぎ対象チケットを外す。作業を替えれば、また印が付く
	for _, r := range recordsOf(t, s.URL, "@matomezu/base:workroom") {
		if _, has := r["handoffTarget"]; has {
			t.Fatalf("the handoff target is left after refresh-request: %v", r)
		}
	}
	if got, _ := call(t, "POST", s.URL+"/api/ai/perform", `{"action":"@matomezu/taskboard:ticket-start","args":{},"on":{"record":"`+x+`"}}`, as); !strings.HasPrefix(got, `{"ok":true`) {
		t.Fatalf("ticket-start x = %s", got)
	}
	// 断られたバルクの頼みは覚えない
	broken := `{"actions":[{"action":"@matomezu/base:refresh-request","args":{"type":"@matomezu/markdown:markdown","title":"handoff 2"}},{"action":"@matomezu/base:page-update","args":{"title":"x"},"on":{"page":"none"}}]}`
	if got, _ := call(t, "POST", s.URL+"/api/ai/perform", broken, as); !strings.Contains(got, `"ok":false`) || !strings.Contains(got, `"at":1`) {
		t.Fatalf("a refused bulk = %s", got)
	}
	if due, _ := call(t, "POST", s.URL+"/api/ai/refresh-due", `{"sessionId":"SA"}`, nil); !strings.Contains(due, `"text":""`) {
		t.Fatalf("refresh-due after a refused bulk = %s", due)
	}
	// 渡す前に利用者が話したら、その頼みは捨てる
	if got, _ := call(t, "POST", s.URL+"/api/ai/perform", strings.Replace(refresh, `"handoff"`, `"handoff 3"`, 1), as); !strings.HasPrefix(got, `{"ok":true`) {
		t.Fatalf("refresh-request again = %s", got)
	}
	call(t, "POST", s.URL+"/api/ai/talked", `{"sessionId":"SA","prompt":"hello"}`, nil)
	if due, _ := call(t, "POST", s.URL+"/api/ai/refresh-due", `{"sessionId":"SA"}`, nil); !strings.Contains(due, `"text":""`) {
		t.Fatalf("refresh-due after the user talked = %s", due)
	}
}

// AI の perform に actions を並べると、順に行い、結果を並べた順に返す。断られたら何番目かを添えて何も変えない。action と actions を両方渡すと断る
func TestAIPerformsActionsInABulk(t *testing.T) {
	s, _ := joinWorld(t, joinStore(t))
	a := joinedIn(t, s.URL, "LA", "100", "SA", "ひよこ")
	noticeOf(t, s.URL, a)
	as := map[string]string{aiwire.ParticipantHeader: a}
	add := func(title string) string {
		return `{"action":"@matomezu/base:worker-page-add","args":{"type":"@matomezu/markdown:markdown","title":"` + title + `"}}`
	}
	got, _ := call(t, "POST", s.URL+"/api/ai/perform", `{"actions":[`+add("one")+`,`+add("two")+`]}`, as)
	var done struct {
		OK      bool
		Results []struct{ Page, Book string }
	}
	if json.Unmarshal([]byte(got), &done) != nil || !done.OK || len(done.Results) != 2 || done.Results[0].Page == done.Results[1].Page {
		t.Fatalf("two worker-page-add = %s", got)
	}
	book := func() string {
		out, _ := call(t, "GET", s.URL+"/api/ai/books/"+done.Results[0].Book, "", as)
		return out
	}
	if got, _ := call(t, "POST", s.URL+"/api/ai/perform", `{"actions":[`+add("three")+`,{"action":"@matomezu/base:page-update","args":{"title":"x"},"on":{"page":"none"}}]}`, as); !strings.Contains(got, `"ok":false`) || !strings.Contains(got, `"at":1`) {
		t.Fatalf("a refused bulk = %s", got)
	}
	if b := book(); !strings.Contains(b, `"two"`) || strings.Contains(b, `"three"`) {
		t.Fatalf("book after a refused bulk = %s", b)
	}
	if got, _ := call(t, "POST", s.URL+"/api/ai/perform", `{"action":"@matomezu/base:page-update","actions":[`+add("four")+`]}`, as); !strings.Contains(got, `"reason":"bad-args"`) {
		t.Fatalf("action and actions = %s", got)
	}
}

// AI の呼び出しの答えの見出しには、呼び出しのあとの作業名が載る（作業を替えた perform の答えには、替えたあとの名前）
func TestAICallsCarryTheWorkTitle(t *testing.T) {
	s, _ := joinWorld(t, joinStore(t))
	a := joinedIn(t, s.URL, "LA", "100", "SA", "ひよこ")
	noticeOf(t, s.URL, a)
	as := map[string]string{aiwire.ParticipantHeader: a}
	titleOf := func(h http.Header) string {
		v, _ := url.QueryUnescape(h.Get(aiwire.WorkTitleHeader))
		return v
	}
	_, h := call(t, "GET", s.URL+"/api/ai/books", "", as)
	if got := titleOf(h); !strings.HasPrefix(got, "ひよこ") {
		t.Fatalf("work title before = %q", got)
	}
	var project string
	for id := range recordsOf(t, s.URL, "@matomezu/taskboard:project") {
		project = id
	}
	_, h = call(t, "POST", s.URL+"/api/ai/perform", `{"action":"@matomezu/taskboard:ticket-add","args":{"project":"`+project+`","name":"xyz","assignees":["ひよこ"]}}`, as)
	if got := titleOf(h); !strings.Contains(got, "xyz") {
		t.Fatalf("work title after ticket-add = %q", got)
	}
}
