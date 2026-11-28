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
	t.Parallel()
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
	marked := false
	for _, r := range recordsOf(t, s.URL, "@matomezu/base:workroom") {
		_, has := r["handoffTarget"]
		marked = marked || has
	}
	if !marked {
		t.Fatal("changing the work does not mark the handoff target again")
	}
	// 断られたバルクの頼みは覚えない
	broken := `{"actions":[{"action":"@matomezu/base:refresh-request","args":{"type":"@matomezu/markdown:markdown","title":"handoff 2"}},{"action":"@matomezu/base:page-update","args":{"title":"x"},"on":{"page":"none"}}]}`
	if got, _ := call(t, "POST", s.URL+"/api/ai/perform", broken, as); !strings.Contains(got, `"ok":false`) || !strings.Contains(got, `"at":1`) {
		t.Fatalf("a refused bulk = %s", got)
	}
	if due, _ := call(t, "POST", s.URL+"/api/ai/refresh-due", `{"sessionId":"SA"}`, nil); !strings.Contains(due, `"text":""`) {
		t.Fatalf("refresh-due after a refused bulk = %s", due)
	}
	// 渡す前に利用者が話しても、その頼みは捨てない（ターンの途中で打った言葉は同じターンに入り、そのターンの終わりに空にする）
	if got, _ := call(t, "POST", s.URL+"/api/ai/perform", strings.Replace(refresh, `"handoff"`, `"handoff 3"`, 1), as); !strings.HasPrefix(got, `{"ok":true`) {
		t.Fatalf("refresh-request again = %s", got)
	}
	call(t, "POST", s.URL+"/api/ai/talked", `{"sessionId":"SA","prompt":"hello"}`, nil)
	if due, _ := call(t, "POST", s.URL+"/api/ai/refresh-due", `{"sessionId":"SA"}`, nil); !strings.Contains(due, "matomezu: Your conversation was refreshed") {
		t.Fatalf("refresh-due after the user talked = %s", due)
	}
}

// ターンの終わりのフックが訊く、ターンを終える前にする事: 引継ぎ対象チケットがある間は引継ぎページの頼み。頼みを部品が受け取るまでは無し。
// 部品が受け取ったのに、空にしたあとの会話がその文で始まらなければ、空にならなかった事を 1 度だけ。始まれば無し。会話を空にできると名乗っていなければ、いつも無し
func TestHandoffDueAsksForTheHandoffPageUntilTheConversationIsCleared(t *testing.T) {
	t.Parallel()
	s, _ := joinWorld(t, joinStore(t))
	a := joinedIn(t, s.URL, "LA", "100", "SA", "ひよこ")
	noticeOf(t, s.URL, a)
	var project string
	for id := range recordsOf(t, s.URL, "@matomezu/taskboard:project") {
		project = id
	}
	for _, name := range []string{"x", "y", "z"} {
		if code, got := postPerform(t, s.URL, `{"action":"@matomezu/taskboard:ticket-add","args":{"project":"`+project+`","name":"`+name+`","assignees":["ひよこ"]}}`); code != 200 || !strings.Contains(got, `"ok":true`) {
			t.Fatalf("ticket-add %s = %d %s", name, code, got)
		}
	}
	ids := map[string]string{}
	for id, r := range recordsOf(t, s.URL, "@matomezu/taskboard:ticket") {
		ids[r["name"].(string)] = id
	}
	as := map[string]string{aiwire.ParticipantHeader: a}
	start := func(name string) {
		t.Helper()
		if got, _ := call(t, "POST", s.URL+"/api/ai/perform", `{"action":"@matomezu/taskboard:ticket-start","args":{},"on":{"record":"`+ids[name]+`"}}`, as); !strings.HasPrefix(got, `{"ok":true`) {
			t.Fatalf("ticket-start %s = %s", name, got)
		}
	}
	text := func(path string) string {
		t.Helper()
		var got struct{ Text string }
		out, _ := call(t, "POST", s.URL+path, `{"sessionId":"SA"}`, nil)
		if json.Unmarshal([]byte(out), &got) != nil {
			t.Fatalf("%s = %s", path, out)
		}
		return got.Text
	}
	start("x")
	start("y")
	if got := text("/api/ai/handoff-due"); got != "" {
		t.Fatalf("handoff-due before the announcement = %q", got)
	}
	call(t, "POST", s.URL+"/api/ai/talked", `{"sessionId":"SA","refreshable":true}`, nil)
	if got := text("/api/ai/handoff-due"); !strings.Contains(got, "@matomezu/base:refresh-request") {
		t.Fatalf("handoff-due with a handoff target = %q", got)
	}
	refresh := `{"action":"@matomezu/base:refresh-request","args":{"type":"@matomezu/markdown:markdown","title":"handoff"}}`
	if got, _ := call(t, "POST", s.URL+"/api/ai/perform", refresh, as); !strings.HasPrefix(got, `{"ok":true`) {
		t.Fatalf("refresh-request = %s", got)
	}
	if got := text("/api/ai/handoff-due"); got != "" {
		t.Fatalf("handoff-due before the part takes the request = %q", got)
	}
	// 部品が受け取ったが、空にしたあとの会話が始まらない: 1 度だけ伝える
	if got := text("/api/ai/refresh-due"); got == "" {
		t.Fatal("refresh-due answered nothing")
	}
	if got := text("/api/ai/handoff-due"); !strings.Contains(got, "could not be cleared") {
		t.Fatalf("handoff-due after the conversation was not cleared = %q", got)
	}
	if got := text("/api/ai/handoff-due"); got != "" {
		t.Fatalf("handoff-due told twice = %q", got)
	}
	// 空にしたあとの会話がその文で始まれば、伝えない
	start("z")
	if got, _ := call(t, "POST", s.URL+"/api/ai/perform", strings.Replace(refresh, `"handoff"`, `"handoff 2"`, 1), as); !strings.HasPrefix(got, `{"ok":true`) {
		t.Fatalf("refresh-request 2 = %s", got)
	}
	lent := text("/api/ai/refresh-due")
	body, _ := json.Marshal(map[string]any{"sessionId": "SB", "prompt": lent})
	call(t, "POST", s.URL+"/api/ai/talked", string(body), nil)
	if got := text("/api/ai/handoff-due"); got != "" {
		t.Fatalf("handoff-due after the conversation was cleared = %q", got)
	}
}

// AI の perform に actions を並べると、順に行い、結果を並べた順に返す。断られたら何番目かを添えて何も変えない。action と actions を両方渡すと断る
func TestAIPerformsActionsInABulk(t *testing.T) {
	t.Parallel()
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
	t.Parallel()
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
