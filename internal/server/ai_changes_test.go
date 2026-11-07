package server

import (
	"strings"
	"testing"
)

// AI の変更の記録: AI のアクションが変えたブックに 1 つ残り、窓が見たら消え、見られる前に消えたら AI のフックに一度だけ渡り、次に話しかけたら消える
func TestAIChangesUndoneBeforeSeen(t *testing.T) {
	s := newServer(t, nil)
	send(t, "PUT", s.URL+"/api/books-for-test/b1", `{"book":`+boxed+`,"base":0}`, nil)
	ai := map[string]string{"Authorization": "Bearer secret"}
	rename := `{"action":"@matomezu/base:book-update","args":{"title":"AI"},"on":{"book":"b1"}}`
	send(t, "POST", s.URL+"/api/ai/perform", rename, ai)
	send(t, "POST", s.URL+"/api/ai/perform", rename, ai)
	got := func() string {
		_, out := send(t, "GET", s.URL+"/api/ai/awaiting", "", ai)
		return out
	}
	if g := got(); !strings.HasSuffix(g, `"undone":[]}`) {
		t.Fatalf("awaiting before = %s", g)
	}
	// 1 つめは見えた、2 つめは見られる前に戻された
	send(t, "POST", s.URL+"/api/ai-changes", `{"client":"c1","book":"b1","act":1,"outcome":"seen"}`, nil)
	send(t, "POST", s.URL+"/api/ai-changes", `{"client":"c1","book":"b1","act":2,"outcome":"lost","lost":[{"at":"title","value":"AI"}]}`, nil)
	// 見えた物には、あとから消えたと知らされても変えない
	send(t, "POST", s.URL+"/api/ai-changes", `{"client":"c2","book":"b1","act":1,"outcome":"lost","lost":[{"at":"title","value":"AI"}]}`, nil)
	g := got()
	if !strings.Contains(g, `"undone":[{"book":"b1","title":"AI","at":"`) || strings.Count(g, `"lost":`) != 1 {
		t.Fatalf("awaiting after = %s", g)
	}
	// 渡した物は、話しかけるまで渡し続け、話しかけたら消える
	if g2 := got(); g2 != g {
		t.Fatalf("awaiting again = %s", g2)
	}
	send(t, "POST", s.URL+"/api/ai/talked", `{}`, ai)
	if g := got(); !strings.HasSuffix(g, `"undone":[]}`) {
		t.Fatalf("awaiting after talked = %s", g)
	}
	if code, _ := send(t, "POST", s.URL+"/api/ai-changes", `{"book":"b1","act":1,"outcome":"other"}`, nil); code != 400 {
		t.Fatalf("bad outcome = %d", code)
	}
}
